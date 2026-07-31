import {
  EXERCISES,
  MODALITY_LABELS,
  type Modality,
  type Profile,
  type SessionRecord,
} from "@/lib/domain/types";
import { streakAtRisk } from "@/lib/progression/streak";
import { DAY_PART_LABELS, modalityBalance, timeOfDayPerformance } from "@/lib/stats/aggregate";
import type { Translator } from "@/lib/i18n";

/**
 * Rule-based insight engine (issue #11, phase 1).
 *
 * Every insight is a deterministic function of the user's own session data,
 * phrased within the copy rules of docs/measurement.md: observations about
 * in-app results, never claims about cognition. The UI shows at most one at
 * a time and lets the user dismiss insights for the day.
 */

export interface Insight {
  id: string;
  text: string;
  /** Lower = more important. */
  priority: number;
}

export interface InsightInput {
  profile: Profile;
  /** Sessions, any order; rules sort as needed. */
  sessions: SessionRecord[];
  /** Local day key, e.g. "2026-07-31". */
  today: string;
}

const MIN_SESSIONS_FOR_PATTERNS = 5;

const identity: Translator = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m)) : text;

/**
 * Derive insights. `t` translates the generated sentences (defaults to
 * English); passing it keeps the engine pure and locale-agnostic.
 */
export function deriveInsights(input: InsightInput, t: Translator = identity): Insight[] {
  const insights: Insight[] = [];

  const streak = streakRule(input, t);
  if (streak) insights.push(streak);

  if (input.sessions.length >= MIN_SESSIONS_FOR_PATTERNS) {
    const imbalance = imbalanceRule(input, t);
    if (imbalance) insights.push(imbalance);

    const fatigue = fatigueRule(input, t);
    if (fatigue) insights.push(fatigue);

    const timing = timeOfDayRule(input, t);
    if (timing) insights.push(timing);
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

/** Streak survives only if today is trained. */
function streakRule({ profile, today }: InsightInput, t: Translator): Insight | null {
  if (profile.streak.lastActiveDay === today) return null;
  if (!streakAtRisk(profile.streak, today)) return null;
  return {
    id: "streak-at-risk",
    text: t("A short session today keeps your {n}-day streak alive.", {
      n: profile.streak.current,
    }),
    priority: 1,
  };
}

/** One modality getting under 10% of recent training time. */
function imbalanceRule({ sessions }: InsightInput, t: Translator): Insight | null {
  const balance = modalityBalance(sessions);
  const entries = Object.entries(balance) as [Modality, number][];
  if (entries.every(([, share]) => share === 0)) return null;
  const [weakest, share] = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min));
  if (share >= 0.1) return null;
  const suggestion = suggestExerciseFor(weakest);
  return {
    id: `imbalance-${weakest}`,
    text: suggestion
      ? t("{modality} has had little attention lately — {exercise} would balance things out.", {
          modality: t(MODALITY_LABELS[weakest]),
          exercise: t(suggestion),
        })
      : t("{modality} has had little attention lately.", {
          modality: t(MODALITY_LABELS[weakest]),
        }),
    priority: 2,
  };
}

/** Accuracy consistently drops from first to last block within sessions. */
function fatigueRule({ sessions }: InsightInput, t: Translator): Insight | null {
  const multi = sessions.filter((s) => s.exercises.length >= 3);
  if (multi.length < MIN_SESSIONS_FOR_PATTERNS) return null;
  let diffSum = 0;
  for (const s of multi) {
    diffSum += s.exercises[0].accuracy - s.exercises[s.exercises.length - 1].accuracy;
  }
  const meanDrop = diffSum / multi.length;
  if (meanDrop < 0.1) return null;
  return {
    id: "late-session-drop",
    text: t(
      "Your accuracy tends to dip late in sessions — slightly shorter sessions might land more of your rounds in the sweet spot.",
    ),
    priority: 3,
  };
}

/** A clearly stronger time of day (>= 8pp, >= 3 sessions in both buckets). */
function timeOfDayRule({ sessions }: InsightInput, t: Translator): Insight | null {
  const parts = timeOfDayPerformance(sessions).filter((p) => p.sessions >= 3);
  if (parts.length < 2) return null;
  const sorted = [...parts].sort((a, b) => b.accuracy - a.accuracy);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.accuracy - worst.accuracy < 0.08) return null;
  return {
    id: `best-${best.part}`,
    text: t("{part} sessions have scored highest for you so far ({best}% vs {worst}%).", {
      part: t(DAY_PART_LABELS[best.part]),
      best: Math.round(best.accuracy * 100),
      worst: Math.round(worst.accuracy * 100),
    }),
    priority: 4,
  };
}

function suggestExerciseFor(modality: Modality): string | null {
  const match = Object.values(EXERCISES).find((def) => def.modalities.includes(modality));
  return match ? match.name : null;
}

/** Meta key: day on which the user dismissed insights. */
export const META_INSIGHTS_DISMISSED_DAY = "insightsDismissedDay";
