import { ALL_EXERCISE_IDS, EXERCISES, MODALITY_LABELS, type ExerciseId } from "@/lib/domain/types";
import { DAY_PARTS, DAY_PART_LABELS, type DayPart } from "@/lib/stats/aggregate";

/**
 * Wire format between the browser and the optional coach endpoint
 * (issue #11, phase 2).
 *
 * The browser sends *structured facts*, never sentences: every field is a
 * number or a value from a closed enum, so no free text — and therefore no
 * profile name or other personal data — can leave the device even by
 * accident. The server renders the English sentence from its own copy of the
 * templates, which is what makes "every generated sentence traces to a
 * structured fact" enforceable rather than aspirational.
 */

export type InsightFact =
  | { kind: "streak-at-risk"; days: number }
  | { kind: "modality-imbalance"; modality: string; suggestion: ExerciseId | null }
  | { kind: "late-session-drop" }
  | { kind: "best-time-of-day"; part: DayPart; bestPct: number; worstPct: number };

export type InsightFactKind = InsightFact["kind"];

export const MAX_FACTS = 4;
/** Generous cap; a coach line longer than this is a red flag, not prose. */
export const MAX_LINE_CHARS = 240;

export type CoachLocale = "en" | "sv";
export const COACH_LOCALES: CoachLocale[] = ["en", "sv"];

export interface CoachRequest {
  facts: InsightFact[];
  locale: CoachLocale;
}

const MODALITY_KEYS = Object.keys(MODALITY_LABELS);

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Strictly validate an untrusted request body. Returns null on anything
 * unexpected — this is the only door into the outbound LLM call, so it
 * rejects rather than coerces.
 */
export function parseCoachRequest(body: unknown): CoachRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { facts, locale } = body as { facts?: unknown; locale?: unknown };
  if (!COACH_LOCALES.includes(locale as CoachLocale)) return null;
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > MAX_FACTS) return null;

  const parsed: InsightFact[] = [];
  for (const raw of facts) {
    const fact = parseFact(raw);
    if (!fact) return null;
    parsed.push(fact);
  }
  return { facts: parsed, locale: locale as CoachLocale };
}

function parseFact(raw: unknown): InsightFact | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  switch (f.kind) {
    case "streak-at-risk":
      return isFiniteInRange(f.days, 1, 10_000) ? { kind: "streak-at-risk", days: f.days } : null;
    case "modality-imbalance": {
      if (typeof f.modality !== "string" || !MODALITY_KEYS.includes(f.modality)) return null;
      const suggestion = f.suggestion;
      if (suggestion !== null && !ALL_EXERCISE_IDS.includes(suggestion as ExerciseId)) return null;
      return {
        kind: "modality-imbalance",
        modality: f.modality,
        suggestion: suggestion as ExerciseId | null,
      };
    }
    case "late-session-drop":
      return { kind: "late-session-drop" };
    case "best-time-of-day": {
      if (!DAY_PARTS.includes(f.part as DayPart)) return null;
      if (!isFiniteInRange(f.bestPct, 0, 100) || !isFiniteInRange(f.worstPct, 0, 100)) return null;
      return {
        kind: "best-time-of-day",
        part: f.part as DayPart,
        bestPct: Math.round(f.bestPct),
        worstPct: Math.round(f.worstPct),
      };
    }
    default:
      return null;
  }
}

/**
 * Render the canonical English sentence for a fact. The server builds the
 * prompt from these — the browser's own wording is never transmitted.
 */
export function renderFactEnglish(fact: InsightFact): string {
  switch (fact.kind) {
    case "streak-at-risk":
      return `A short session today keeps the ${fact.days}-day streak alive.`;
    case "modality-imbalance": {
      const modality = MODALITY_LABELS[fact.modality as keyof typeof MODALITY_LABELS];
      return fact.suggestion
        ? `${modality} has had little attention lately — ${EXERCISES[fact.suggestion].name} would balance things out.`
        : `${modality} has had little attention lately.`;
    }
    case "late-session-drop":
      return "Accuracy tends to dip late in sessions — slightly shorter sessions might land more rounds in the sweet spot.";
    case "best-time-of-day":
      return `${DAY_PART_LABELS[fact.part]} sessions have scored highest so far (${fact.bestPct}% vs ${fact.worstPct}%).`;
  }
}
