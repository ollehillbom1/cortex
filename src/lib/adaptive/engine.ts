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
  /**
   * Time the user needed to produce the answer, in ms (input-phase start to
   * submission). Not used for reaction-style exercises, whose accuracy is
   * already speed-derived.
   */
  inputMs?: number;
}

/** Near-perfect rounds before this one needed to arm the hot streak. */
export const HOT_STREAK_PRIOR_ROUNDS = 2;

/** "Correct but laboured": latency this far above baseline halves up-steps. */
export const LATENCY_STRAIN_RATIO = 1.35;
/** Baseline needs at least this many samples before latency modulates. */
export const LATENCY_MIN_SAMPLES = 3;

export function initialSkill(now = new Date()): SkillState {
  return {
    level: 1,
    streak: 0,
    recent: [],
    recentInputMs: [],
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
 * - hot streak: from the third near-perfect (>= 0.95) round in a row the
 *   step is a full +1 level, ending on the first round below 0.95 — a run
 *   of cleared rounds is direct evidence the estimate sits far too low
 * - first 3 attempts: x1.8 to find the right level quickly
 * - fatigue discounts downward steps by up to 50%
 * - "correct but laboured": with >= LATENCY_MIN_SAMPLES of latency history,
 *   an upward step is halved when this round took > LATENCY_STRAIN_RATIO x
 *   the user's own median answer time — latency modulates, never dominates
 * - 3+ consecutive failures: extra -0.25 safety valve
 * The net change per round is clamped to [-1, +1].
 */
export interface UpdateOptions {
  /**
   * Kid mode: gentler ramp — calmer calibration (x1.4 instead of x1.8) and
   * upward steps damped by 25%, so difficulty rises noticeably slower while
   * downward relief stays unchanged.
   */
  gentle?: boolean;
}

export function updateSkill(
  state: SkillState,
  outcome: RoundOutcome,
  now = new Date(),
  opts: UpdateOptions = {},
): SkillState {
  const { accuracy } = outcome;
  const fatigue = clamp(outcome.fatigue ?? 0, 0, 1);

  let delta: number;
  if (accuracy >= 0.95) delta = 0.6;
  else if (accuracy >= TARGET_HIGH) delta = 0.4;
  else if (accuracy >= TARGET_LOW) delta = 0.1;
  else if (accuracy >= 0.5) delta = -0.25;
  else delta = -0.5;

  // Hot streak: from the third near-perfect round in a row, step a full
  // level. At +0.6 a skilled newcomer needed ~19 rounds (3-4 sessions) to
  // climb from level 1 to level 8 — days of too-easy exercises. Clearing
  // round after round IS the evidence the estimate is far off, so follow it
  // at the maximum smooth rate; the one-level-per-round ceiling still holds,
  // and the run ends on the first round below 95%.
  if (
    accuracy >= 0.95 &&
    state.recent.length >= HOT_STREAK_PRIOR_ROUNDS &&
    state.recent.slice(-HOT_STREAK_PRIOR_ROUNDS).every((a) => a >= 0.95)
  ) {
    delta = 1;
  }

  if (state.attempts < 3) delta *= opts.gentle ? 1.4 : 1.8;
  if (delta > 0 && opts.gentle) delta *= 0.75;
  if (delta < 0) delta *= 1 - 0.5 * fatigue;

  const baseline = medianInputMs(state);
  if (
    delta > 0 &&
    outcome.inputMs !== undefined &&
    baseline !== null &&
    outcome.inputMs > baseline * LATENCY_STRAIN_RATIO
  ) {
    delta *= 0.5;
  }

  const success = accuracy >= TARGET_LOW;
  const streak = success ? Math.max(1, state.streak + 1) : Math.min(-1, state.streak - 1);
  if (streak <= -3) delta -= 0.25;

  delta = clamp(delta, -1, 1);

  const level = clamp(state.level + delta, MIN_LEVEL, MAX_LEVEL);
  const recent = [...state.recent, accuracy].slice(-10);
  const recentInputMs =
    outcome.inputMs !== undefined
      ? [...(state.recentInputMs ?? []), outcome.inputMs].slice(-10)
      : (state.recentInputMs ?? []);

  return {
    level,
    streak,
    recent,
    recentInputMs,
    attempts: state.attempts + 1,
    updatedAt: now.toISOString(),
  };
}

/** Rolling median answer time, or null before LATENCY_MIN_SAMPLES exist. */
export function medianInputMs(state: SkillState): number | null {
  const samples = state.recentInputMs ?? [];
  if (samples.length < LATENCY_MIN_SAMPLES) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Mean of recent round accuracies, or null with no history. */
export function recentAccuracy(state: SkillState): number | null {
  if (state.recent.length === 0) return null;
  return state.recent.reduce((a, b) => a + b, 0) / state.recent.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
