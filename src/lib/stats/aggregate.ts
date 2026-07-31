import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  type ExerciseId,
  type Modality,
  type Profile,
  type SessionRecord,
} from "@/lib/domain/types";
import { effectiveLevel } from "@/lib/adaptive/engine";
import { dayKey, daysBetween } from "@/lib/progression/streak";

/**
 * Pure aggregation helpers for the statistics screens. All functions take
 * explicit inputs (sessions newest-first is NOT assumed; they sort locally).
 */

export interface DayActivity {
  day: string;
  sessions: number;
  minutes: number;
  xp: number;
}

/** Activity per local day for the trailing `days` days, oldest first. */
export function activityByDay(
  sessions: SessionRecord[],
  today: string,
  days: number,
): DayActivity[] {
  const map = new Map<string, DayActivity>();
  for (const s of sessions) {
    const day = dayKey(new Date(s.startedAt));
    const gap = daysBetween(day, today);
    if (gap < 0 || gap >= days) continue;
    const entry = map.get(day) ?? { day, sessions: 0, minutes: 0, xp: 0 };
    entry.sessions += 1;
    entry.minutes += s.durationMs / 60_000;
    entry.xp += s.xpEarned;
    map.set(day, entry);
  }
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDay(today, -i);
    out.push(map.get(d) ?? { day: d, sessions: 0, minutes: 0, xp: 0 });
  }
  return out;
}

export interface TrendPoint {
  /** Session start ISO timestamp. */
  at: string;
  value: number;
}

/** Accuracy per session for one exercise, oldest first. */
export function accuracyTrend(sessions: SessionRecord[], exerciseId: ExerciseId): TrendPoint[] {
  return sortedAsc(sessions).flatMap((s) =>
    s.exercises
      .filter((e) => e.exerciseId === exerciseId)
      .map((e) => ({ at: s.startedAt, value: e.accuracy })),
  );
}

/** Average response time per session for reaction-style exercises. */
export function responseTimeTrend(sessions: SessionRecord[], exerciseId: ExerciseId): TrendPoint[] {
  return sortedAsc(sessions).flatMap((s) =>
    s.exercises
      .filter((e) => e.exerciseId === exerciseId && e.avgResponseMs !== undefined)
      .map((e) => ({ at: s.startedAt, value: e.avgResponseMs as number })),
  );
}

/** Skill level per exercise (current), for the strengths view. */
export interface ExerciseLevelSummary {
  exerciseId: ExerciseId;
  name: string;
  level: number;
  attempts: number;
}

export function exerciseLevels(profile: Profile): ExerciseLevelSummary[] {
  return ALL_EXERCISE_IDS.map((id) => {
    const skill = profile.skills[id];
    return {
      exerciseId: id,
      name: EXERCISES[id].name,
      level: skill ? effectiveLevel(skill) : 1,
      attempts: skill?.attempts ?? 0,
    };
  });
}

/**
 * Share of recent training time per modality (0..1), for the balance view.
 * An exercise's time is split evenly across its modalities.
 */
export function modalityBalance(sessions: SessionRecord[], limit = 20): Record<Modality, number> {
  const totals: Record<Modality, number> = {
    "working-memory": 0,
    "visual-memory": 0,
    "auditory-memory": 0,
    attention: 0,
    speed: 0,
  };
  let grand = 0;
  for (const s of sortedAsc(sessions).slice(-limit)) {
    for (const e of s.exercises) {
      const def = EXERCISES[e.exerciseId];
      const blockSeconds = def.secondsPerRound * e.rounds;
      const share = blockSeconds / def.modalities.length;
      for (const m of def.modalities) totals[m] += share;
      grand += blockSeconds;
    }
  }
  if (grand > 0) {
    for (const m of Object.keys(totals) as Modality[]) totals[m] /= grand;
  }
  return totals;
}

/** Strongest and weakest exercises by recent accuracy (needs >=3 attempts). */
export function strengthsAndFocus(profile: Profile): {
  strengths: ExerciseLevelSummary[];
  focus: ExerciseLevelSummary[];
} {
  const played = exerciseLevels(profile).filter((e) => e.attempts >= 3);
  const byLevel = [...played].sort((a, b) => b.level - a.level);
  return {
    strengths: byLevel.slice(0, 2),
    focus: byLevel.slice(-2).reverse(),
  };
}

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

export interface DayPartPerformance {
  part: DayPart;
  sessions: number;
  /** Mean of session-level mean accuracies, 0..1. */
  accuracy: number;
}

/**
 * In-app accuracy by local time of day. Only descriptive — an observation
 * about training results, never a claim about cognition.
 */
export function timeOfDayPerformance(sessions: SessionRecord[]): DayPartPerformance[] {
  const buckets = new Map<DayPart, { total: number; count: number }>();
  for (const s of sessions) {
    if (s.exercises.length === 0) continue;
    const acc = s.exercises.reduce((a, e) => a + e.accuracy, 0) / s.exercises.length;
    const part = dayPartOf(new Date(s.startedAt).getHours());
    const bucket = buckets.get(part) ?? { total: 0, count: 0 };
    bucket.total += acc;
    bucket.count += 1;
    buckets.set(part, bucket);
  }
  const order: DayPart[] = ["morning", "afternoon", "evening", "night"];
  return order
    .filter((p) => buckets.has(p))
    .map((p) => {
      const b = buckets.get(p)!;
      return { part: p, sessions: b.count, accuracy: b.total / b.count };
    });
}

function sortedAsc(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Shift a YYYY-MM-DD day key by n days. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
