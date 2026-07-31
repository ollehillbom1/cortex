import { describe, expect, it } from "vitest";
import {
  effectiveLevel,
  initialSkill,
  MAX_LEVEL,
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
