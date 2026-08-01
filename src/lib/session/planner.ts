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
const MAX_ITEMS = 5;

export function planSession(input: PlanInput): PlannedSession {
  const rng = createRng(input.seed);
  const target = input.targetMinutes ?? input.profile.preferences.dailyGoalMinutes;
  const targetSeconds = Math.max(4, Math.min(25, target)) * 60;

  const ranked = rankExercises(input, rng);

  const items: PlannedItem[] = [];
  const usedModalities = new Set<Modality>();
  let seconds = 0;

  for (const id of ranked) {
    if (items.length >= MAX_ITEMS) break;
    const def = EXERCISES[id];
    const blockSeconds = def.secondsPerRound * def.defaultRounds;
    const wouldExceed = seconds + blockSeconds > targetSeconds * 1.15;
    if (items.length >= MIN_ITEMS && wouldExceed) continue;
    items.push({ exerciseId: id, rounds: def.defaultRounds });
    def.modalities.forEach((m) => usedModalities.add(m));
    seconds += blockSeconds;
    if (items.length >= MIN_ITEMS && seconds >= targetSeconds) break;
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
        seconds += def.secondsPerRound * def.defaultRounds;
        if (usedModalities.size >= 3) break;
      }
    }
  }

  return {
    items,
    estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
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
