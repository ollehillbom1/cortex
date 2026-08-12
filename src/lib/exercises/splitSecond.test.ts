import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { TARGET_LOW } from "@/lib/adaptive/engine";
import { generateSplitSecondTrials, scoreSplitSecond, splitSecondParams } from "./splitSecond";

describe("split second", () => {
  it("generates valid trials, deterministically", () => {
    for (const level of [1, 10, 21]) {
      const params = splitSecondParams(level);
      const trials = generateSplitSecondTrials(createRng(9), params);
      expect(trials).toHaveLength(params.trials);
      for (const trial of trials) {
        expect(trial.centre === 0 || trial.centre === 1).toBe(true);
        expect(trial.target).toBeGreaterThanOrEqual(0);
        expect(trial.target).toBeLessThan(params.positions);
        expect(trial.distractorAt).toHaveLength(params.distractors);
        // A distractor on the target's spot would hide the stimulus.
        expect(trial.distractorAt).not.toContain(trial.target);
        expect(new Set(trial.distractorAt).size).toBe(trial.distractorAt.length);
      }
      expect(generateSplitSecondTrials(createRng(9), params)).toEqual(trials);
    }
  });

  it("balances the centre symbols so frequency carries no information", () => {
    const trials = generateSplitSecondTrials(createRng(4), splitSecondParams(1));
    const zeros = trials.filter((t) => t.centre === 0).length;
    expect(zeros).toBe(trials.length / 2);
  });

  it("scores halves at half credit and guessing under the adaptive band", () => {
    const trials = generateSplitSecondTrials(createRng(2), splitSecondParams(1));
    const allRight = trials.map((t) => ({ centre: t.centre, target: t.target }));
    expect(scoreSplitSecond(trials, allRight)).toMatchObject({ accuracy: 1, perfect: true });

    const centreOnly = trials.map((t) => ({
      centre: t.centre,
      target: (t.target + 1) % 8,
    }));
    expect(scoreSplitSecond(trials, centreOnly).accuracy).toBeCloseTo(0.5);
    expect(scoreSplitSecond(trials, centreOnly).perfect).toBe(false);

    // Expected value of blind guessing: 0.5 * 1/2 + 0.5 * 1/8 ≈ 0.31 —
    // under the adaptive band, so guessing cannot level anyone up.
    expect(0.5 * (1 / 2) + 0.5 * (1 / 8)).toBeLessThan(TARGET_LOW);

    const nothing = trials.map(() => ({ centre: null, target: null }));
    expect(scoreSplitSecond(trials, nothing).accuracy).toBe(0);
  });
});
