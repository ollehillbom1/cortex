import { ALL_EXERCISE_IDS, EXERCISES, type ExerciseId, type Profile } from "@/lib/domain/types";

/**
 * Which exercises a profile should be *offered* (issue #6).
 *
 * Three exercises are inherently visuospatial — a flashed grid or a colour
 * change is the stimulus, and no screen-reader rendering conveys it honestly.
 * Four others cannot be played at all with the sound off. Each exercise
 * declares `requiresVision` and `requiresAudio`, and an exercise is offered
 * only when the profile can actually perceive its stimulus.
 *
 * Filtering is applied to recommendations and the library, never to direct
 * navigation: nothing becomes unreachable, it just stops being suggested.
 *
 * The two filters overlap to nothing: with vision-requiring exercises left
 * out, every remaining exercise needs audio. Sound off plus that preference
 * therefore leaves an empty list, and callers must say so honestly rather
 * than plan a session of exercises the user cannot play — an unplayable
 * block used to be scored as accuracy 0.
 */

/** Exercises left after applying the profile's accessibility preferences. */
export function availableExerciseIds(profile: Profile): ExerciseId[] {
  const skipVision = profile.preferences.excludeVisionRequired;
  const skipAudio = !profile.preferences.audioEnabled;
  if (!skipVision && !skipAudio) return [...ALL_EXERCISE_IDS];
  return ALL_EXERCISE_IDS.filter((id) => {
    const def = EXERCISES[id];
    if (skipVision && def.requiresVision) return false;
    if (skipAudio && def.requiresAudio) return false;
    return true;
  });
}

/** True when this exercise is filtered out by the profile's preferences. */
export function isExerciseHidden(profile: Profile, id: ExerciseId): boolean {
  return !availableExerciseIds(profile).includes(id);
}

/** Why an exercise cannot be played right now, or null when it can. */
export function unplayableReason(profile: Profile, id: ExerciseId): "vision" | "audio" | null {
  const def = EXERCISES[id];
  if (profile.preferences.excludeVisionRequired && def.requiresVision) return "vision";
  if (!profile.preferences.audioEnabled && def.requiresAudio) return "audio";
  return null;
}

/** Exercises playable without sight — the fallback if a filter empties the list. */
export const NON_VISUAL_EXERCISE_IDS: ExerciseId[] = ALL_EXERCISE_IDS.filter(
  (id) => !EXERCISES[id].requiresVision,
);
