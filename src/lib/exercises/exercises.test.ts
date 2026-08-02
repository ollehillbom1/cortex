import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { EXERCISES } from "@/lib/domain/types";
import { MAX_LEVEL, effectiveLevel, initialSkill, updateSkill } from "@/lib/adaptive/engine";
import { expectedAnswer, generateDigits, numberSpanParams, scoreSpanResponse } from "./numberSpan";
import { generateSequence, scoreSequenceResponse, sequenceParams } from "./sequenceMemory";
import { generatePattern, patternParams, scorePatternResponse } from "./visualPattern";
import { generateNBackStream, nBackParams, scoreNBack } from "./nback";
import { generateDelay, reactionParams, scoreReaction } from "./reaction";

describe("number span", () => {
  it("generates the requested span deterministically without immediate repeats", () => {
    const digits = generateDigits(createRng(42), 8);
    expect(digits).toHaveLength(8);
    for (let i = 1; i < digits.length; i++) expect(digits[i]).not.toBe(digits[i - 1]);
    expect(generateDigits(createRng(42), 8)).toEqual(digits);
  });

  it("keeps spans in a sane range across levels", () => {
    for (let level = 1; level <= 40; level++) {
      const p = numberSpanParams(level, 0);
      expect(p.span).toBeGreaterThanOrEqual(2);
      expect(p.span).toBeLessThanOrEqual(23);
      expect(p.digitMs).toBeGreaterThanOrEqual(450);
    }
  });

  it("introduces reverse recall from level 4 on alternating rounds", () => {
    expect(numberSpanParams(3, 1).direction).toBe("forward");
    expect(numberSpanParams(4, 0).direction).toBe("forward");
    expect(numberSpanParams(4, 1).direction).toBe("reverse");
  });

  it("reverses the expected answer for reverse recall", () => {
    expect(expectedAnswer([1, 2, 3], "reverse")).toEqual([3, 2, 1]);
    expect(expectedAnswer([1, 2, 3], "forward")).toEqual([1, 2, 3]);
  });

  it("scores by longest correct prefix", () => {
    expect(scoreSpanResponse([1, 2, 3, 4], [1, 2, 9, 4])).toEqual({
      accuracy: 0.5,
      perfect: false,
      correctPrefix: 2,
    });
    expect(scoreSpanResponse([1, 2], [1, 2]).perfect).toBe(true);
    expect(scoreSpanResponse([1, 2], []).accuracy).toBe(0);
  });
});

