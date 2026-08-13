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

  it("does not resurrect the XP of sessions a reset cleared", () => {
    // The first version of this merge counted the loser's RAW session list,
    // including sessions the same merge was about to drop for being older
    // than the reset watermark. A reset therefore restored itself, and every
    // device that joined later re-added the same XP.
    const reset = profileAt("2026-07-05T00:00:00Z", { xp: 0 });
    const stale = profileAt("2026-07-04T00:00:00Z", {
      xp: 100,
      records: { "number-span:maxSpan": { value: 9, achievedAt: "2026-07-01T00:00:00Z" } },
      achievements: { "first-session": "2026-07-01T00:00:00Z" },
    });
    const merged = mergeStates(
      state({
        profiles: [reset],
        sessions: [],
        tombstones: { deletedProfiles: {}, clearedSessions: { p: "2026-07-04T12:00:00.000Z" } },
      }),
      state({ profiles: [stale], sessions: [session("old-1", 100, "2026-07-01T10:00:00.000Z")] }),
    );
    expect(merged.sessions).toHaveLength(0);
    expect(merged.profiles[0].xp).toBe(0);
    expect(merged.profiles[0].records).toEqual({});
    expect(merged.profiles[0].achievements).toEqual({});
  });

  it("does not inflate XP as more stale devices join after a reset", () => {
    const cleared = { deletedProfiles: {}, clearedSessions: { p: "2026-07-04T12:00:00.000Z" } };
    const reset = profileAt("2026-07-05T00:00:00Z", { xp: 0 });
    let merged = state({ profiles: [reset], sessions: [], tombstones: cleared });
    for (let device = 0; device < 4; device++) {
      const stale = profileAt("2026-07-04T00:00:00Z", { xp: 100 });
      merged = mergeStates(
        merged,
        state({
          profiles: [stale],
          sessions: [session(`old-${device}`, 100, "2026-07-01T10:00:00.000Z")],
        }),
      );
      expect(merged.profiles[0].xp).toBe(0);
    }
  });

  it("never lets attempts run backwards when a clock is behind", () => {
    const ahead = profileAt("2026-07-02T00:00:00Z", {
      skills: {
        "n-back": { ...initialSkill(), level: 5, attempts: 400, updatedAt: "2026-07-02T00:00:00Z" },
      },
    });
    const behind = profileAt("2026-07-01T00:00:00Z", {
      skills: {
        "n-back": { ...initialSkill(), level: 4, attempts: 12, updatedAt: "2026-07-01T00:00:00Z" },
      },
    });
    expect(mergeProfiles(ahead, behind).skills["n-back"]?.attempts).toBe(400);
    expect(mergeProfiles(behind, ahead).skills["n-back"]?.attempts).toBe(400);
  });

  it("keeps the higher attempts even when the winner is chosen but trained less", () => {
    // The gap the old guard missed: the profile winner (later updatedAt) has
    // the newer skill but FEWER attempts, and the loser trained more on an
    // older-stamped skill (e.g. a device restored from a backup then edited).
    // max(chosen, winner) was a no-op; the loser's 400 attempts vanished and
    // the x1.8 calibration ramp re-triggered.
    const winner = profileAt("2026-07-02T00:00:00Z", {
      skills: {
        "n-back": { ...initialSkill(), level: 3, attempts: 12, updatedAt: "2026-07-02T00:00:00Z" },
      },
    });
    const loser = profileAt("2026-07-01T00:00:00Z", {
      skills: {
        "n-back": { ...initialSkill(), level: 5, attempts: 400, updatedAt: "2026-07-01T00:00:00Z" },
      },
    });
    expect(mergeProfiles(winner, loser).skills["n-back"]?.attempts).toBe(400);
    expect(mergeProfiles(loser, winner).skills["n-back"]?.attempts).toBe(400);
  });

  it("does not resurrect skills or the streak that a reset cleared", () => {
    // A reset zeroes skills/streak; the pre-reset copy still on the server
    // carries them. Skills and streak lacked the cleared-guard records and
    // achievements had, so the very next sync pulled level 9 and the 30-day
    // streak back — the user was told progression was reset.
    const reset = profileAt("2026-07-05T00:00:00Z", {
      xp: 0,
      skills: {},
      streak: { current: 0, best: 0, lastActiveDay: null, freezes: 0 },
    });
    const stale = profileAt("2026-07-04T00:00:00Z", {
      xp: 100,
      skills: {
        "n-back": { ...initialSkill(), level: 9, attempts: 400, updatedAt: "2026-07-04T00:00:00Z" },
      },
      streak: { current: 30, best: 30, lastActiveDay: "2026-07-04", freezes: 2 },
    });
    const merged = mergeStates(
      state({
        profiles: [reset],
        tombstones: { deletedProfiles: {}, clearedSessions: { p: "2026-07-04T12:00:00.000Z" } },
      }),
      state({ profiles: [stale] }),
    );
    expect(merged.profiles[0].skills).toEqual({});
    expect(merged.profiles[0].streak).toMatchObject({ current: 0, best: 0, lastActiveDay: null });
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
