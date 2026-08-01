import { describe, expect, it } from "vitest";
import { availableExerciseIds, isExerciseHidden, NON_VISUAL_EXERCISE_IDS } from "./availability";
import { createProfile } from "@/lib/storage/profileFactory";
import { ALL_EXERCISE_IDS, EXERCISES } from "@/lib/domain/types";

describe("exercise availability", () => {
  it("offers everything by default", () => {
    const profile = createProfile({ id: "p", name: "P" });
    expect(availableExerciseIds(profile)).toEqual(ALL_EXERCISE_IDS);
  });

  it("drops vision-only exercises when the preference is on", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.preferences.excludeVisionRequired = true;
    const ids = availableExerciseIds(profile);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => !EXERCISES[id].requiresVision)).toBe(true);
    expect(isExerciseHidden(profile, "visual-pattern")).toBe(true);
    expect(isExerciseHidden(profile, "tone-pattern")).toBe(false);
  });

  it("keeps enough non-visual exercises to cover several modalities", () => {
    // The honest-labelling policy is only defensible if a fully auditory
    // programme remains playable.
    expect(NON_VISUAL_EXERCISE_IDS.length).toBeGreaterThanOrEqual(3);
    const modalities = new Set(NON_VISUAL_EXERCISE_IDS.flatMap((id) => EXERCISES[id].modalities));
    expect(modalities.size).toBeGreaterThanOrEqual(3);
  });

  it("marks every exercise with explicit sensory requirements", () => {
    for (const id of ALL_EXERCISE_IDS) {
      const def = EXERCISES[id];
      expect(typeof def.requiresVision).toBe("boolean");
      expect(typeof def.requiresAudio).toBe("boolean");
    }
  });
});