describe("sequence memory", () => {
  it("generates sequences within the grid without immediate repeats", () => {
    const params = sequenceParams(10);
    const seq = generateSequence(createRng(7), params);
    expect(seq).toHaveLength(params.length);
    const cells = params.gridSize * params.gridSize;
    for (const c of seq) expect(c).toBeGreaterThanOrEqual(0);
    for (const c of seq) expect(c).toBeLessThan(cells);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it("scales grid and speed with level", () => {
    expect(sequenceParams(1).gridSize).toBe(3);
    expect(sequenceParams(8).gridSize).toBe(4);
    expect(sequenceParams(20).litMs).toBeLessThan(sequenceParams(1).litMs);
  });

  it("validates responses by correct prefix", () => {
    const score = scoreSequenceResponse([0, 4, 2], [0, 4, 8]);
    expect(score.correctPrefix).toBe(2);
    expect(score.accuracy).toBeCloseTo(2 / 3);
    expect(scoreSequenceResponse([0, 4, 2], [0, 4, 2]).perfect).toBe(true);
  });
});

describe("visual pattern", () => {
  it("generates distinct cells that fit the grid", () => {
    const params = patternParams(15);
    const pattern = generatePattern(createRng(3), params);
    expect(new Set(pattern).size).toBe(params.activeCells);
    for (const c of pattern) expect(c).toBeLessThan(params.gridSize ** 2);
  });

  it("never asks for nearly the whole grid", () => {
    for (let level = 1; level <= 40; level++) {
      const p = patternParams(level);
      expect(p.activeCells).toBeLessThanOrEqual(p.gridSize ** 2 - 2);
    }
  });

  it("penalises extra selections so tap-everything cannot win", () => {
    const expected = [0, 1, 2];
    const everything = Array.from({ length: 9 }, (_, i) => i);
    const score = scorePatternResponse(expected, everything);
    expect(score.accuracy).toBe(0);
    expect(scorePatternResponse(expected, [0, 1, 2]).perfect).toBe(true);
    expect(scorePatternResponse(expected, [0, 1]).accuracy).toBeCloseTo(2 / 3);
  });
});

describe("n-back", () => {
  it("maps levels to 1/2/3-back", () => {
    expect(nBackParams(1).n).toBe(1);
    expect(nBackParams(4).n).toBe(2);
    expect(nBackParams(10).n).toBe(3);
  });

  it("generates streams with the forced match structure", () => {
    for (const level of [1, 5, 12]) {
      const params = nBackParams(level);
      const stream = generateNBackStream(createRng(99), params);
      expect(stream).toHaveLength(params.trials);
      const matches = stream.filter((s) => s.isMatch).length;
      const scoreable = params.trials - params.n;
      expect(matches).toBe(Math.max(1, Math.round(scoreable * params.matchRate)));
      // Every flagged match really matches; every non-match really differs.
      for (let i = params.n; i < stream.length; i++) {
        const same = stream[i].position === stream[i - params.n].position;
        expect(same).toBe(stream[i].isMatch);
      }
    }
  });

  it("scores hits, misses, false alarms and correct rejections", () => {
    const stream = [
      { position: 0, isMatch: false },
      { position: 1, isMatch: false },
      { position: 0, isMatch: true },
      { position: 2, isMatch: false },
      { position: 0, isMatch: true },
    ];
    // n=2: scoreable indices 2,3,4. User responds at 2 (hit) and 3 (false alarm).
    const responses = [false, false, true, true, false];
    const score = scoreNBack(stream, responses, 2);
    expect(score).toMatchObject({ hits: 1, falseAlarms: 1, misses: 1, correctRejections: 0 });
    expect(score.accuracy).toBeCloseTo(1 / 3);
    expect(score.perfect).toBe(false);
  });

  it("marks a clean run perfect", () => {
    const params = nBackParams(2);
    const stream = generateNBackStream(createRng(5), params);
    const responses = stream.map((s) => s.isMatch);
    expect(scoreNBack(stream, responses, params.n).perfect).toBe(true);
  });
});

describe("level ceilings", () => {
  const PARAMS: Record<string, (level: number) => unknown> = {
    "number-span": (l) => numberSpanParams(l, 0),
    "sequence-memory": (l) => sequenceParams(l),
    "visual-pattern": (l) => patternParams(l),
    "n-back": (l) => nBackParams(l),
  };

  it("stops each exercise where its parameters stop changing", () => {
    // The shared scale runs to 40, but n-back's parameters are identical from
    // 18 up: every level above was the same round with a bigger number and a
    // bigger XP bonus. maxLevel is measured here so it cannot drift from the
    // code that defines the difficulty.
    for (const [id, params] of Object.entries(PARAMS)) {
      let lastChange = 1;
      let previous = "";
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const current = JSON.stringify(params(level));
        if (current !== previous) lastChange = level;
        previous = current;
      }
      expect(EXERCISES[id as keyof typeof EXERCISES].maxLevel).toBe(lastChange);
    }
  });

  it("never reports a level above the exercise's ceiling", () => {
    const skill = { ...initialSkill(), level: 40 };
    expect(effectiveLevel(skill, EXERCISES["n-back"].maxLevel)).toBe(18);
    expect(effectiveLevel(skill, EXERCISES["visual-pattern"].maxLevel)).toBe(30);
    // ...and the estimate itself stops climbing, so XP cannot inflate either.
    let state = { ...initialSkill(), level: 17.9 };
    for (let i = 0; i < 20; i++) {
      state = updateSkill(state, { accuracy: 1 }, new Date(), { maxLevel: 18 });
    }
    expect(state.level).toBe(18);
  });

  it("records the plateaus that remain inside the usable range", () => {
    // Honest ceiling, not an honest ramp: span-style exercises grow every
    // OTHER level by construction, so roughly half the steps below the
    // ceiling still change nothing. Pinned rather than papered over, so the
    // next change to the ramp shows up here.
    const inert: Record<string, number> = {};
    for (const [id, params] of Object.entries(PARAMS)) {
      const cap = EXERCISES[id as keyof typeof EXERCISES].maxLevel;
      let previous = JSON.stringify(params(1));
      let count = 0;
      for (let level = 2; level <= cap; level++) {
        const current = JSON.stringify(params(level));
        if (current === previous) count += 1;
        previous = current;
      }
      inert[id] = count;
    }
    expect(inert).toEqual({
      "number-span": 12,
      "sequence-memory": 10,
      "visual-pattern": 3,
      "n-back": 0,
    });
  });
});

describe("reaction", () => {
  it("generates delays inside the configured window", () => {
    const params = reactionParams(1);
    const rng = createRng(11);
    for (let i = 0; i < 50; i++) {
      const d = generateDelay(rng, params);
      expect(d).toBeGreaterThanOrEqual(params.minDelayMs);
      expect(d).toBeLessThanOrEqual(params.maxDelayMs);
    }
  });

  it("computes averages, best and false starts", () => {
    const score = scoreReaction([
      { kind: "ok", ms: 200 },
      { kind: "ok", ms: 300 },
      { kind: "false-start" },
      { kind: "ok", ms: 250 },
    ]);
    expect(score.averageMs).toBe(250);
    expect(score.bestMs).toBe(200);
    expect(score.falseStarts).toBe(1);
    expect(score.validRounds).toBe(3);
  });

  it("maps speed onto the adaptive accuracy scale", () => {
    const fast = scoreReaction([{ kind: "ok", ms: 200 }]);
    const slow = scoreReaction([{ kind: "ok", ms: 700 }]);
    expect(fast.accuracy).toBeGreaterThan(0.9);
    expect(slow.accuracy).toBeLessThanOrEqual(0.31);
    const none = scoreReaction([{ kind: "false-start" }, { kind: "timeout" }]);
    expect(none.accuracy).toBe(0);
    expect(none.averageMs).toBeNull();
  });
});
