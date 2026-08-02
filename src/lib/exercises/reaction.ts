import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Reaction: wait through a random delay, react the moment the signal turns.
 * Timing uses performance.now() in the UI; this module holds the pure logic.
 */

export interface ReactionParams {
  rounds: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export function reactionParams(level: number): ReactionParams {
  // Higher levels shorten the predictable floor and widen the delay window,
  // making anticipation less useful.
  return {
    rounds: 5,
    minDelayMs: Math.max(800, 1500 - (level - 1) * 40),
    maxDelayMs: Math.min(5000, 3200 + (level - 1) * 100),
  };
}

export function generateDelay(rng: Rng, params: ReactionParams): number {
  return randInt(rng, params.minDelayMs, params.maxDelayMs);
}

export type ReactionRound =
  { kind: "ok"; ms: number } | { kind: "false-start" } | { kind: "timeout" };

export interface ReactionScore {
  validRounds: number;
  falseStarts: number;
  /** Mean of valid rounds, null when none. */
  averageMs: number | null;
  bestMs: number | null;
  /** 0..1 for the adaptive engine: speed mapped onto the accuracy scale. */
  accuracy: number;
}

/**
 * Map reaction performance onto the 0..1 accuracy scale the adaptive engine
 * expects: <=220ms ~ 1.0 sliding to >=600ms ~ 0.3; false starts subtract 0.1
 * each. This keeps one engine for every exercise.
 */
export function scoreReaction(rounds: ReactionRound[]): ReactionScore {
  const valid = rounds.filter((r): r is { kind: "ok"; ms: number } => r.kind === "ok");
  const falseStarts = rounds.filter((r) => r.kind === "false-start").length;
  const averageMs =
    valid.length === 0 ? null : Math.round(valid.reduce((a, r) => a + r.ms, 0) / valid.length);
  const bestMs = valid.length === 0 ? null : Math.min(...valid.map((r) => r.ms));

  let accuracy: number;
  if (averageMs === null) {
    accuracy = 0;
  } else {
    const speed = 1 - (averageMs - 220) / (600 - 220);
    accuracy = Math.min(1, Math.max(0.3, 0.3 + speed * 0.7));
  }
  accuracy = Math.max(0, accuracy - falseStarts * 0.1);

  return { validRounds: valid.length, falseStarts, averageMs, bestMs, accuracy };
}

/**
 * Longest a GO signal waits for an answer. The scoring had a state for "no
 * answer" and nothing ever entered it, so an unanswered round hung for ever.
 */
export const REACTION_DEADLINE_MS = 3000;

/**
 * Below this, a press is anticipation rather than perception: simple visual
 * reaction times do not go under ~150 ms in adults, and a lucky guess timed
 * to the delay would otherwise land in the personal-best record.
 */
export const MIN_PLAUSIBLE_MS = 120;
