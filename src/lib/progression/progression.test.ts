import { describe, expect, it } from "vitest";
import { levelForXp, levelProgress, xpForLevel, xpForRound } from "./xp";
import {
  dayKey,
  daysBetween,
  displayedStreak,
  initialStreak,
  recordActiveDay,
  streakAtRisk,
} from "./streak";
import { ACHIEVEMENTS, evaluateAchievements } from "./achievements";
import { createProfile } from "@/lib/storage/profileFactory";
import type { SessionRecord } from "@/lib/domain/types";

describe("xp", () => {
  it("awards xp proportional to accuracy and level", () => {
    expect(xpForRound({ accuracy: 1, level: 1 })).toBe(10);
    expect(xpForRound({ accuracy: 0.5, level: 1 })).toBe(5);
    expect(xpForRound({ accuracy: 1, level: 5 })).toBe(16);
    expect(xpForRound({ accuracy: 1, level: 1, perfect: true })).toBe(15);
    expect(xpForRound({ accuracy: 1, level: 1, personalBest: true })).toBe(20);
  });

  it("pays nothing for a round with no accuracy, at any level", () => {
    // The bug this pins: the level bonus used to be paid regardless of
    // accuracy, so a blank round at level 40 earned 59 XP while a perfect
    // level-1 round earned 15. Skips and unavailable rounds arrive here as
    // accuracy 0 and must be worth nothing.
    for (const level of [1, 20, 40]) {
      expect(xpForRound({ accuracy: 0, level })).toBe(0);
      expect(xpForRound({ accuracy: 0, level, perfect: true, personalBest: true })).toBe(0);
    }
  });

  it("never pays more for a worse round at a higher level than a perfect one", () => {
    const perfectLow = xpForRound({ accuracy: 1, level: 1, perfect: true });
    for (const level of [10, 20, 40]) {
      expect(xpForRound({ accuracy: 0, level })).toBeLessThan(perfectLow);
      // Half-accuracy earns roughly half the level bonus, not all of it.
      expect(xpForRound({ accuracy: 0.5, level })).toBeLessThan(
        xpForRound({ accuracy: 1, level }) / 2 + 1,
      );
    }
  });

  it("keeps rewarding difficulty when the round is actually played", () => {
    expect(xpForRound({ accuracy: 1, level: 40 })).toBeGreaterThan(
      xpForRound({ accuracy: 1, level: 1 }),
    );
  });

  it("has a monotonic level curve starting at level 1 = 0 xp", () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l < 30; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    }
  });

  it("inverts the curve correctly", () => {
    for (const xp of [0, 50, 100, 250, 1000, 12345]) {
      const level = levelForXp(xp);
      expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
      expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
    }
  });

  it("reports progress within the current level", () => {
    const p = levelProgress(xpForLevel(3) + 10);
    expect(p.level).toBe(3);
    expect(p.inLevel).toBe(10);
    expect(p.fraction).toBeGreaterThan(0);
    expect(p.fraction).toBeLessThan(1);
  });
});

