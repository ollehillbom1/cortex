import {
  EXERCISES,
  type ExerciseId,
  type Modality,
  type Profile,
  type SessionRecord,
} from "@/lib/domain/types";
import { recentAccuracy } from "@/lib/adaptive/engine";
import { availableExerciseIds } from "@/lib/exercises/availability";
import { DUAL_NBACK_GATE_LEVEL } from "@/lib/exercises/dualNBack";
import { createRng, shuffle, type Rng } from "@/lib/engine/rng";

/**
 * Daily session planner.
 *
 * Assembles a balanced session across several cognitive modalities, biased
 * towards exercises that (a) were not trained recently and (b) currently show
 * the weakest recent accuracy — while keeping total time near the profile's
 * daily goal. Deterministic for a given seed + inputs.
 */

export interface PlannedItem {
  exerciseId: ExerciseId;
  rounds: number;
}

export interface PlannedSession {
  items: PlannedItem[];
  estimatedMinutes: number;
  modalities: Modality[];
}

export interface PlanInput {
  profile: Profile;
  /** Most recent sessions, newest first. Used to avoid repetition. */
  recentSessions: SessionRecord[];
  seed: number;
  /** Overrides the profile's daily goal when provided. */
  targetMinutes?: number;
}

const MIN_ITEMS = 3;
/** Distinct exercises in one session. Repeats beyond this are extra blocks. */
const MAX_ITEMS = 5;
/** Hard ceiling on blocks, so a session cannot become a wall of instructions. */
const MAX_BLOCKS = 8;
/**
 * How many times over an exercise may be repeated within one session.
 *
 * The cap exists to limit monotony, but it has to bend to the size of the
 * pool: with the vision filter on only three exercises remain (232s at their
 * default length), so a 20-minute goal needs each of them six times over.
 * With everything available five distinct exercises cover the same goal at
 * three. Scale to what the target actually needs, and stop at the ceiling.
 */
const MIN_ROUNDS_FACTOR = 3;
const MAX_ROUNDS_FACTOR = 6;
/**
 * Longest single session the planner will build, in minutes. The daily goal
 * goes to 25, but the product promises "5-20 minute sessions" and a goal is a
 * target for the *day*: a 25-minute goal is two sessions, and the home screen
 * tracks daily minutes separately. Planning beyond this would mean a dozen
 * instruction screens in one sitting.
 */
export const MAX_SESSION_MINUTES = 20;
/** A plan counts as matching its target within this fraction. */
export const PLAN_TOLERANCE = 0.1;

/**
 * What the NEXT session should aim for, given what today already holds.
 *
 * A goal above the session cap is delivered in parts: the first session runs
 * to the cap, and this sends the second one after the remainder instead of
 * another full session — a 25-minute goal is 20 + 5, not 20 + 20. Once the
 * goal is met, an extra session is a deliberate full one, not a sliver.
 * planSession clamps whatever this returns to [4, MAX_SESSION_MINUTES].
 *
 * Shared by the home preview and the runner so both compute the same target
 * from the same inputs — the preview must BE the session that starts.
 */
export function sessionTargetMinutes(goalMinutes: number, minutesToday: number): number {
  const remaining = goalMinutes - minutesToday;
  return remaining > 0 ? remaining : goalMinutes;
}

/** Seconds one block of this exercise takes at the given round count. */
function blockSeconds(item: PlannedItem): number {
  return EXERCISES[item.exerciseId].secondsPerRound * item.rounds;
}

/**
 * How much history the plan considers. Shared so the home preview and the
 * runner see the same window — they used 30 and 10, which is one of the two
 * reasons the session you started could differ from the one you were shown.
 */
export const PLAN_HISTORY_WINDOW = 10;

/**
 * Plan seed for a day. Stable so the preview does not reshuffle on every
 * visit, and shared so the runner rebuilds exactly the plan the home screen
 * displayed — it used to seed from the clock, making the preview a
 * suggestion rather than the session.
 */
