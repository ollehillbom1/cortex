import { describe, expect, it } from "vitest";
import {
  availableExerciseIds,
  isExerciseHidden,
  unplayableReason,
  NON_VISUAL_EXERCISE_IDS,
} from "./availability";
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

  it("drops audio-only exercises when sound is off", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.preferences.audioEnabled = false;
    const ids = availableExerciseIds(profile);
    expect(ids.every((id) => !EXERCISES[id].requiresAudio)).toBe(true);
    expect(isExerciseHidden(profile, "auditory-digits")).toBe(true);
    expect(unplayableReason(profile, "auditory-digits")).toBe("audio");
    expect(unplayableReason(profile, "number-span")).toBeNull();
  });

  it("reports an empty list when the preferences leave nothing playable", () => {
    // Every non-vision exercise requires audio, so this combination has no
    // playable exercise at all. It must surface as empty, not as a session
    // of blocks the user cannot perceive — those used to score accuracy 0.
    const profile = createProfile({ id: "p", name: "P" });
    profile.preferences.excludeVisionRequired = true;
    profile.preferences.audioEnabled = false;
    expect(availableExerciseIds(profile)).toEqual([]);
  });

  it("never offers an exercise the profile cannot perceive", () => {
    for (const excludeVisionRequired of [false, true]) {
      for (const audioEnabled of [false, true]) {
        const profile = createProfile({ id: "p", name: "P" });
        profile.preferences.excludeVisionRequired = excludeVisionRequired;
        profile.preferences.audioEnabled = audioEnabled;
        for (const id of availableExerciseIds(profile)) {
          expect(unplayableReason(profile, id)).toBeNull();
        }
      }
    }
  });

  it("marks every exercise with explicit sensory requirements", () => {
    for (const id of ALL_EXERCISE_IDS) {
      const def = EXERCISES[id];
      expect(typeof def.requiresVision).toBe("boolean");
      expect(typeof def.requiresAudio).toBe("boolean");
    }
  });
});
