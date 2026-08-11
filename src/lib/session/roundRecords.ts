import { betterPersonalRecord } from "@/lib/measurement/records";
import { MEASUREMENT_VERSION } from "@/lib/measurement/version";
import type { ExerciseId, Profile } from "@/lib/domain/types";

/**
 * Round-time personal-best detection, for the XP bonus that rewards a record
 * in the round that set it (xpForRound's `personalBest` input).
 *
 * Judged against the records as they stood when the session began, plus any
 * best set earlier in the same session — a run of span 5 → 6 → 7 is three
 * real personal bests, not one. The candidate keys mirror apply.ts's
 * mergeRecords with one deliberate omission: `:level` records are block-level
 * facts already shown as a level change, and paying the record bonus for
 * most level-ups would quietly turn it into a level bonus.
 */

export interface RoundForRecords {
  responseMs?: number;
  extras?: Record<string, number>;
}

export function trackPersonalBest(
  records: Profile["records"],
  exerciseId: ExerciseId,
  round: RoundForRecords,
  now: Date,
): { personalBest: boolean; records: Profile["records"] } {
  const candidates: Array<[key: string, value: number | undefined]> = [];
  if (exerciseId === "reaction-time") {
    candidates.push(["reaction-time:bestMs", round.responseMs]);
  }
  const extras = round.extras ?? {};
  if (extras.maxSpan !== undefined) candidates.push([`${exerciseId}:maxSpan`, extras.maxSpan]);
  if (extras.maxSequence !== undefined) {
    candidates.push([`${exerciseId}:maxSequence`, extras.maxSequence]);
  }

  let personalBest = false;
  let next = records;
  for (const [key, value] of candidates) {
    if (value === undefined || !Number.isFinite(value)) continue;
    const candidate = {
      value,
      achievedAt: now.toISOString(),
      measurementVersion: MEASUREMENT_VERSION[exerciseId],
    };
    if (betterPersonalRecord(key, candidate, next[key])) {
      personalBest = true;
      next = { ...next, [key]: candidate };
    }
  }
  return { personalBest, records: next };
}
