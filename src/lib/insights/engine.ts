import {
  EXERCISES,
  type ExerciseId,
  type Modality,
  type Profile,
  type SessionRecord,
} from "@/lib/domain/types";
import { streakAtRisk } from "@/lib/progression/streak";
import { modalityBalance, timeOfDayPerformance } from "@/lib/stats/aggregate";
import type { Translator } from "@/lib/i18n";
import { renderFact, type InsightFact } from "@/lib/coach/protocol";

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
  /**
   * The structured fact this sentence was rendered from. The optional coach
   * (issue #11 phase 2) sends this — never the rendered text — so no free
   * text can leave the device.
   */
  fact: InsightFact;
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
  const fact: InsightFact = { kind: "streak-at-risk", days: profile.streak.current };
  return { id: "streak-at-risk", text: renderFact(fact, t), priority: 1, fact };
}

/** One modality getting under 10% of recent training time. */
function imbalanceRule({ sessions }: InsightInput, t: Translator): Insight | null {
  const balance = modalityBalance(sessions);
  const entries = Object.entries(balance) as [Modality, number][];
  if (entries.every(([, share]) => share === 0)) return null;
  const [weakest, share] = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min));
  if (share >= 0.1) return null;
  const fact: InsightFact = {
    kind: "modality-imbalance",
    modality: weakest,
    suggestion: suggestExerciseFor(weakest),
  };
  return { id: `imbalance-${weakest}`, text: renderFact(fact, t), priority: 2, fact };
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
  const fact: InsightFact = { kind: "late-session-drop" };
  return { id: "late-session-drop", text: renderFact(fact, t), priority: 3, fact };
}

/** A clearly stronger time of day (>= 8pp, >= 3 sessions in both buckets). */
function timeOfDayRule({ sessions }: InsightInput, t: Translator): Insight | null {
  const parts = timeOfDayPerformance(sessions).filter((p) => p.sessions >= 3);
  if (parts.length < 2) return null;
  const sorted = [...parts].sort((a, b) => b.accuracy - a.accuracy);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.accuracy - worst.accuracy < 0.08) return null;
  const fact: InsightFact = {
    kind: "best-time-of-day",
    part: best.part,
    bestPct: Math.round(best.accuracy * 100),
    worstPct: Math.round(worst.accuracy * 100),
  };
  return { id: `best-${best.part}`, text: renderFact(fact, t), priority: 4, fact };
}

function suggestExerciseFor(modality: Modality): ExerciseId | null {
  const defs = Object.values(EXERCISES);
  // Prefer an exercise whose primary focus is this modality.
  const primary = defs.find((def) => def.modalities[0] === modality);
  const match = primary ?? defs.find((def) => def.modalities.includes(modality));
  return match ? match.id : null;
}

/** Meta key: day on which the user dismissed insights. */
export const META_INSIGHTS_DISMISSED_DAY = "insightsDismissedDay";
