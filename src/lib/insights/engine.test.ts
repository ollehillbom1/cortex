import { describe, expect, it } from "vitest";
import { deriveInsights } from "./engine";
import { createProfile } from "@/lib/storage/profileFactory";
import type { ExerciseResult, Profile, SessionRecord } from "@/lib/domain/types";

const TODAY = "2026-07-31";

function exercise(
  id: ExerciseResult["exerciseId"],
  accuracy: number,
  rounds = 4,
): ExerciseResult {
  return { exerciseId: id, rounds, accuracy, levelBefore: 3, levelAfter: 3, xp: 20 };
}

function session(id: string, startedAt: string, exercises: ExerciseResult[]): SessionRecord {
  return {
    id,
    profileId: "p",
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 8 * 60_000,
    exercises,
    xpEarned: 50,
    unlocked: [],
  };
}

function profileWithStreak(current: number, lastActiveDay: string): Profile {
  const p = createProfile({ id: "p", name: "Insight" });
  p.streak = { current, best: current, lastActiveDay, freezes: 0 };
  return p;
}

describe("insight engine", () => {
  it("returns nothing for a fresh profile with no data", () => {
    const profile = createProfile({ id: "p", name: "New" });
    expect(deriveInsights({ profile, sessions: [], today: TODAY })).toEqual([]);
  });

  it("flags a streak at risk, highest priority, but not after training today", () => {
    const atRisk = deriveInsights({
      profile: profileWithStreak(6, "2026-07-30"),
      sessions: [],
      today: TODAY,
    });
    expect(atRisk[0]?.id).toBe("streak-at-risk");
    expect(atRisk[0]?.text).toContain("6-day");

    const trainedToday = deriveInsights({
      profile: profileWithStreak(6, TODAY),
      sessions: [],
      today: TODAY,
    });
    expect(trainedToday.find((i) => i.id === "streak-at-risk")).toBeUndefined();
  });

  it("flags a neglected modality with a concrete suggestion", () => {
    // Ten sessions of only visual/speed work: auditory memory gets 0%.
    const sessions = Array.from({ length: 10 }, (_, i) =>
      session(`s${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T10:00:00`, [
        exercise("visual-pattern", 0.8),
        exercise("reaction-time", 0.8),
        exercise("sequence-memory", 0.8),
      ]),
    );
    const insights = deriveInsights({
      profile: profileWithStreak(0, TODAY),
      sessions,
      today: TODAY,
    });
    const imbalance = insights.find((i) => i.id.startsWith("imbalance-"));
    expect(imbalance).toBeDefined();
    expect(imbalance?.text).toContain("Auditory memory");
    expect(imbalance?.text).toContain("Sound Span");
  });

  it("detects a consistent late-session accuracy drop", () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session(`s${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T10:00:00`, [
        exercise("number-span", 0.9),
        exercise("visual-pattern", 0.8),
        exercise("auditory-digits", 0.65),
      ]),
    );
    const insights = deriveInsights({
      profile: profileWithStreak(0, TODAY),
      sessions,
      today: TODAY,
    });
    expect(insights.find((i) => i.id === "late-session-drop")).toBeDefined();
  });

  it("reports a clearly stronger time of day, in-app phrasing only", () => {
    const morning = Array.from({ length: 4 }, (_, i) =>
      session(`m${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T08:00:00`, [
        exercise("number-span", 0.9),
        exercise("auditory-digits", 0.9),
        exercise("visual-pattern", 0.9),
      ]),
    );
    const evening = Array.from({ length: 4 }, (_, i) =>
      session(`e${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T20:00:00`, [
        exercise("number-span", 0.7),
        exercise("auditory-digits", 0.7),
        exercise("visual-pattern", 0.7),
      ]),
    );
    const insights = deriveInsights({
      profile: profileWithStreak(0, TODAY),
      sessions: [...morning, ...evening],
      today: TODAY,
    });
    const timing = insights.find((i) => i.id === "best-morning");
    expect(timing).toBeDefined();
    expect(timing?.text).toContain("Morning");
    // Copy rules: no cognition claims, only session observations.
    expect(timing?.text.toLowerCase()).not.toContain("brain");
    expect(timing?.text.toLowerCase()).not.toContain("iq");
  });

  it("stays quiet on balanced, stable data", () => {
    // Round counts chosen so every modality gets >= 10% of training time.
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(`s${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T10:00:00`, [
        exercise("number-span", 0.78, 2),
        exercise("auditory-digits", 0.78, 8),
        exercise("visual-pattern", 0.78, 6),
        exercise("sequence-memory", 0.78, 2),
        exercise("n-back", 0.78, 1),
        exercise("reaction-time", 0.78, 14),
      ]),
    );
    const insights = deriveInsights({
      profile: profileWithStreak(0, TODAY),
      sessions,
      today: TODAY,
    });
    expect(insights).toEqual([]);
  });

  it("is deterministic and sorted by priority", () => {
    const profile = profileWithStreak(4, "2026-07-30");
    const sessions = Array.from({ length: 10 }, (_, i) =>
      session(`s${i}`, `2026-07-${String(10 + i).padStart(2, "0")}T10:00:00`, [
        exercise("visual-pattern", 0.9),
        exercise("reaction-time", 0.8),
        exercise("sequence-memory", 0.6),
      ]),
    );
    const a = deriveInsights({ profile, sessions, today: TODAY });
    const b = deriveInsights({ profile, sessions, today: TODAY });
    expect(a).toEqual(b);
    const priorities = a.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((x, y) => x - y));
    expect(a[0].id).toBe("streak-at-risk");
  });
});
