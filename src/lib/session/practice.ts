import { MAX_LEVEL, MIN_LEVEL } from "@/lib/adaptive/engine";

/**
 * Practice mode (free training): one chosen exercise at one chosen, fixed
 * level. Deliberately outside progression — no XP, no streak, no skill
 * updates and no session record. Anything else would let a chosen difficulty
 * farm XP on an easy level or wreck the adaptive estimate on a hard one.
 */

export const PRACTICE_MIN_ROUNDS = 1;
export const PRACTICE_MAX_ROUNDS = 20;
/** Round counts offered by the picker UI. */
export const PRACTICE_ROUND_CHOICES = [3, 5, 10] as const;

export interface PracticeParams {
  /** Fixed difficulty level for every round. */
  level: number;
  /** Round count, or null to use the exercise's default. */
  rounds: number | null;
}

/**
 * Parse practice query parameters. Returns null unless `level` is a whole
 * number within the engine's range — practice is only practice when the
 * level was chosen. A malformed `rounds` falls back to the exercise default
 * rather than rejecting the session.
 */
export function parsePracticeParams(
  levelRaw: string | null,
  roundsRaw: string | null,
): PracticeParams | null {
  if (levelRaw === null) return null;
  const level = Number(levelRaw);
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) return null;

  let rounds: number | null = null;
  if (roundsRaw !== null) {
    const parsed = Number(roundsRaw);
    if (
      Number.isInteger(parsed) &&
      parsed >= PRACTICE_MIN_ROUNDS &&
      parsed <= PRACTICE_MAX_ROUNDS
    ) {
      rounds = parsed;
    }
  }
  return { level, rounds };
}
