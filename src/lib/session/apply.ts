import { betterPersonalRecord } from "@/lib/measurement/records";
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
  freezeEarned: boolean;
  streakReset: boolean;
}

export function applySession(input: ApplySessionInput): ApplySessionOutput {
  const now = input.now ?? new Date();
  const { session } = input;

  // Anchor the streak to the day training BEGAN, not when the save committed.
  // A session that starts before midnight and finishes just after it would
  // otherwise land on the next day: a false gap from the previous day (burning
  // a freeze or resetting), or — after an earlier session the same evening —
  // double-counting that evening as two streak days. Records and updatedAt
  // still use `now`; only the day the streak attributes to changes.
  const streakDay = dayKey(new Date(session.startedAt));
  const streakUpdate = recordActiveDay(input.profile.streak, streakDay);

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
    freezeEarned: streakUpdate.freezeEarned,
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

  const consider = (
    key: string,
    value: number | undefined,
    measurementVersion: number | undefined,
    lowerIsBetter = false,
  ) => {
    if (value === undefined || !Number.isFinite(value)) return;
    const prev = records[key];
    const candidate = { value, achievedAt: stamp, measurementVersion };
    if (betterPersonalRecord(key, candidate, prev)) {
      records[key] = candidate;
      if (prev !== undefined) newRecords.push(key);
      else if (!lowerIsBetter || value > 0) newRecords.push(key);
    }
  };

  for (const e of exercises) {
    // The version travels from the result, not from MEASUREMENT_VERSION:
    // apply also runs on merged/synced sessions from other devices, whose
    // results were produced under THEIR mapping.
    consider(`${e.exerciseId}:level`, e.levelAfter, e.measurementVersion);
    if (e.exerciseId === "reaction-time") {
      consider("reaction-time:bestMs", e.bestResponseMs, e.measurementVersion, true);
    }
    if (e.details) {
      if (e.details.maxSpan !== undefined) {
        consider(`${e.exerciseId}:maxSpan`, e.details.maxSpan, e.measurementVersion);
      }
      if (e.details.maxSequence !== undefined) {
        consider(`${e.exerciseId}:maxSequence`, e.details.maxSequence, e.measurementVersion);
      }
    }
  }
  return { records, newRecords };
}
