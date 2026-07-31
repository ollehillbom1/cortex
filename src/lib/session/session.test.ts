import { describe, expect, it } from "vitest";
import { planSession } from "./planner";
import { applySession } from "./apply";
import { createProfile } from "@/lib/storage/profileFactory";
import { EXERCISES, type ExerciseId, type SessionRecord } from "@/lib/domain/types";
import { initialSkill } from "@/lib/adaptive/engine";

function makeSession(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    profileId: "p1",
    type: "recommended",
    startedAt: "2026-07-31T10:00:00.000Z",
    endedAt: "2026-07-31T10:10:00.000Z",
    durationMs: 600_000,
    exercises: [],
    xpEarned: 42,
    unlocked: [],
    ...over,
  };
}

describe("session planner", () => {
  it("is deterministic for the same seed and inputs", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    const a = planSession({ profile, recentSessions: [], seed: 123 });
    const b = planSession({ profile, recentSessions: [], seed: 123 });
    expect(a).toEqual(b);
  });

  it("covers at least three modalities with 3-5 items", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    for (const seed of [1, 2, 3, 99, 12345]) {
      const plan = planSession({ profile, recentSessions: [], seed });
      expect(plan.items.length).toBeGreaterThanOrEqual(3);
      expect(plan.items.length).toBeLessThanOrEqual(5);
      expect(plan.modalities.length).toBeGreaterThanOrEqual(3);
      const ids = plan.items.map((i) => i.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("respects the daily-goal time budget approximately", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    const plan = planSession({ profile, recentSessions: [], seed: 7, targetMinutes: 8 });
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(12);
    expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(4);
  });

  it("prioritises exercises that were not trained recently", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    // Mark every exercise as played and equally skilled...
    for (const id of Object.keys(EXERCISES) as ExerciseId[]) {
      profile.skills[id] = { ...initialSkill(), recent: [0.8, 0.8, 0.8], attempts: 5 };
    }
    // ...but the latest sessions only trained reaction-time and n-back.
    const recent = [
      makeSession({
        id: "r1",
        exercises: [
          {
            exerciseId: "reaction-time",
            rounds: 5,
            accuracy: 0.8,
            levelBefore: 1,
            levelAfter: 1,
            xp: 10,
          },
          { exerciseId: "n-back", rounds: 1, accuracy: 0.8, levelBefore: 1, levelAfter: 1, xp: 10 },
        ],
      }),
    ];
    let stale = 0;
    let freshCount = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = planSession({ profile, recentSessions: recent, seed });
      const first = plan.items[0].exerciseId;
      if (first === "reaction-time" || first === "n-back") stale++;
      else freshCount++;
    }
    expect(freshCount).toBeGreaterThan(stale);
  });
});

describe("applySession", () => {
  it("adds xp, starts the streak and unlocks first-session", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    const out = applySession({
      profile,
      session: makeSession(),
      priorSessionCount: 0,
      now: new Date(2026, 6, 31, 12, 0, 0),
    });
    expect(out.profile.xp).toBe(42);
    expect(out.profile.streak.current).toBe(1);
    expect(out.unlocked).toContain("first-session");
    expect(out.session.unlocked).toContain("first-session");
  });

  it("tracks personal records, including lower-is-better reaction times", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    profile.records["reaction-time:bestMs"] = { value: 300, achievedAt: "2026-07-01" };
    const out = applySession({
      profile,
      session: makeSession({
        exercises: [
          {
            exerciseId: "reaction-time",
            rounds: 5,
            accuracy: 0.9,
            levelBefore: 2,
            levelAfter: 2,
            xp: 20,
            avgResponseMs: 260,
            bestResponseMs: 240,
          },
          {
            exerciseId: "number-span",
            rounds: 4,
            accuracy: 0.9,
            levelBefore: 3,
            levelAfter: 4,
            xp: 22,
            details: { maxSpan: 6 },
          },
        ],
      }),
      priorSessionCount: 3,
      now: new Date(2026, 6, 31, 12, 0, 0),
    });
    expect(out.profile.records["reaction-time:bestMs"].value).toBe(240);
    expect(out.newRecords).toContain("reaction-time:bestMs");
    expect(out.profile.records["number-span:maxSpan"].value).toBe(6);
  });

  it("does not downgrade records", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    profile.records["reaction-time:bestMs"] = { value: 200, achievedAt: "2026-07-01" };
    const out = applySession({
      profile,
      session: makeSession({
        exercises: [
          {
            exerciseId: "reaction-time",
            rounds: 5,
            accuracy: 0.8,
            levelBefore: 2,
            levelAfter: 2,
            xp: 20,
            avgResponseMs: 400,
            bestResponseMs: 350,
          },
        ],
      }),
      priorSessionCount: 5,
      now: new Date(2026, 6, 31, 12, 0, 0),
    });
    expect(out.profile.records["reaction-time:bestMs"].value).toBe(200);
    expect(out.newRecords).not.toContain("reaction-time:bestMs");
  });
});
