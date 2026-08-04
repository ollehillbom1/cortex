import { describe, expect, it } from "vitest";
import { betterPersonalRecord } from "./records";
import { mergeProfiles } from "@/lib/sync/merge";
import { applySession } from "@/lib/session/apply";
import { createProfile } from "@/lib/storage/profileFactory";
import type { ExerciseResult } from "@/lib/domain/types";

/**
 * The era rule for personal records. The concrete case that motivates all
 * of it: reaction records set before painted-frame timing (#51) measured
 * from before render, so they are systematically FASTER than any honest
 * time — an old 180 ms is unbeatable by a real 210 ms for being wrong,
 * not for being good.
 */

const rec = (value: number, measurementVersion?: number) => ({
  value,
  achievedAt: "2026-08-01T10:00:00.000Z",
  ...(measurementVersion !== undefined ? { measurementVersion } : {}),
});

describe("betterPersonalRecord", () => {
  it("count records compare by value across eras — nine digits are nine digits", () => {
    expect(betterPersonalRecord("number-span:maxSpan", rec(9, 1), rec(7))).toBe(true);
    expect(betterPersonalRecord("number-span:maxSpan", rec(5, 1), rec(9))).toBe(false);
    expect(betterPersonalRecord("n-back:level", rec(12, 1), rec(14))).toBe(false);
  });

  it("an Ms record from an older era never blocks the current one", () => {
    // The dishonest 180 ms yields to the honest 210 ms.
    expect(betterPersonalRecord("reaction-time:bestMs", rec(210, 1), rec(180))).toBe(true);
  });

  it("within one era, Ms records compare normally", () => {
    expect(betterPersonalRecord("reaction-time:bestMs", rec(190, 1), rec(210, 1))).toBe(true);
    expect(betterPersonalRecord("reaction-time:bestMs", rec(230, 1), rec(210, 1))).toBe(false);
  });

  it("a rolled-back device cannot resurrect the old clock", () => {
    // Candidate from the OLDER era against a current-era record: refused
    // even though its number is lower.
    expect(betterPersonalRecord("reaction-time:bestMs", rec(150), rec(210, 1))).toBe(false);
  });

  it("no existing record: any finite candidate stands", () => {
    expect(betterPersonalRecord("reaction-time:bestMs", rec(500, 1), undefined)).toBe(true);
  });
});

describe("the rule holds at both call sites", () => {
  const reactionResult = (bestResponseMs: number, measurementVersion?: number): ExerciseResult => ({
    exerciseId: "reaction-time",
    rounds: 5,
    accuracy: 1,
    levelBefore: 1,
    levelAfter: 1,
    xp: 10,
    bestResponseMs,
    ...(measurementVersion !== undefined ? { measurementVersion } : {}),
  });

  it("session apply: an honest slower time replaces the old-era record", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.records["reaction-time:bestMs"] = rec(180); // pre-#51, unknown era

    const applied = applySession({
      profile,
      session: {
        id: "s1",
        profileId: "p",
        type: "single",
        startedAt: "2026-08-04T10:00:00.000Z",
        endedAt: "2026-08-04T10:05:00.000Z",
        durationMs: 300_000,
        exercises: [reactionResult(210, 1)],
        xpEarned: 10,
        unlocked: [],
      },
      priorSessionCount: 3,
      now: new Date("2026-08-04T10:05:00.000Z"),
    });
    expect(applied.profile.records["reaction-time:bestMs"].value).toBe(210);
    expect(applied.profile.records["reaction-time:bestMs"].measurementVersion).toBe(1);
  });

  it("cross-device merge: the stale device does not re-instate what apply retired", () => {
    const updated = createProfile({ id: "p", name: "P", now: new Date("2026-01-01") });
    updated.updatedAt = "2026-08-04T10:00:00.000Z";
    updated.records["reaction-time:bestMs"] = rec(210, 1);

    const stale = createProfile({ id: "p", name: "P", now: new Date("2026-01-01") });
    stale.updatedAt = "2026-08-03T10:00:00.000Z";
    stale.records["reaction-time:bestMs"] = rec(150); // old clock, "faster"

    for (const [a, b] of [
      [updated, stale],
      [stale, updated],
    ] as const) {
      const merged = mergeProfiles(a, b);
      expect(merged.records["reaction-time:bestMs"].value).toBe(210);
    }
  });
});
