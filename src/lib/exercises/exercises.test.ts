import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { EXERCISES } from "@/lib/domain/types";
import {
  MAX_LEVEL,
  MIN_LEVEL,
  TARGET_LOW,
  effectiveLevel,
  initialSkill,
  updateSkill,
} from "@/lib/adaptive/engine";
import { expectedAnswer, generateDigits, numberSpanParams, scoreSpanResponse } from "./numberSpan";
import { generateSequence, scoreSequenceResponse, sequenceParams } from "./sequenceMemory";
import { generatePattern, patternParams, scorePatternResponse } from "./visualPattern";
import { generateNBackStream, nBackParams, scoreNBack } from "./nback";
import { generateDelay, reactionParams, scoreReaction } from "./reaction";
import type { ReactionParams } from "./reaction";
import { dualNBackParams } from "./dualNBack";
import { tonePatternParams } from "./tonePattern";
import { rhythmParams } from "./rhythm";

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

  it("auditory pacing lives in digitMs, the parameter the sound UI actually uses", () => {
    // The review found digitMs computed and never used: the spoken/tone gap
    // was a constant, so "level up" changed nothing audible. The auditory
    // ramp now lives entirely in digitMs — strictly faster on every level
    // up to the ceiling, with the floor binding exactly there.
    const cap = EXERCISES["auditory-digits"].maxLevel;
    for (let level = 2; level <= cap; level++) {
      const prev = numberSpanParams(level - 1, 0, "auditory");
      const curr = numberSpanParams(level, 0, "auditory");
      expect(curr.digitMs, `level ${level} does not pace faster`).toBeLessThan(prev.digitMs);
      expect(curr.gapMs).toBe(prev.gapMs); // constant: it is not what the UI paces by
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
  it("maps levels to 1/2/3/4/5-back", () => {
    expect(nBackParams(1).n).toBe(1);
    expect(nBackParams(4).n).toBe(2);
    expect(nBackParams(10).n).toBe(3);
    expect(nBackParams(19).n).toBe(4);
    expect(nBackParams(27).n).toBe(5);
  });

  it("generates streams with the forced match structure", () => {
    // Includes lure-band levels: a lure must never break the non-match
    // guarantee, whatever the rng does.
    for (const level of [1, 5, 12, 22, 30]) {
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

  it("keeps lures out of the ladder below the 4-back band", () => {
    // Absence (not 0) is what keeps levels 1-18 byte-identical to what
    // measurement version 1 fingerprinted — the extension must stay
    // additive. Same contract for dual n-back below its 4-back band.
    for (let level = 1; level <= 18; level++) {
      expect("lureRate" in nBackParams(level), `n-back level ${level}`).toBe(false);
    }
    expect(nBackParams(19).lureRate).toBeGreaterThan(0);
    for (let level = 1; level <= 20; level++) {
      expect("lureRate" in dualNBackParams(level), `dual level ${level}`).toBe(false);
    }
    expect(dualNBackParams(21).lureRate).toBeGreaterThan(0);
  });

  it("places n±1 lures among non-matches when lureRate is set", () => {
    // Force every non-match through the lure path: each should copy the
    // position n-1 or n+1 back whenever that position differs from the one
    // n back (when it coincides, the generator must fall back to plain
    // different-at-random rather than mint an accidental match).
    const params = { ...nBackParams(22), lureRate: 1 };
    const stream = generateNBackStream(createRng(7), params);
    const n = params.n;
    let lures = 0;
    for (let i = n; i < stream.length; i++) {
      if (stream[i].isMatch) continue;
      const near = i - (n - 1) >= 0 && stream[i].position === stream[i - (n - 1)].position;
      const far = i - (n + 1) >= 0 && stream[i].position === stream[i - (n + 1)].position;
      if (near || far) lures++;
    }
    expect(lures).toBeGreaterThan(0);
  });

  it("generates identical streams for pre-extension levels (same seed)", () => {
    // The lure branch consumes rng draws only when lureRate is present, so
    // a level-12 stream must not depend on the lure code existing at all:
    // pin the exact stream a fixed seed produced before the extension.
    // Values verified against the pre-extension generator run standalone.
    const stream = generateNBackStream(createRng(42), nBackParams(12));
    expect(stream.slice(0, 5).map((s) => s.position)).toEqual([2, 5, 7, 4, 2]);
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
    // Balanced: hitRate 1/2, specificity 0/1 -> 0.25 (plain accuracy said 1/3).
    expect(score.hitRate).toBeCloseTo(0.5);
    expect(score.specificity).toBe(0);
    expect(score.accuracy).toBeCloseTo(0.25);
    expect(score.perfect).toBe(false);
  });

  it("scores every one-sided strategy at chance, never inside the target band", () => {
    // The bug this pins: with ~30% matches, plain accuracy paid a
    // non-responder ~70%, which sits in the adaptive band [0.70, 0.85] and
    // levelled them up for doing nothing.
    for (const level of [1, 2, 3, 5, 10, 20]) {
      const params = nBackParams(level);
      for (const seed of [1, 7, 42]) {
        const stream = generateNBackStream(createRng(seed), params);
        const alwaysNo = scoreNBack(
          stream,
          stream.map(() => false),
          params.n,
        );
        const alwaysYes = scoreNBack(
          stream,
          stream.map(() => true),
          params.n,
        );
        expect(alwaysNo.accuracy).toBeCloseTo(0.5);
        expect(alwaysYes.accuracy).toBeCloseTo(0.5);
        expect(alwaysNo.accuracy).toBeLessThan(TARGET_LOW);
        expect(alwaysYes.accuracy).toBeLessThan(TARGET_LOW);
      }
    }
  });

  it("does not let a non-responder gain levels", () => {
    const params = nBackParams(2);
    const stream = generateNBackStream(createRng(3), params);
    const accuracy = scoreNBack(
      stream,
      stream.map(() => false),
      params.n,
    ).accuracy;
    let skill = initialSkill();
    for (let i = 0; i < 10; i++) skill = updateSkill(skill, { accuracy });
    expect(skill.level).toBe(MIN_LEVEL);
  });

  it("still scores genuine discrimination above the band", () => {
    const params = nBackParams(4);
    const stream = generateNBackStream(createRng(11), params);
    // Miss one match, otherwise flawless.
    let missed = false;
    const responses = stream.map((s) => {
      if (s.isMatch && !missed) {
        missed = true;
        return false;
      }
      return s.isMatch;
    });
    const score = scoreNBack(stream, responses, params.n);
    expect(score.specificity).toBe(1);
    expect(score.accuracy).toBeGreaterThan(0.85);
    expect(score.accuracy).toBeLessThan(1);
  });

  it("marks a clean run perfect", () => {
    const params = nBackParams(2);
    const stream = generateNBackStream(createRng(5), params);
    const responses = stream.map((s) => s.isMatch);
    expect(scoreNBack(stream, responses, params.n).perfect).toBe(true);
  });
});

describe("level ceilings", () => {
  // All nine, called as their game components call them. Four of nine were
  // covered before, so five ceilings were hand-pinned and checked by nothing:
  // setting dual-n-back's to 37 left the whole suite green.
  const PARAMS: Record<string, (level: number) => unknown> = {
    "number-span": (l) => [0, 1].map((r) => numberSpanParams(l, r)),
    // The auditory VARIANT, not a copy of the visual one: its timings have
    // their own slopes and floors, so measuring the visual mapping here
    // would certify a ceiling the sound version does not have.
    "auditory-digits": (l) => [0, 1].map((r) => numberSpanParams(l, r, "auditory")),
    "sequence-memory": (l) => sequenceParams(l),
    "visual-pattern": (l) => patternParams(l),
    "n-back": (l) => nBackParams(l),
    "dual-n-back": (l) => dualNBackParams(l),
    "tone-pattern": (l) => tonePatternParams(l),
    "rhythm-recall": (l) => rhythmParams(l),
    // Still fed a level, deliberately: reactionParams ignores it, and the
    // measurement below is only meaningful if a reintroduced dependence
    // would show up here.
    "reaction-time": (l) => (reactionParams as (level?: number) => ReactionParams)(l),
  };

  it("stops each exercise where its parameters stop changing", () => {
    // The shared scale runs to 40, but each ladder goes inert somewhere
    // below it (n-back's parameters are identical from 35 up, and were from
    // 18 up before the 4/5-back bands): every level above is the same round
    // with a bigger number and a bigger XP bonus. maxLevel is measured here
    // so it cannot drift from the code that defines the difficulty.
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
    expect(effectiveLevel(skill, EXERCISES["n-back"].maxLevel)).toBe(35);
    expect(effectiveLevel(skill, EXERCISES["visual-pattern"].maxLevel)).toBe(30);
    // ...and the estimate itself stops climbing, so XP cannot inflate either.
    let state = { ...initialSkill(), level: 17.9 };
    for (let i = 0; i < 20; i++) {
      state = updateSkill(state, { accuracy: 1 }, new Date(), { maxLevel: 18 });
    }
    expect(state.level).toBe(18);
  });

  it("clamps every displayed level, not just the one XP uses", () => {
    // An estimate above a new ceiling — which existing n-back profiles have —
    // was shown unclamped everywhere except the XP calculation, and #52 then
    // ranked on it, producing a "141% progress" strength on a level the
    // exercise can no longer produce.
    const inflated = { ...initialSkill(), level: 25, attempts: 10 };
    for (const id of Object.keys(EXERCISES) as (keyof typeof EXERCISES)[]) {
      const cap = EXERCISES[id].maxLevel;
      expect(effectiveLevel(inflated, cap)).toBeLessThanOrEqual(cap);
    }
    // Pinned on the exercise whose ceiling still sits below the inflated
    // estimate (n-back's original example stopped clamping when its ladder
    // was extended to 35).
    expect(effectiveLevel(inflated, EXERCISES["tone-pattern"].maxLevel)).toBe(19);
  });

  it("changes at least one parameter on every exposed step", () => {
    // The in-range cousin of the ceiling rule above. Span-style exercises
    // used to grow every other level while their timings sat on a floor, so
    // roughly half the steps below the ceiling changed nothing: a "level up"
    // the user could not feel and the stats still rewarded. The gap timings
    // now carry the ramp past the point where the primary timing bottoms
    // out, so an inert step anywhere below the ceiling is a regression.
    for (const [id, params] of Object.entries(PARAMS)) {
      const cap = EXERCISES[id as keyof typeof EXERCISES].maxLevel;
      let previous = JSON.stringify(params(1));
      for (let level = 2; level <= cap; level++) {
        const current = JSON.stringify(params(level));
        expect(current, `${id} level ${level} changes nothing`).not.toBe(previous);
        previous = current;
      }
    }
  });
});

describe("reaction", () => {
  it("generates delays inside the configured window", () => {
    const params = reactionParams();
    const rng = createRng(11);
    for (let i = 0; i < 50; i++) {
      const d = generateDelay(rng, params);
      expect(d).toBeGreaterThanOrEqual(params.minDelayMs);
      expect(d).toBeLessThanOrEqual(params.maxDelayMs);
    }
  });

  it("has no difficulty scale, and says so", () => {
    // The UI offered a difficulty stepper running to 40 and the profile showed
    // a rising "Lv N", but scoreReaction is a pure function of milliseconds:
    // the same performance scored identically at every level. The parameters
    // the level used to move were the delay window, which changes how
    // predictable the signal is, not how hard the task is.
    expect(EXERCISES["reaction-time"].maxLevel).toBe(MIN_LEVEL);
    // Checked by calling, not by inspecting the signature: a default
    // parameter would leave Function.length at 0 while quietly restoring the
    // level dependence. Cast so this still compiles once the parameter is
    // gone from the type.
    const at = (level: number) =>
      JSON.stringify((reactionParams as (level?: number) => ReactionParams)(level));
    for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
      expect(at(level)).toBe(at(MIN_LEVEL));
    }
  });

  it("scores a performance the same however the session was configured", () => {
    const rounds = [
      { kind: "ok", ms: 240 },
      { kind: "ok", ms: 310 },
      { kind: "false-start" },
    ] as const;
    const score = scoreReaction([...rounds]);
    // Re-scoring the identical rounds must be identical — there is no second
    // input that could move it. Stated as a test so a future "level affects
    // scoring" change has to delete this rather than silently pass.
    expect(scoreReaction([...rounds])).toEqual(score);
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
