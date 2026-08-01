import { ALL_EXERCISE_IDS, EXERCISES, type ExerciseId, type Profile } from "@/lib/domain/types";

/**
 * Which exercises a profile should be *offered* (issue #6).
 *
 * Three exercises are inherently visuospatial — a flashed grid or a colour
 * change is the stimulus, and no screen-reader rendering conveys it honestly.
 * Rather than pretend otherwise, each exercise declares `requiresVision`, and
 * profiles can ask to be offered only the exercises they can actually play.
 * Filtering is applied to recommendations and the library, never to direct
 * navigation: nothing becomes unreachable, it just stops being suggested.
 */

/** Exercises left after applying the profile's accessibility preferences. */
export function availableExerciseIds(profile: Profile): ExerciseId[] {
  if (!profile.preferences.excludeVisionRequired) return [...ALL_EXERCISE_IDS];
  return ALL_EXERCISE_IDS.filter((id) => !EXERCISES[id].requiresVision);
}

/** True when this exercise is filtered out by the profile's preferences. */
export function isExerciseHidden(profile: Profile, id: ExerciseId): boolean {
  return profile.preferences.excludeVisionRequired && EXERCISES[id].requiresVision;
}

/** Exercises playable without sight — the fallback if a filter empties the list. */
export const NON_VISUAL_EXERCISE_IDS: ExerciseId[] = ALL_EXERCISE_IDS.filter(
  (id) => !EXERCISES[id].requiresVision,
);
