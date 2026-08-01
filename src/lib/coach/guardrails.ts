import { MAX_LINE_CHARS } from "./protocol";

/**
 * Output guardrails for the optional coach (issue #11, phase 2).
 *
 * The model is asked only to rephrase a sentence the app already produced
 * from the user's own data. Enforcing that on the way back cannot be done
 * with a denylist of forbidden words: the app's own vocabulary includes
 * "Working memory" and "Attention", so banning the words that carry the
 * dangerous claims would also reject faithful rephrasings of real insights.
 *
 * So the primary check is the other way round — an *allowlist*. Every
 * content word in the output must come from the source sentence or from a
 * small closed set of connective and warmth words. A model that adds
 * "…and strengthens your memory" introduces a content word ("strengthens")
 * that is in neither set, and is rejected without anyone having had to
 * predict that particular sentence.
 *
 * Three further checks close the remaining gaps: numbers must match the
 * source including their units (so a streak count cannot be relabelled as a
 * percentile), the output must actually resemble the source (so refusals and
 * unrelated text cannot render), and length is bounded (so there is little
 * room to append anything).
 *
 * Over-rejection is the safe direction: the caller falls back to the
 * deterministic sentence, which was always correct.
 */

export interface GuardrailResult {
  ok: boolean;
  /** Machine-readable reason, for logging and tests. */
  reason?: string;
}

/** Output may be at most this multiple of the source's length. */
const MAX_LENGTH_RATIO = 1.8;
/** At least this share of the source's content words must survive. */
const MIN_SOURCE_OVERLAP = 0.4;
/** Words this long or shorter are compared whole; longer ones by prefix. */
const STEM_PREFIX = 4;

/**
 * Function and warmth words a rephrasing may use freely. Deliberately
 * contains nothing that could carry a claim about a person's abilities,
 * health or results — no "improve", "boost", "sharper", "stronger".
 */
const SAFE_WORDS = new Set(
  // English
  (
    "a an the this that these those and or but so if then than as at by for from in into of on to " +
    "with without your yours you you're it its it's is are was were be been being am do does did " +
    "done doing have has had having will would can could may might just still again more less only " +
    "even now today tomorrow yesterday soon back up down out off over under here there when while " +
    "keep keeps keeping kept stay stays staying stayed go goes going went get gets getting got " +
    "take takes taking took give gives giving make makes making made put puts try tries trying " +
    "one two both each every all some any no not none nice good great well fine ok okay lovely " +
    "little bit short shorter quick quickly slow slower easy easier gentle gently steady simply " +
    "simple gone alive running run runs day days time times yes " +
    // Swedish
    "en ett den det de dessa och eller men så om då som av på i till från med utan din ditt dina " +
    "du dig är var vara varit har hade ha kan kunde ska skulle vill bara ändå igen mer mindre " +
    "endast nu idag imorgon igår snart tillbaka upp ner ut över under här där när medan " +
    "håll håller hålla höll stanna stannar gå går gick ta tar ger göra gör gjorde lägg lägger " +
    "försök försöker en två båda varje alla några ingen inte bra fin fint kort kortare snabb " +
    "snabbt enkel enkelt lugnt stadigt kvar liv levande dag dagar gång gånger lite ja jo"
  ).split(/\s+/),
);

/**
 * A last-resort denylist. The allowlist above is the real defence; this
 * catches the small number of dangerous words that could otherwise slip in
 * *because they appear in the source* — and flags obvious model misbehaviour.
 * Patterns are prefix-matched (no trailing word boundary) because Swedish
 * compounds freely: "demensrisken" must be caught by "demens".
 */
const HARD_DENY: RegExp[] = [
  /\biq\b/iu,
  /\bdiagnos/iu,
  /\bmedicin/iu,
  /\bmedical/iu,
  /\bclinical/iu,
  /\bdement/iu,
  /\bdemens/iu,
  /\balzheimer/iu,
  /\badhd\b/iu,
  /\bintelligen/iu,
  /\bcure/iu,
  /\bprescrib/iu,
  /\bläkare/iu,
  /\bdoctor/iu,
  /\bpatient/iu,
];

/** Refusals, preambles and assistant voice must never render as an insight. */
const MODEL_VOICE: RegExp[] = [
  /\bas an ai\b/iu,
  /\bi'?m sorry\b/iu,
  /\bi cannot\b/iu,
  /\bi can'?t\b/iu,
  /\bhere (?:is|are)\b/iu,
  /\brewrit/iu,
  /\bsure[,!]/iu,
  /\bjag kan inte\b/iu,
  /\btyvärr kan jag\b/iu,
];

