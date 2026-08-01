import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  MODALITY_LABELS,
  type ExerciseId,
  type Modality,
} from "@/lib/domain/types";
import { DAY_PARTS, DAY_PART_LABELS, type DayPart } from "@/lib/stats/aggregate";
import type { Translator } from "@/lib/i18n";

/**
 * Wire format between the browser and the optional coach endpoint
 * (issue #11, phase 2).
 *
 * The browser sends *structured facts*, never sentences: every field is a
 * number or a value from a closed enum, so no profile name or other personal
 * data can leave the device. The sentence is rendered from these templates —
 * the same ones the UI renders — on both sides, which is what makes "every
 * generated sentence traces to a structured fact" checkable rather than
 * merely asserted.
 */

export type InsightFact =
  | { kind: "streak-at-risk"; days: number }
  | { kind: "modality-imbalance"; modality: Modality; suggestion: ExerciseId | null }
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

/**
 * The English source strings for every insight sentence. They are also the
 * i18n keys, so `sv.ts` already carries the translations.
 */
export const INSIGHT_TEMPLATES = {
  streak: "A short session today keeps your {n}-day streak alive.",
  imbalanceWithSuggestion:
    "{modality} has had little attention lately — {exercise} would balance things out.",
  imbalance: "{modality} has had little attention lately.",
  lateDrop:
    "Your accuracy tends to dip late in sessions — slightly shorter sessions might land more of your rounds in the sweet spot.",
  bestTime: "{part} sessions have scored highest for you so far ({best}% vs {worst}%).",
} as const;

const MODALITY_KEYS = Object.keys(MODALITY_LABELS) as Modality[];

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Strictly validate an untrusted request body. Returns null on anything
 * unexpected — this is the only door into the outbound model call, so it
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
      return isFiniteInRange(f.days, 1, 10_000)
        ? { kind: "streak-at-risk", days: Math.round(f.days) }
        : null;
    case "modality-imbalance": {
      if (!MODALITY_KEYS.includes(f.modality as Modality)) return null;
      const suggestion = f.suggestion;
      if (suggestion !== null && !ALL_EXERCISE_IDS.includes(suggestion as ExerciseId)) return null;
      return {
        kind: "modality-imbalance",
        modality: f.modality as Modality,
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
 * Render a fact to its sentence. Used by the insight engine for what the user
 * sees and by the coach endpoint for what the model is asked to rephrase, so
 * the two can never drift apart.
 */
export function renderFact(fact: InsightFact, t: Translator): string {
  switch (fact.kind) {
    case "streak-at-risk":
      return t(INSIGHT_TEMPLATES.streak, { n: fact.days });
    case "modality-imbalance":
      return fact.suggestion
        ? t(INSIGHT_TEMPLATES.imbalanceWithSuggestion, {
            modality: t(MODALITY_LABELS[fact.modality]),
            exercise: t(EXERCISES[fact.suggestion].name),
          })
        : t(INSIGHT_TEMPLATES.imbalance, { modality: t(MODALITY_LABELS[fact.modality]) });
    case "late-session-drop":
      return t(INSIGHT_TEMPLATES.lateDrop);
    case "best-time-of-day":
      return t(INSIGHT_TEMPLATES.bestTime, {
        part: t(DAY_PART_LABELS[fact.part]),
        best: fact.bestPct,
        worst: fact.worstPct,
      });
  }
}
