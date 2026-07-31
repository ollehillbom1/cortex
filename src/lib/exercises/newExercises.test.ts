import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { generateMelody, scoreMelodyResponse, tonePatternParams } from "./tonePattern";
import { generateRhythm, onsetsFromIntervals, rhythmParams, scoreRhythm } from "./rhythm";
import {
  DUAL_NBACK_GATE_LEVEL,
  dualNBackParams,
  generateDualNBackStream,
  scoreDualNBack,
} from "./dualNBack";
import { planSession } from "@/lib/session/planner";
import { createProfile } from "@/lib/storage/profileFactory";
import { initialSkill } from "@/lib/adaptive/engine";

describe("tone pattern", () => {
  it("scales pads, length and speed with level", () => {
    expect(tonePatternParams(1).pads).toBe(4);
    expect(tonePatternParams(7).pads).toBe(5);
    expect(tonePatternParams(14).pads).toBe(6);
    expect(tonePatternParams(10).length).toBeGreaterThan(tonePatternParams(1).length);
    expect(tonePatternParams(15).noteMs).toBeLessThan(tonePatternParams(1).noteMs);
  });

  it("generates melodies within the pad range without immediate repeats", () => {
    const params = tonePatternParams(9);
    const melody = generateMelody(createRng(21), params);
    expect(melody).toHaveLength(params.length);
    for (const pad of melody) {
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(pad).toBeLessThan(params.pads);
    }
    for (let i = 1; i < melody.length; i++) expect(melody[i]).not.toBe(melody[i - 1]);
    expect(generateMelody(createRng(21), params)).toEqual(melody);
  });

  it("scores by longest correct prefix", () => {
    expect(scoreMelodyResponse([0, 2, 1], [0, 2, 1]).perfect).toBe(true);
    expect(scoreMelodyResponse([0, 2, 1], [0, 3, 1]).accuracy).toBeCloseTo(1 / 3);
  });
});

describe("rhythm recall", () => {
  it("scales beats, tempo and tolerance with level", () => {
    expect(rhythmParams(1).beats).toBe(3);
    expect(rhythmParams(12).beats).toBeGreaterThan(rhythmParams(1).beats);
    expect(rhythmParams(15).tolerance).toBeLessThan(rhythmParams(1).tolerance);
    expect(rhythmParams(40).tolerance).toBeGreaterThanOrEqual(0.16);
  });

  it("generates intervals as unit multiples and derives onsets", () => {
    const params = rhythmParams(5);
    const intervals = generateRhythm(createRng(3), params);
    expect(intervals).toHaveLength(params.beats - 1);
    for (const interval of intervals) {
      const ratio = interval / params.unitMs;
      expect([1, 1.5, 2].some((s) => Math.abs(ratio - s) < 0.01)).toBe(true);
    }
    const onsets = onsetsFromIntervals(intervals);
    expect(onsets[0]).toBe(0);
    expect(onsets).toHaveLength(params.beats);
    expect(onsets[onsets.length - 1]).toBe(intervals.reduce((a, b) => a + b, 0));
  });

  it("gives a perfect score for an exact reproduction", () => {
    const intervals = [400, 600, 400];
    const score = scoreRhythm(intervals, onsetsFromIntervals(intervals), 0.2);
    expect(score.perfect).toBe(true);
    expect(score.accuracy).toBe(1);
  });

  it("forgives a uniformly faster or slower tempo", () => {
    const intervals = [400, 600, 400];
    const slower = onsetsFromIntervals(intervals.map((i) => i * 1.3));
    const score = scoreRhythm(intervals, slower, 0.2);
    expect(score.accuracy).toBe(1);
    expect(score.tempoScale).toBeCloseTo(1 / 1.3, 2);
  });

  it("rejects a wrong pattern even at the right tempo", () => {
    const intervals = [400, 800, 400];
    // Same total duration, different pattern.
    const wrong = onsetsFromIntervals([800, 400, 400]);
    const score = scoreRhythm(intervals, wrong, 0.2);
    expect(score.accuracy).toBeLessThan(0.5);
    expect(score.perfect).toBe(false);
  });

  it("penalises missing and extra taps", () => {
    const intervals = [400, 400, 400];
    const missingTap = scoreRhythm(intervals, [0, 400, 800], 0.2);
    expect(missingTap.accuracy).toBeLessThan(1);
    const extraTap = scoreRhythm(intervals, [0, 400, 800, 1200, 1600], 0.2);
    expect(extraTap.accuracy).toBeLessThan(1);
    expect(scoreRhythm(intervals, [0], 0.2).accuracy).toBe(0);
  });
});

describe("dual n-back", () => {
  it("maps levels to 1/2/3-back with a slower stream than single n-back", () => {
    expect(dualNBackParams(1).n).toBe(1);
    expect(dualNBackParams(5).n).toBe(2);
    expect(dualNBackParams(12).n).toBe(3);
    expect(dualNBackParams(5).gapMs).toBeGreaterThanOrEqual(1600);
  });

  it("generates two independent streams with forced match structure", () => {
    const params = dualNBackParams(6);
    const stream = generateDualNBackStream(createRng(77), params);
    expect(stream.position).toHaveLength(params.trials);
    expect(stream.sound).toHaveLength(params.trials);
    for (const channel of [stream.position, stream.sound]) {
      for (let i = params.n; i < channel.length; i++) {
        const same = channel[i].position === channel[i - params.n].position;
        expect(same).toBe(channel[i].isMatch);
      }
    }
    // Channels are genuinely independent: match positions differ somewhere.
    const posMatches = stream.position.map((s) => s.isMatch).join("");
    const sndMatches = stream.sound.map((s) => s.isMatch).join("");
    expect(posMatches).not.toBe(sndMatches);
  });

  it("scores channels independently and averages accuracy", () => {
    const params = dualNBackParams(6);
    const stream = generateDualNBackStream(createRng(5), params);
    const perfectPos = stream.position.map((s) => s.isMatch);
    const silentSound = stream.sound.map(() => false);
    const score = scoreDualNBack(stream, perfectPos, silentSound, params.n);
    expect(score.position.accuracy).toBe(1);
    expect(score.sound.accuracy).toBeLessThan(1);
    expect(score.accuracy).toBeCloseTo((1 + score.sound.accuracy) / 2, 5);
    expect(score.perfect).toBe(false);

    const perfectSound = stream.sound.map((s) => s.isMatch);
    expect(scoreDualNBack(stream, perfectPos, perfectSound, params.n).perfect).toBe(true);
  });
});

describe("planner gating for dual n-back", () => {
  it("excludes dual n-back until single n-back reaches the gate level", () => {
    const novice = createProfile({ id: "p", name: "N" });
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const plan = planSession({ profile: novice, recentSessions: [], seed });
      expect(plan.items.map((i) => i.exerciseId)).not.toContain("dual-n-back");
    }
  });

  it("allows dual n-back once the gate is reached", () => {
    const adept = createProfile({ id: "p", name: "A" });
    adept.skills["n-back"] = { ...initialSkill(), level: DUAL_NBACK_GATE_LEVEL, attempts: 20 };
    let seen = false;
    for (const seed of Array.from({ length: 60 }, (_, i) => i)) {
      const plan = planSession({ profile: adept, recentSessions: [], seed });
      if (plan.items.some((i) => i.exerciseId === "dual-n-back")) seen = true;
    }
    expect(seen).toBe(true);
  });
});
