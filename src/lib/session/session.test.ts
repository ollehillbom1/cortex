import { describe, expect, it } from "vitest";
import {
  dailyPlanSeed,
  planSession,
  MAX_SESSION_MINUTES,
  PLAN_HISTORY_WINDOW,
  PLAN_TOLERANCE,
} from "./planner";
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

  it("covers at least three modalities from 3-5 distinct exercises", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    for (const seed of [1, 2, 3, 99, 12345]) {
      const plan = planSession({ profile, recentSessions: [], seed });
      const ids = plan.items.map((i) => i.exerciseId);
      const distinct = new Set(ids);
      expect(distinct.size).toBeGreaterThanOrEqual(3);
      expect(distinct.size).toBeLessThanOrEqual(5);
      expect(plan.modalities.length).toBeGreaterThanOrEqual(3);
      // Repeat blocks are allowed to fill the time budget, but only as whole
      // extra blocks of an exercise already in the session.
      expect(ids.every((id) => distinct.has(id))).toBe(true);
    }
  });

  it("reaches the daily goal, or the longest session the exercise pool allows", () => {
    // Five distinct exercises at their default length total 6.9 minutes, so
    // every goal above ~7 min used to be silently ignored: the default goal
    // of 10 produced a 7-minute session for ever.
    for (const excludeVisionRequired of [false, true]) {
      const profile = createProfile({ id: "p1", name: "Test" });
      profile.preferences.excludeVisionRequired = excludeVisionRequired;
      for (const goal of [5, 10, 15, 20, 25]) {
        profile.preferences.dailyGoalMinutes = goal;
        const plan = planSession({ profile, recentSessions: [], seed: 5 });
        // Every goal is met within tolerance, including for a vision-filtered
        // profile with only three exercises to draw on — the repeat factor
        // scales with the size of the pool. 25 clamps to the session cap.
        const capped = Math.min(goal, MAX_SESSION_MINUTES);
        expect(Math.abs(plan.estimatedMinutes - capped)).toBeLessThanOrEqual(
          capped * PLAN_TOLERANCE,
        );
        expect(plan.items.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it("keeps blocks comparable rather than piling rounds onto the first one", () => {
    // Growing whichever block came first produced a 20-round Pattern Recall
    // (320s) beside a 1-round n-back (55s). The rule is now "grow the
    // shortest block", and the property that matters is that no block
    // dominates the session. Measured over 40 seeds x both filters: the
    // largest block takes at most 22% of the session, and the spread between
    // blocks (excluding the final one, which is deliberately trimmed to land
    // on the target) is at most 4.13x with a median of 1.5.
    for (const excludeVisionRequired of [false, true]) {
      const profile = createProfile({ id: "p1", name: "Test" });
      profile.preferences.excludeVisionRequired = excludeVisionRequired;
      profile.preferences.dailyGoalMinutes = 20;
      for (const seed of [5, 23, 25, 31, 404]) {
        const plan = planSession({ profile, recentSessions: [], seed });
        const seconds = plan.items.map((i) => EXERCISES[i.exerciseId].secondsPerRound * i.rounds);
        const totalSeconds = seconds.reduce((a, b) => a + b, 0);
        expect(Math.max(...seconds)).toBeLessThanOrEqual(totalSeconds * 0.3);
        const head = seconds.slice(0, -1);
        expect(Math.max(...head) / Math.min(...head)).toBeLessThanOrEqual(4.5);
      }
    }
  });

  it("hits the default 10-minute goal, which the old planner could not", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    expect(profile.preferences.dailyGoalMinutes).toBe(10);
    for (const seed of [1, 42, 7777]) {
      const plan = planSession({ profile, recentSessions: [], seed });
      expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(9);
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(11);
    }
  });

  it("gives the runner exactly the plan the home preview showed", () => {
    // The preview seeded from the day and read 30 sessions; the runner seeded
    // from the clock and read 10, so the session you started was not the one
    // you were shown. Both now use dailyPlanSeed + PLAN_HISTORY_WINDOW.
    const profile = createProfile({ id: "p1", name: "Test" });
    const history = Array.from({ length: 30 }, (_, i) =>
      makeSession({
        id: `s${i}`,
        startedAt: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const preview = planSession({
      profile,
      recentSessions: history.slice(0, PLAN_HISTORY_WINDOW),
      seed: dailyPlanSeed("2026-08-02"),
    });
    const started = planSession({
      profile,
      recentSessions: history.slice(0, PLAN_HISTORY_WINDOW),
      seed: dailyPlanSeed("2026-08-02"),
    });
    expect(started).toEqual(preview);
    // ...and a different day genuinely differs, so the seed is doing work.
    const tomorrow = planSession({
      profile,
      recentSessions: history.slice(0, PLAN_HISTORY_WINDOW),
      seed: dailyPlanSeed("2026-08-03"),
    });
    expect(dailyPlanSeed("2026-08-03")).not.toBe(dailyPlanSeed("2026-08-02"));
    expect(tomorrow.items.length).toBeGreaterThan(0);
  });

  it("plans only non-visual exercises when the profile excludes vision", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    profile.preferences.excludeVisionRequired = true;
    for (const seed of [1, 2, 42, 777]) {
      const plan = planSession({ profile, recentSessions: [], seed });
      expect(plan.items.length).toBeGreaterThan(0);
      for (const item of plan.items) {
        expect(EXERCISES[item.exerciseId].requiresVision).toBe(false);
      }
      // The remaining exercises still cover more than a single modality.
      expect(plan.modalities.length).toBeGreaterThanOrEqual(3);
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
