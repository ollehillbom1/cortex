import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  type ExerciseId,
  type Modality,
  type Profile,
  type SessionRecord,
} from "@/lib/domain/types";
import { effectiveLevel, MIN_LEVEL } from "@/lib/adaptive/engine";
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
      level: skill ? effectiveLevel(skill, EXERCISES[id].maxLevel) : 1,
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

/**
 * Strongest and weakest exercises, ranked by how far into each exercise's own
 * scale the user has come (needs >=3 attempts).
 *
 * Raw level is not comparable between exercises: n-back tops out at 18 and
 * number span at 39, so sorting by level ranked "which exercise has the
 * longer ramp", not "which are you better at". Normalising to each
 * exercise's own range does not make the comparison a claim about
 * cognition — it makes it a claim about progress within Cortex, which is
 * the only thing the data supports.
 */
export function strengthsAndFocus(profile: Profile): {
  strengths: ExerciseLevelSummary[];
  focus: ExerciseLevelSummary[];
} {
  const played = exerciseLevels(profile).filter((e) => e.attempts >= 3);
  const byProgress = [...played].sort((a, b) => exerciseProgress(b) - exerciseProgress(a));
  return {
    strengths: byProgress.slice(0, 2),
    focus: byProgress.slice(-2).reverse(),
  };
}

/** 0..1: position in this exercise's own level range. */
export function exerciseProgress(summary: ExerciseLevelSummary): number {
  const ceiling = EXERCISES[summary.exerciseId].maxLevel;
  if (ceiling <= MIN_LEVEL) return 0;
  return (summary.level - MIN_LEVEL) / (ceiling - MIN_LEVEL);
}

export const DAY_PARTS = ["morning", "afternoon", "evening", "night"] as const;

export type DayPart = (typeof DAY_PARTS)[number];

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
