import type { SkillState } from "@/lib/domain/types";

/**
 * Central adaptive difficulty engine.
 *
 * Design goals (see docs/adaptive-difficulty.md):
 * - keep each exercise in a challenging-but-achievable band (~70–85% accuracy)
 * - move smoothly: no jump larger than one level step per round
 * - calibrate quickly for new users, then settle
 * - stay deterministic and side-effect free so it is trivially testable
 *
 * The skill estimate is a continuous float `level >= 1`. Exercises map
 * `floor(level)` to concrete parameters (span length, grid size, timing).
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 40;

/** Accuracy band the engine steers towards. */
export const TARGET_LOW = 0.7;
export const TARGET_HIGH = 0.85;

export interface RoundOutcome {
  /** Accuracy of the round, 0..1. */
  accuracy: number;
  /**
   * How deep into the session this round happened (0 = fresh, 1 = long
   * session). Late-session failures are discounted: they are more likely
   * fatigue than a wrong skill estimate.
   */
  fatigue?: number;
}

export function initialSkill(now = new Date()): SkillState {
  return {
    level: 1,
    streak: 0,
    recent: [],
    attempts: 0,
    updatedAt: now.toISOString(),
  };
}

/** Effective integer level used to parameterise an exercise. */
export function effectiveLevel(state: SkillState): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.floor(state.level)));
}

/**
 * Update the skill estimate after one round. Pure: returns a new state.
 *
 * Step sizes:
 * - accuracy >= 0.95        -> +0.60  (clearly too easy)
 * - accuracy >= TARGET_HIGH -> +0.40
 * - within target band      -> +0.10  (slow upward drift keeps challenge)
 * - accuracy >= 0.5         -> -0.25
 * - below 0.5               -> -0.50  (clearly too hard)
 *
 * Modifiers:
 * - first 3 attempts: x1.8 to find the right level quickly
 * - fatigue discounts downward steps by up to 50%
 * - 3+ consecutive failures: extra -0.25 safety valve
 * The net change per round is clamped to [-1, +1].
 */
export function updateSkill(
  state: SkillState,
  outcome: RoundOutcome,
  now = new Date(),
): SkillState {
  const { accuracy } = outcome;
  const fatigue = clamp(outcome.fatigue ?? 0, 0, 1);

  let delta: number;
  if (accuracy >= 0.95) delta = 0.6;
  else if (accuracy >= TARGET_HIGH) delta = 0.4;
  else if (accuracy >= TARGET_LOW) delta = 0.1;
  else if (accuracy >= 0.5) delta = -0.25;
  else delta = -0.5;

  if (state.attempts < 3) delta *= 1.8;
  if (delta < 0) delta *= 1 - 0.5 * fatigue;

  const success = accuracy >= TARGET_LOW;
  const streak = success ? Math.max(1, state.streak + 1) : Math.min(-1, state.streak - 1);
  if (streak <= -3) delta -= 0.25;

  delta = clamp(delta, -1, 1);

  const level = clamp(state.level + delta, MIN_LEVEL, MAX_LEVEL);
  const recent = [...state.recent, accuracy].slice(-10);

  return {
    level,
    streak,
    recent,
    attempts: state.attempts + 1,
    updatedAt: now.toISOString(),
  };
}

/** Mean of recent round accuracies, or null with no history. */
export function recentAccuracy(state: SkillState): number | null {
  if (state.recent.length === 0) return null;
  return state.recent.reduce((a, b) => a + b, 0) / state.recent.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