export function dailyPlanSeed(dayKey: string): number {
  return [...dayKey].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
}

export function planSession(input: PlanInput): PlannedSession {
  const rng = createRng(input.seed);
  const target = input.targetMinutes ?? input.profile.preferences.dailyGoalMinutes;
  const targetSeconds = Math.max(4, Math.min(MAX_SESSION_MINUTES, target)) * 60;

  const ranked = rankExercises(input, rng);

  const items: PlannedItem[] = [];
  const usedModalities = new Set<Modality>();
  const total = () => items.reduce((a, i) => a + blockSeconds(i), 0);

  for (const id of ranked) {
    if (items.length >= MAX_ITEMS) break;
    const def = EXERCISES[id];
    const seconds = def.secondsPerRound * def.defaultRounds;
    const wouldExceed = total() + seconds > targetSeconds * 1.15;
    if (items.length >= MIN_ITEMS && wouldExceed) continue;
    items.push({ exerciseId: id, rounds: def.defaultRounds });
    def.modalities.forEach((m) => usedModalities.add(m));
    if (items.length >= MIN_ITEMS && total() >= targetSeconds) break;
  }

  // Guarantee at least three distinct modalities when possible.
  if (usedModalities.size < 3) {
    for (const id of ranked) {
      if (items.length >= MAX_ITEMS) break;
      if (items.some((i) => i.exerciseId === id)) continue;
      const def = EXERCISES[id];
      if (def.modalities.some((m) => !usedModalities.has(m))) {
        items.push({ exerciseId: id, rounds: def.defaultRounds });
        def.modalities.forEach((m) => usedModalities.add(m));
        if (usedModalities.size >= 3) break;
      }
    }
  }

  // Fill the remaining budget. Five distinct exercises at their default
  // length total 6.9 minutes, so a 10-minute goal — the default — was
  // unreachable and every longer goal silently ignored: the loop above simply
  // ran out of exercises. Interleave repeat blocks (two shorter passes at an
  // exercise beat one long grind, and repeating preserves the modality mix),
  // then trim the last block so the estimate lands on the target.
  const distinct = [...new Set(items.map((i) => i.exerciseId))];
  const poolSeconds = distinct.reduce(
    (a, id) => a + EXERCISES[id].secondsPerRound * EXERCISES[id].defaultRounds,
    0,
  );
  // Repeat as often as the target needs, plus one: exercises differ in round
  // length (an n-back round is 55s against a 22s span round), and without the
  // slack a coarse exercise hits its cap while the fine-grained ones absorb
  // all the remaining time, leaving a 4-minute block beside a 1-minute one.
  const roundsFactor = Math.min(
    MAX_ROUNDS_FACTOR,
    Math.max(MIN_ROUNDS_FACTOR, Math.ceil(targetSeconds / Math.max(1, poolSeconds)) + 1),
  );
  const roundsFor = (id: ExerciseId) =>
    items.filter((i) => i.exerciseId === id).reduce((a, i) => a + i.rounds, 0);
  const headroom = (id: ExerciseId) => EXERCISES[id].defaultRounds * roundsFactor - roundsFor(id);

  const secondsFor = (id: ExerciseId) =>
    items.filter((i) => i.exerciseId === id).reduce((a, i) => a + blockSeconds(i), 0);

  // Interleave repeat blocks, least-trained-so-far first (by time, not round
  // count: a 55-second n-back round is not comparable to a 22-second span
  // round). Bounded by MAX_BLOCKS.
  for (let guard = 0; guard < MAX_BLOCKS; guard++) {
    if (total() >= targetSeconds || items.length >= MAX_BLOCKS) break;
    const next = distinct
      .filter((id) => headroom(id) >= EXERCISES[id].defaultRounds)
      .sort((a, b) => secondsFor(a) - secondsFor(b))[0];
    if (!next) break;
    items.push({ exerciseId: next, rounds: EXERCISES[next].defaultRounds });
  }

  // Still short (the block ceiling bit): lengthen blocks rather than add more
  // instruction screens. Always grow the shortest block, so a 20-minute
  // session is eight comparable blocks and not one 20-round marathon.
  for (let guard = 0; guard < MAX_BLOCKS * 40; guard++) {
    if (total() >= targetSeconds) break;
    const growable = items.filter((i) => headroom(i.exerciseId) > 0);
    if (growable.length === 0) break;
    const shortest = growable.reduce((a, b) => (blockSeconds(a) <= blockSeconds(b) ? a : b));
    shortest.rounds += 1;
  }

  // Overshoot: three blocks at their default length can exceed a short goal
  // on their own, since MIN_ITEMS is satisfied before the budget is checked.
  // Shrink the longest block first, mirroring the grow pass, so a 5-minute
  // goal is not a 6-minute session on the days the seed lands badly.
  for (let guard = 0; guard < MAX_BLOCKS * 40; guard++) {
    if (total() <= targetSeconds * (1 + PLAN_TOLERANCE)) break;
    const shrinkable = items.filter((i) => i.rounds > 1);
    if (shrinkable.length === 0) break;
    const longest = shrinkable.reduce((a, b) => (blockSeconds(a) >= blockSeconds(b) ? a : b));
    longest.rounds -= 1;
  }

  // Land inside tolerance: shorten the last block round by round while that
  // brings the estimate closer to the target. Never below a single round.
  const last = items[items.length - 1];
  if (last) {
    const secondsPerRound = EXERCISES[last.exerciseId].secondsPerRound;
    while (
      last.rounds > 1 &&
      Math.abs(total() - secondsPerRound - targetSeconds) < Math.abs(total() - targetSeconds)
    ) {
      last.rounds -= 1;
    }
  }

  return {
    items,
    estimatedMinutes: Math.max(1, Math.round(total() / 60)),
    modalities: [...usedModalities],
  };
}

