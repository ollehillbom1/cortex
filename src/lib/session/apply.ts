import type { ExerciseResult, Profile, SessionRecord } from "@/lib/domain/types";
import { evaluateAchievements } from "@/lib/progression/achievements";
import { dayKey, recordActiveDay } from "@/lib/progression/streak";

/**
 * Applies a finished session to a profile: XP, streak, personal records and
 * achievements. Pure — the caller persists the returned profile + session.
 */

export interface ApplySessionInput {
  profile: Profile;
  /** Session with exercises + xpEarned filled in; `unlocked` may be empty. */
  session: SessionRecord;
  /** Total sessions completed before this one. */
  priorSessionCount: number;
  now?: Date;
}

export interface ApplySessionOutput {
  profile: Profile;
  session: SessionRecord;
  newRecords: string[];
  unlocked: string[];
  freezeUsed: boolean;
  streakReset: boolean;
}

export function applySession(input: ApplySessionInput): ApplySessionOutput {
  const now = input.now ?? new Date();
  const today = dayKey(now);
  const { session } = input;

  const streakUpdate = recordActiveDay(input.profile.streak, today);

  const { records, newRecords } = mergeRecords(input.profile.records, session.exercises, now);

  let profile: Profile = {
    ...input.profile,
    xp: input.profile.xp + session.xpEarned,
    streak: streakUpdate.streak,
    records,
    updatedAt: now.toISOString(),
  };

  const unlocked = evaluateAchievements({
    profile,
    session,
    totalSessions: input.priorSessionCount + 1,
  });
  if (unlocked.length > 0) {
    const stamped = { ...profile.achievements };
    for (const id of unlocked) stamped[id] = now.toISOString();
    profile = { ...profile, achievements: stamped };
  }

  return {
    profile,
    session: { ...session, unlocked },
    newRecords,
    unlocked,
    freezeUsed: streakUpdate.freezeUsed,
    streakReset: streakUpdate.reset,
  };
}

/** Record keys currently tracked. Lower-is-better keys end with "Ms". */
function mergeRecords(
  existing: Profile["records"],
  exercises: ExerciseResult[],
  now: Date,
): { records: Profile["records"]; newRecords: string[] } {
  const records = { ...existing };
  const newRecords: string[] = [];
  const stamp = now.toISOString();

  const consider = (key: string, value: number | undefined, lowerIsBetter = false) => {
    if (value === undefined || !Number.isFinite(value)) return;
    const prev = records[key]?.value;
    const better = prev === undefined || (lowerIsBetter ? value < prev : value > prev);
    if (better) {
      records[key] = { value, achievedAt: stamp };
      if (prev !== undefined) newRecords.push(key);
      else if (!lowerIsBetter || value > 0) newRecords.push(key);
    }
  };

  for (const e of exercises) {
    consider(`${e.exerciseId}:level`, e.levelAfter);
    if (e.exerciseId === "reaction-time") {
      consider("reaction-time:bestMs", e.bestResponseMs, true);
    }
    if (e.details) {
      if (e.details.maxSpan !== undefined) {
        consider(`${e.exerciseId}:maxSpan`, e.details.maxSpan);
      }
      if (e.details.maxSequence !== undefined) {
        consider(`${e.exerciseId}:maxSequence`, e.details.maxSequence);
      }
    }
  }
  return { records, newRecords };
}