describe("streak", () => {
  it("computes local day keys and gaps", () => {
    expect(dayKey(new Date(2026, 6, 31, 23, 59))).toBe("2026-07-31");
    expect(daysBetween("2026-07-30", "2026-07-31")).toBe(1);
    expect(daysBetween("2026-07-31", "2026-08-02")).toBe(2);
  });

  it("grows on consecutive days and ignores same-day repeats", () => {
    let s = initialStreak();
    s = recordActiveDay(s, "2026-07-29").streak;
    expect(s.current).toBe(1);
    s = recordActiveDay(s, "2026-07-29").streak;
    expect(s.current).toBe(1);
    s = recordActiveDay(s, "2026-07-30").streak;
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it("consumes a freeze to survive a single missed day", () => {
    const s = { ...initialStreak(), current: 9, best: 9, lastActiveDay: "2026-07-20", freezes: 1 };
    const update = recordActiveDay(s, "2026-07-22"); // missed the 21st
    expect(update.freezeUsed).toBe(true);
    expect(update.reset).toBe(false);
    expect(update.streak.current).toBe(10);
    expect(update.streak.freezes).toBe(0);
  });

  it("resets without a freeze, but never silently loses best", () => {
    const s = { ...initialStreak(), current: 9, best: 9, lastActiveDay: "2026-07-20", freezes: 0 };
    const update = recordActiveDay(s, "2026-07-23");
    expect(update.reset).toBe(true);
    expect(update.streak.current).toBe(1);
    expect(update.streak.best).toBe(9);
  });

  it("earns a freeze every 7 days, capped at 2", () => {
    let s = initialStreak();
    let day = "2026-07-01";
    for (let i = 0; i < 7; i++) {
      s = recordActiveDay(s, day).streak;
      day = nextDay(day);
    }
    expect(s.current).toBe(7);
    expect(s.freezes).toBe(1);
    for (let i = 0; i < 7; i++) {
      s = recordActiveDay(s, day).streak;
      day = nextDay(day);
    }
    expect(s.freezes).toBe(2);
    for (let i = 0; i < 7; i++) {
      s = recordActiveDay(s, day).streak;
      day = nextDay(day);
    }
    expect(s.freezes).toBe(2);
  });

  it("is robust to clocks moving backwards", () => {
    const s = { ...initialStreak(), current: 3, best: 3, lastActiveDay: "2026-07-20", freezes: 0 };
    const update = recordActiveDay(s, "2026-07-19");
    expect(update.streak).toEqual(s);
  });

  it("displays 0 when a streak has lapsed beyond rescue", () => {
    const s = { ...initialStreak(), current: 5, best: 5, lastActiveDay: "2026-07-20", freezes: 0 };
    expect(displayedStreak(s, "2026-07-21")).toBe(5);
    expect(displayedStreak(s, "2026-07-23")).toBe(0);
    const frozen = { ...s, freezes: 1 };
    expect(displayedStreak(frozen, "2026-07-22")).toBe(5);
  });

  it("flags at-risk streaks", () => {
    const s = { ...initialStreak(), current: 5, best: 5, lastActiveDay: "2026-07-30", freezes: 0 };
    expect(streakAtRisk(s, "2026-07-31")).toBe(true);
    expect(streakAtRisk(s, "2026-07-30")).toBe(false);
  });
});

describe("achievements", () => {
  const baseSession = (over: Partial<SessionRecord> = {}): SessionRecord => ({
    id: "s1",
    profileId: "p1",
    type: "recommended",
    startedAt: "2026-07-31T10:00:00Z",
    endedAt: "2026-07-31T10:10:00Z",
    durationMs: 600_000,
    exercises: [],
    xpEarned: 50,
    unlocked: [],
    ...over,
  });

  it("has unique ids", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("unlocks first-session and never re-awards it", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    const first = evaluateAchievements({
      profile,
      session: baseSession(),
      totalSessions: 1,
    });
    expect(first).toContain("first-session");

    const again = evaluateAchievements({
      profile: { ...profile, achievements: { "first-session": "2026-07-30T00:00:00Z" } },
      session: baseSession(),
      totalSessions: 2,
    });
    expect(again).not.toContain("first-session");
  });

  it("unlocks behaviour-based achievements from real results", () => {
    const profile = createProfile({ id: "p1", name: "Test" });
    profile.records["number-span:maxSpan"] = { value: 7, achievedAt: "2026-07-31" };
    const session = baseSession({
      exercises: [
        {
          exerciseId: "reaction-time",
          rounds: 5,
          accuracy: 0.9,
          levelBefore: 3,
          levelAfter: 3,
          xp: 40,
          avgResponseMs: 240,
          bestResponseMs: 210,
        },
      ],
    });
    const unlocked = evaluateAchievements({ profile, session, totalSessions: 1 });
    expect(unlocked).toContain("span-7");
    expect(unlocked).toContain("quick-250");
  });
});

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}