/** Spelled-out numerals, which digit checks would otherwise miss. */
const NUMBER_WORDS =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|percent|per cent|half|double|triple|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv|tjugo|trettio|fyrtio|femtio|hundra|procent|hälften|dubbelt)\b/iu;

/** Strip punctuation and lowercase, keeping letters (incl. åäö) and digits. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}\s%]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function stem(word: string): string {
  return word.length > STEM_PREFIX ? word.slice(0, STEM_PREFIX) : word;
}

/** Normalise any Unicode decimal digits to ASCII so checks cannot be evaded. */
function normaliseDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => String(Number(d)));
}

/**
 * Numbers paired with the unit token that follows them, e.g. "5 day",
 * "82 %". Binding the unit stops a value from being reused as a different
 * statistic ("5-day streak" becoming "5% ahead of other users").
 */
function numberUnits(text: string): Set<string> {
  const normalised = normaliseDigits(text.toLowerCase());
  const pairs = new Set<string>();
  const re = /(\d+)\s*(%|[\p{L}]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalised))) {
    const value = String(Number(m[1]));
    const unit = m[2] ? stem(m[2]) : "";
    pairs.add(`${value}|${unit}`);
  }
  return pairs;
}

function bareNumbers(text: string): Set<string> {
  const normalised = normaliseDigits(text);
  return new Set((normalised.match(/\d+/g) ?? []).map((n) => String(Number(n))));
}

/**
 * Validate rephrased lines against the source lines the model was given.
 * `sources[i]` is the deterministic sentence for `generated[i]`, already
 * rendered in the locale the model was asked to answer in — which is what
 * lets the same word-level checks work for both languages.
 */
export function validateCoachLines(sources: string[], generated: string[]): GuardrailResult {
  if (generated.length !== sources.length) return { ok: false, reason: "line-count-mismatch" };

  for (let i = 0; i < generated.length; i++) {
    const line = generated[i].trim();
    const source = sources[i];
    if (!line) return { ok: false, reason: "empty-line" };
    if (line.length > MAX_LINE_CHARS) return { ok: false, reason: "too-long" };
    if (line.length > source.length * MAX_LENGTH_RATIO) return { ok: false, reason: "too-long" };

    for (const pattern of MODEL_VOICE) {
      if (pattern.test(line)) return { ok: false, reason: "model-voice" };
    }
    for (const pattern of HARD_DENY) {
      if (pattern.test(line)) return { ok: false, reason: `banned-term:${pattern.source}` };
    }

    // Numbers: none invented, none dropped, none re-attached to a new unit.
    const sourceNumbers = bareNumbers(source);
    const lineNumbers = bareNumbers(line);
    for (const n of lineNumbers) {
      if (!sourceNumbers.has(n)) return { ok: false, reason: `invented-number:${n}` };
    }
    for (const n of sourceNumbers) {
      if (!lineNumbers.has(n)) return { ok: false, reason: `dropped-number:${n}` };
    }
    const sourceUnits = numberUnits(source);
    for (const pair of numberUnits(line)) {
      if (!sourceUnits.has(pair)) return { ok: false, reason: `renumbered:${pair}` };
    }
    // A spelled-out numeral is a statistic the digit checks cannot see.
    const numberWord = line.match(NUMBER_WORDS);
    if (numberWord && !NUMBER_WORDS.test(source)) {
      return { ok: false, reason: `number-word:${numberWord[0].toLowerCase()}` };
    }

    // Allowlist: every content word must come from the source or the safe set.
    const sourceStems = new Set(words(source).map(stem));
    for (const word of words(line)) {
      if (SAFE_WORDS.has(word) || /^\d+$/.test(word)) continue;
      if (sourceStems.has(stem(word))) continue;
      return { ok: false, reason: `added-word:${word}` };
    }

    // Faithfulness floor: the output must still be about this insight.
    const sourceContent = words(source).filter((w) => !SAFE_WORDS.has(w));
    if (sourceContent.length > 0) {
      const lineStems = new Set(words(line).map(stem));
      const kept = sourceContent.filter((w) => lineStems.has(stem(w))).length;
      if (kept / sourceContent.length < MIN_SOURCE_OVERLAP) {
        return { ok: false, reason: "unfaithful" };
      }
    }
  }
  return { ok: true };
}

/**
 * Pull the model's lines out of a raw completion. Accepts one line per fact,
 * tolerating list markers and blank lines, and nothing else.
 */
export function parseCoachLines(raw: string, expected: number): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^\s*\*+|\*+\s*$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return lines.length === expected ? lines : null;
}
