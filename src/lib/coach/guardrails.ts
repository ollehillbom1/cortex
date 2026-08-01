import { MAX_LINE_CHARS } from "./protocol";

/**
 * Output guardrails for the optional coach (issue #11, phase 2).
 *
 * The model is only ever asked to rephrase sentences the app already
 * generated from its own data. These checks enforce that contract on the way
 * back: anything that adds a number, makes a health-adjacent claim, changes
 * the number of lines, or runs long is rejected outright and the app falls
 * back to its deterministic wording. Rejection is cheap; a bogus claim shown
 * to a user is not.
 */

export interface GuardrailResult {
  ok: boolean;
  /** Machine-readable reason, for logging and tests. */
  reason?: string;
}

/**
 * Words that would turn an observation about in-app results into a claim
 * about health or cognition, which docs/measurement.md forbids everywhere in
 * the product. Matched case-insensitively on word boundaries.
 */
const BANNED_PATTERNS: RegExp[] = [
  /\biq\b/i,
  /\bintelligen(?:ce|t)\b/i,
  /\bdiagnos(?:e|is|ed|tic)\b/i,
  /\bmedical\b/i,
  /\bclinical\b/i,
  /\btherap(?:y|eutic)\b/i,
  /\btreat(?:s|ed|ment|ments)?\b/i,
  /\bcures?\b/i,
  /\bsymptoms?\b/i,
  /\bdementia\b/i,
  /\balzheimer'?s?\b/i,
  /\badhd\b/i,
  /\bdyslexi(?:a|c)\b/i,
  /\bbrain age\b/i,
  /\bcognitive (?:decline|health|function|ability)\b/i,
  /\bneuroplasticity\b/i,
  /\bprescrib(?:e|ed|es)\b/i,
  /\bdoctor\b/i,
  /\bpatients?\b/i,
  // Swedish equivalents, since the coach may answer in Swedish.
  /\bdiagnos(?:er|tisera)?\b/i,
  /\bmedicinsk[at]?\b/i,
  /\bbehandl(?:a|ing|ar)\b/i,
  /\bdemens\b/i,
  /\bintelligens\b/i,
  /\bläkare\b/i,
];

/** All digit runs in a string, as canonical numeric strings. */
function numbersIn(text: string): string[] {
  return (text.match(/\d+/g) ?? []).map((n) => String(Number(n)));
}

/**
 * Validate rephrased lines against the source lines the model was given.
 *
 * `sources[i]` is the deterministic sentence for `generated[i]`.
 */
export function validateCoachLines(sources: string[], generated: string[]): GuardrailResult {
  if (generated.length !== sources.length) return { ok: false, reason: "line-count-mismatch" };

  for (let i = 0; i < generated.length; i++) {
    const line = generated[i].trim();
    if (!line) return { ok: false, reason: "empty-line" };
    if (line.length > MAX_LINE_CHARS) return { ok: false, reason: "too-long" };

    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(line)) return { ok: false, reason: `banned-term:${pattern.source}` };
    }

    // No invented statistics: every number in the output must already appear
    // in the fact it was derived from.
    const allowed = new Set(numbersIn(sources[i]));
    for (const n of numbersIn(line)) {
      if (!allowed.has(n)) return { ok: false, reason: `invented-number:${n}` };
    }
  }
  return { ok: true };
}

/**
 * Pull the model's lines out of a raw completion. Accepts one line per fact,
 * tolerating list markers and blank lines, and nothing else — no JSON
 * parsing games, no partial acceptance.
 */
export function parseCoachLines(raw: string, expected: number): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return lines.length === expected ? lines : null;
}
