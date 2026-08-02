import { describe, expect, it } from "vitest";
import { mergeProfiles, mergeStates, emptyTombstones, type SyncState } from "./merge";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import { initialSkill } from "@/lib/adaptive/engine";
import type { Profile, SessionRecord } from "@/lib/domain/types";

/**
 * Whole-profile last-write-wins kept both devices' *sessions* but only one
 * device's *progression*. Finish a session on the phone and one on the laptop
 * from the same starting point, and one device's XP, skills, records and
 * achievements vanished — while its session sat in the history, contradicting
 * the totals.
 */

function profileAt(updatedAt: string, over: Partial<Profile> = {}): Profile {
  return {
    ...createProfile({ id: "p", name: "P", now: new Date("2026-01-01T00:00:00Z") }),
    updatedAt,
    ...over,
  };
}

function session(
  id: string,
  xpEarned: number,
  startedAt = "2026-07-01T10:00:00.000Z",
): SessionRecord {
  return {
    id,
    profileId: "p",
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 60_000,
    exercises: [],
    xpEarned,
    unlocked: [],
  };
}

function state(over: Partial<SyncState>): SyncState {
  return {
    dataVersion: CURRENT_DATA_VERSION,
    profiles: [],
    sessions: [],
    tombstones: emptyTombstones(),
    ...over,
  };
}

describe("profile merge keeps both devices' progression", () => {
  it("adds the XP of sessions the winning profile never saw", () => {
    // Both devices start at 100 XP. The phone earns 20, the laptop 30 and
    // writes later. LWW alone reported 130 and lost the phone's 20.
    const phone = profileAt("2026-07-01T10:00:00Z", { xp: 120 });
    const laptop = profileAt("2026-07-01T11:00:00Z", { xp: 130 });
    const merged = mergeProfiles(
      phone,
      laptop,
      [session("phone-1", 20)],
      [session("laptop-1", 30)],
    );
    expect(merged.xp).toBe(150);
  });

  it("does not double-count a session both devices already have", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", { xp: 120 });
    const laptop = profileAt("2026-07-01T11:00:00Z", { xp: 120 });
    const shared = [session("shared-1", 20)];
    expect(mergeProfiles(phone, laptop, shared, shared).xp).toBe(120);
  });

  it("keeps a profile's XP when its sessions were not synced alongside it", () => {
    // Recomputing XP from the session list would zero an imported profile.
    const phone = profileAt("2026-07-01T10:00:00Z", { xp: 500 });
    const laptop = profileAt("2026-07-01T11:00:00Z", { xp: 500 });
    expect(mergeProfiles(phone, laptop, [], []).xp).toBe(500);
  });

  it("merges skills per exercise, not per profile", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", {
      skills: {
        "number-span": { ...initialSkill(), level: 8, updatedAt: "2026-07-01T10:00:00Z" },
        "n-back": { ...initialSkill(), level: 2, updatedAt: "2026-06-01T00:00:00Z" },
      },
    });
    const laptop = profileAt("2026-07-01T11:00:00Z", {
      skills: {
        "number-span": { ...initialSkill(), level: 3, updatedAt: "2026-06-01T00:00:00Z" },
        "n-back": { ...initialSkill(), level: 5, updatedAt: "2026-07-01T11:00:00Z" },
      },
    });
    const merged = mergeProfiles(phone, laptop);
    expect(merged.skills["number-span"]?.level).toBe(8);
    expect(merged.skills["n-back"]?.level).toBe(5);
  });

  it("keeps the better record per key, in the right direction", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", {
      records: {
        "reaction-time:bestMs": { value: 240, achievedAt: "2026-07-01T10:00:00Z" },
        "number-span:maxSpan": { value: 9, achievedAt: "2026-07-01T10:00:00Z" },
      },
    });
    const laptop = profileAt("2026-07-01T11:00:00Z", {
      records: {
        "reaction-time:bestMs": { value: 300, achievedAt: "2026-07-01T11:00:00Z" },
        "number-span:maxSpan": { value: 6, achievedAt: "2026-07-01T11:00:00Z" },
      },
    });
    const merged = mergeProfiles(phone, laptop);
    expect(merged.records["reaction-time:bestMs"].value).toBe(240);
    expect(merged.records["number-span:maxSpan"].value).toBe(9);
  });

  it("keeps every achievement, with its earliest unlock", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", {
      achievements: {
        "first-session": "2026-06-01T00:00:00Z",
        "week-streak": "2026-07-01T00:00:00Z",
      },
    });
    const laptop = profileAt("2026-07-01T11:00:00Z", {
      achievements: {
        "first-session": "2026-06-02T00:00:00Z",
        "night-owl": "2026-07-01T09:00:00Z",
      },
    });
    const merged = mergeProfiles(phone, laptop);
    expect(Object.keys(merged.achievements).sort()).toEqual([
      "first-session",
      "night-owl",
      "week-streak",
    ]);
    expect(merged.achievements["first-session"]).toBe("2026-06-01T00:00:00Z");
  });

  it("keeps the longest best streak and the furthest active day", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", {
      streak: { current: 3, best: 12, lastActiveDay: "2026-07-02", freezes: 1 },
    });
    const laptop = profileAt("2026-07-01T11:00:00Z", {
      streak: { current: 1, best: 4, lastActiveDay: "2026-07-01", freezes: 0 },
    });
    const merged = mergeProfiles(phone, laptop);
    expect(merged.streak.best).toBe(12);
    expect(merged.streak.lastActiveDay).toBe("2026-07-02");
    expect(merged.streak.current).toBe(3);
  });

  it("still lets the newest edit win for name and preferences", () => {
    const older = profileAt("2026-07-01T10:00:00Z", { name: "Gammalt namn" });
    const newer = profileAt("2026-07-01T11:00:00Z", { name: "Nytt namn" });
    expect(mergeProfiles(older, newer).name).toBe("Nytt namn");
    expect(mergeProfiles(newer, older).name).toBe("Nytt namn");
  });

  it("is symmetric: both devices converge on the same profile", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", { xp: 120 });
    const laptop = profileAt("2026-07-01T11:00:00Z", { xp: 130 });
    const s1 = [session("phone-1", 20)];
    const s2 = [session("laptop-1", 30)];
    expect(mergeProfiles(phone, laptop, s1, s2)).toEqual(mergeProfiles(laptop, phone, s2, s1));
  });

  it("flows through mergeStates, where sessions and totals must agree", () => {
    const phone = profileAt("2026-07-01T10:00:00Z", { xp: 120 });
    const laptop = profileAt("2026-07-01T11:00:00Z", { xp: 130 });
    const merged = mergeStates(
      state({ profiles: [phone], sessions: [session("phone-1", 20)] }),
      state({ profiles: [laptop], sessions: [session("laptop-1", 30)] }),
    );
    expect(merged.sessions).toHaveLength(2);
    expect(merged.profiles[0].xp).toBe(150);
  });
});
