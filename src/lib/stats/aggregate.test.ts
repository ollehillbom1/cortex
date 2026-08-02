import { describe, expect, it } from "vitest";
import {
  activityByDay,
  exerciseLevels,
  exerciseProgress,
  modalityBalance,
  shiftDay,
  strengthsAndFocus,
  timeOfDayPerformance,
} from "./aggregate";
import { createProfile } from "@/lib/storage/profileFactory";
import { initialSkill } from "@/lib/adaptive/engine";
import type { SessionRecord } from "@/lib/domain/types";

function session(id: string, startedAt: string, over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    profileId: "p",
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 6 * 60_000,
    exercises: [],
    xpEarned: 30,
    unlocked: [],
    ...over,
  };
}

describe("stats aggregation", () => {
  it("buckets activity per local day over the window", () => {
    const sessions = [
      session("a", new Date(2026, 6, 30, 9, 0).toISOString()),
      session("b", new Date(2026, 6, 30, 20, 0).toISOString()),
      session("c", new Date(2026, 6, 31, 8, 0).toISOString()),
      session("old", new Date(2026, 5, 1, 8, 0).toISOString()),
    ];
    const days = activityByDay(sessions, "2026-07-31", 7);
    expect(days).toHaveLength(7);
    expect(days[days.length - 1]).toMatchObject({ day: "2026-07-31", sessions: 1 });
    expect(days[days.length - 2]).toMatchObject({ day: "2026-07-30", sessions: 2, xp: 60 });
    expect(days[0].sessions).toBe(0);
  });

  it("computes modality balance shares that sum to ~1", () => {
    const sessions = [
      session("a", "2026-07-30T10:00:00Z", {
        exercises: [
          {
            exerciseId: "reaction-time",
            rounds: 5,
            accuracy: 0.8,
            levelBefore: 1,
            levelAfter: 1,
            xp: 10,
          },
          {
            exerciseId: "visual-pattern",
            rounds: 5,
            accuracy: 0.8,
            levelBefore: 1,
            levelAfter: 1,
            xp: 10,
          },
        ],
      }),
    ];
    const balance = modalityBalance(sessions);
    const total = Object.values(balance).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(balance["visual-memory"]).toBeGreaterThan(0);
    expect(balance["auditory-memory"]).toBe(0);
  });

  it("shifts day keys across month boundaries", () => {
    expect(shiftDay("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDay("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("buckets accuracy by local time of day", () => {
    const mk = (id: string, hour: number, accuracy: number) =>
      session(id, new Date(2026, 6, 20, hour, 0).toISOString(), {
        exercises: [
          {
            exerciseId: "number-span",
            rounds: 4,
            accuracy,
            levelBefore: 1,
            levelAfter: 1,
            xp: 10,
          },
        ],
      });
    const parts = timeOfDayPerformance([
      mk("a", 8, 0.9),
      mk("b", 9, 0.7),
      mk("c", 20, 0.6),
      mk("d", 21, 0),
      // A session without exercises is ignored entirely.
      session("noex", new Date(2026, 6, 20, 21, 0).toISOString()),
    ]);
    const morning = parts.find((p) => p.part === "morning");
    const evening = parts.find((p) => p.part === "evening");
    expect(morning).toMatchObject({ sessions: 2 });
    expect(morning?.accuracy).toBeCloseTo(0.8, 5);
    expect(evening?.sessions).toBe(2);
    expect(parts.find((p) => p.part === "night")).toBeUndefined();
  });
});

describe("strengths and focus", () => {
  it("ranks by progress within each exercise, not by raw level", () => {
    // n-back tops out at 18 and number span at 39, so sorting by level
    // ranked which exercise has the longer ramp. A user at n-back 15 (83% of
    // its range) is further along than one at number span 15 (37%).
    const profile = createProfile({ id: "p", name: "P" });
    profile.skills["n-back"] = { ...initialSkill(), level: 15, attempts: 10 };
    profile.skills["number-span"] = { ...initialSkill(), level: 15, attempts: 10 };
    profile.skills["reaction-time"] = { ...initialSkill(), level: 2, attempts: 10 };

    const { strengths, focus } = strengthsAndFocus(profile);
    expect(strengths[0].exerciseId).toBe("n-back");
    expect(focus[0].exerciseId).toBe("reaction-time");
  });

  it("expresses progress as a fraction of the exercise's own range", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.skills["n-back"] = { ...initialSkill(), level: 18, attempts: 10 };
    const [summary] = exerciseLevels(profile).filter((e) => e.exerciseId === "n-back");
    expect(exerciseProgress(summary)).toBeCloseTo(1, 5);
  });
});