/**
 * Rank exercises by training priority: weakest recent accuracy and least
 * recently trained first, with a small random jitter so consecutive days
 * differ even with identical stats.
 */
function rankExercises(input: PlanInput, rng: Rng): ExerciseId[] {
  const lastTrainedIndex = new Map<ExerciseId, number>();
  input.recentSessions.forEach((session, sessionIdx) => {
    for (const ex of session.exercises) {
      if (!lastTrainedIndex.has(ex.exerciseId)) lastTrainedIndex.set(ex.exerciseId, sessionIdx);
    }
  });

  // Start from what this profile can actually play (accessibility filter),
  // then hold dual n-back back until single n-back has reached 2-back; it
  // stays playable from the library at any time.
  const candidates = availableExerciseIds(input.profile).filter(
    (id) =>
      id !== "dual-n-back" || (input.profile.skills["n-back"]?.level ?? 1) >= DUAL_NBACK_GATE_LEVEL,
  );

  const scored = shuffle(rng, candidates).map((id) => {
    const skill = input.profile.skills[id];
    const acc = skill ? recentAccuracy(skill) : null;
    // Never trained -> strong priority; weak accuracy -> priority.
    const accuracyScore = acc === null ? 1 : 1 - acc;
    // 0 = trained in the latest session, 1 = not seen in the window.
    const recencyIdx = lastTrainedIndex.get(id);
    const recencyScore =
      recencyIdx === undefined
        ? 1
        : Math.min(1, recencyIdx / Math.max(1, input.recentSessions.length));
    const jitter = rng() * 0.1;
    return { id, score: accuracyScore * 0.55 + recencyScore * 0.45 + jitter };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

/** Estimated minutes for a single-exercise quick session. */
export function estimateSingle(exerciseId: ExerciseId): number {
  const def = EXERCISES[exerciseId];
  return Math.max(1, Math.round((def.secondsPerRound * def.defaultRounds) / 60));
}
