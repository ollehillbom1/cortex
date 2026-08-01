import { describe, expect, it } from "vitest";
import {
  effectiveLevel,
  initialSkill,
  LATENCY_MIN_SAMPLES,
  MAX_LEVEL,
  medianInputMs,
  MIN_LEVEL,
  recentAccuracy,
  updateSkill,
} from "./engine";

const NOW = new Date("2026-07-31T10:00:00Z");

describe("adaptive engine", () => {
  it("starts at level 1", () => {
    const s = initialSkill(NOW);
    expect(s.level).toBe(1);
    expect(effectiveLevel(s)).toBe(1);
  });

  it("ramps up quickly during calibration for strong performance", () => {
    let s = initialSkill(NOW);
    for (let i = 0; i < 3; i++) s = updateSkill(s, { accuracy: 1 }, NOW);
    // 3 rounds x (+0.6 x 1.8, clamped to +1)
    expect(s.level).toBeGreaterThanOrEqual(3.5);
  });

  it("moves slowly inside the 70-85% target band", () => {
    let s = { ...initialSkill(NOW), attempts: 10, level: 5 };
    const before = s.level;
    s = updateSkill(s, { accuracy: 0.75 }, NOW);
    expect(s.level - before).toBeCloseTo(0.1, 5);
  });

  it("steps down on poor accuracy without harsh jumps", () => {
    let s = { ...initialSkill(NOW), attempts: 10, level: 5 };
    s = updateSkill(s, { accuracy: 0.2 }, NOW);
    expect(s.level).toBeGreaterThanOrEqual(4);
    expect(s.level).toBeLessThan(5);
  });

  it("never changes level by more than 1 per round", () => {
    let s = { ...initialSkill(NOW), level: 10, attempts: 0 };
    const up = updateSkill(s, { accuracy: 1 }, NOW);
    expect(up.level - s.level).toBeLessThanOrEqual(1);
    s = { ...initialSkill(NOW), level: 10, attempts: 0, streak: -5 };
    const down = updateSkill(s, { accuracy: 0 }, NOW);
    expect(s.level - down.level).toBeLessThanOrEqual(1);
  });

  it("discounts late-session failures (fatigue)", () => {
    const base = { ...initialSkill(NOW), attempts: 10, level: 8 };
    const fresh = updateSkill(base, { accuracy: 0.4, fatigue: 0 }, NOW);
    const tired = updateSkill(base, { accuracy: 0.4, fatigue: 1 }, NOW);
    expect(tired.level).toBeGreaterThan(fresh.level);
  });

  it("applies a safety valve after 3 consecutive failures", () => {
    let s = { ...initialSkill(NOW), attempts: 10, level: 8 };
    const single = updateSkill(s, { accuracy: 0.4 }, NOW);
    s = { ...s, streak: -2 };
    const third = updateSkill(s, { accuracy: 0.4 }, NOW);
    expect(third.level).toBeLessThan(single.level);
  });

  it("clamps to [MIN_LEVEL, MAX_LEVEL]", () => {
    let low = { ...initialSkill(NOW), level: MIN_LEVEL, attempts: 10 };
    for (let i = 0; i < 5; i++) low = updateSkill(low, { accuracy: 0 }, NOW);
    expect(low.level).toBe(MIN_LEVEL);

    let high = { ...initialSkill(NOW), level: MAX_LEVEL, attempts: 10 };
    for (let i = 0; i < 5; i++) high = updateSkill(high, { accuracy: 1 }, NOW);
    expect(high.level).toBe(MAX_LEVEL);
  });

  it("keeps a bounded recent-accuracy window", () => {
    let s = initialSkill(NOW);
    for (let i = 0; i < 15; i++) s = updateSkill(s, { accuracy: 0.8 }, NOW);
    expect(s.recent).toHaveLength(10);
    expect(recentAccuracy(s)).toBeCloseTo(0.8, 5);
  });

  it("halves upward steps when a correct answer took far longer than baseline", () => {
    const base = {
      ...initialSkill(NOW),
      attempts: 10,
      level: 8,
      recentInputMs: [2000, 2000, 2000],
    };
    const fast = updateSkill(base, { accuracy: 0.9, inputMs: 2000 }, NOW);
    const slow = updateSkill(base, { accuracy: 0.9, inputMs: 3500 }, NOW);
    expect(fast.level - base.level).toBeCloseTo(0.4, 5);
    expect(slow.level - base.level).toBeCloseTo(0.2, 5);
    expect(fast.level).toBeGreaterThan(slow.level);
  });

  it("latency never modulates downward steps and never dominates", () => {
    const base = {
      ...initialSkill(NOW),
      attempts: 10,
      level: 8,
      recentInputMs: [2000, 2000, 2000],
    };
    const slowFail = updateSkill(base, { accuracy: 0.4, inputMs: 5000 }, NOW);
    const plainFail = updateSkill(base, { accuracy: 0.4 }, NOW);
    expect(slowFail.level).toBeCloseTo(plainFail.level, 5);
    // A slow success still moves up, never down.
    const slowSuccess = updateSkill(base, { accuracy: 0.9, inputMs: 9000 }, NOW);
    expect(slowSuccess.level).toBeGreaterThan(base.level);
  });

  it("needs a latency baseline before modulating", () => {
    const base = {
      ...initialSkill(NOW),
      attempts: 10,
      level: 8,
      recentInputMs: [2000, 2000].slice(0, LATENCY_MIN_SAMPLES - 1),
    };
    expect(medianInputMs(base)).toBeNull();
    const slow = updateSkill(base, { accuracy: 0.9, inputMs: 9000 }, NOW);
    expect(slow.level - base.level).toBeCloseTo(0.4, 5);
  });

  it("keeps a bounded latency window and computes the median", () => {
    let s = { ...initialSkill(NOW), attempts: 10 };
    for (const ms of [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000]) {
      s = updateSkill(s, { accuracy: 0.75, inputMs: ms }, NOW);
    }
    expect(s.recentInputMs).toHaveLength(10);
    expect(s.recentInputMs[0]).toBe(2000);
    expect(medianInputMs({ ...s, recentInputMs: [3000, 1000, 2000] })).toBe(2000);
  });

  it("a hot streak accelerates: the third perfect round in a row steps a full level", () => {
    // Past calibration, at a level far below true skill.
    let s = { ...initialSkill(NOW), attempts: 10, level: 5 };
    s = updateSkill(s, { accuracy: 1 }, NOW); // +0.6
    s = updateSkill(s, { accuracy: 1 }, NOW); // +0.6
    const before = s.level;
    s = updateSkill(s, { accuracy: 1 }, NOW); // third in a row: full step
    expect(s.level - before).toBeCloseTo(1, 5);
    // And it keeps stepping fully while the streak holds.
    const prev = s.level;
    s = updateSkill(s, { accuracy: 1 }, NOW);
    expect(s.level - prev).toBeCloseTo(1, 5);
  });

  it("a hot streak breaks on the first round that is not near-perfect", () => {
    let s = { ...initialSkill(NOW), attempts: 10, level: 5 };
    for (let i = 0; i < 3; i++) s = updateSkill(s, { accuracy: 1 }, NOW);
    s = updateSkill(s, { accuracy: 0.8 }, NOW); // in-band round resets the run
    const before = s.level;
    s = updateSkill(s, { accuracy: 1 }, NOW); // first perfect again: normal step
    expect(s.level - before).toBeCloseTo(0.6, 5);
  });

  it("hot streak still respects the kid-mode damping", () => {
    let s = { ...initialSkill(NOW), attempts: 10, level: 5 };
    for (let i = 0; i < 2; i++) s = updateSkill(s, { accuracy: 1 }, NOW, { gentle: true });
    const before = s.level;
    s = updateSkill(s, { accuracy: 1 }, NOW, { gentle: true });
    // Full step damped by 25%, same as every other upward step in kid mode.
    expect(s.level - before).toBeCloseTo(0.75, 5);
  });

  it("kid mode ramps up more gently without changing downward relief", () => {
    // Calibration phase: gentler multiplier.
    const fresh = initialSkill(NOW);
    const normal = updateSkill(fresh, { accuracy: 1 }, NOW);
    const gentle = updateSkill(fresh, { accuracy: 1 }, NOW, { gentle: true });
    expect(gentle.level).toBeLessThan(normal.level);
    expect(gentle.level).toBeGreaterThan(1);

    // Settled phase: up-steps damped by 25%.
    const settled = { ...initialSkill(NOW), attempts: 10, level: 5 };
    const up = updateSkill(settled, { accuracy: 0.9 }, NOW, { gentle: true });
    expect(up.level - settled.level).toBeCloseTo(0.3, 5);

    // Downward steps are identical with and without kid mode.
    const downNormal = updateSkill(settled, { accuracy: 0.4 }, NOW);
    const downGentle = updateSkill(settled, { accuracy: 0.4 }, NOW, { gentle: true });
    expect(downGentle.level).toBeCloseTo(downNormal.level, 5);
  });

  it("is deterministic", () => {
    const a = updateSkill(initialSkill(NOW), { accuracy: 0.9 }, NOW);
    const b = updateSkill(initialSkill(NOW), { accuracy: 0.9 }, NOW);
    expect(a).toEqual(b);
  });

  it("converges into the target band for a simulated user", () => {
    // Simulated user: succeeds when level is below their true ability (12).
    const ability = 12;
    let s = initialSkill(NOW);
    for (let round = 0; round < 60; round++) {
      const lvl = s.level;
      const gap = ability - lvl;
      const accuracy = Math.max(0, Math.min(1, 0.78 + gap * 0.08));
      s = updateSkill(s, { accuracy }, NOW);
    }
    expect(s.level).toBeGreaterThan(ability - 3);
    expect(s.level).toBeLessThan(ability + 3);
  });
});
