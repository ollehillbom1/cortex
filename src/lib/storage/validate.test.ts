import { describe, expect, it } from "vitest";
import { sanitizeProfile, sanitizeSession } from "./validate";
import { sanitizeSyncState } from "@/lib/sync/validateState";
import { createProfile } from "./profileFactory";
import { MAX_LEVEL } from "@/lib/adaptive/engine";

/**
 * Import and sync both accept records this app did not write. Validation used
 * to spot-check a few fields and then spread the original object through, so
 * unknown keys, nested junk, wrong-typed preferences and out-of-range numbers
 * reached IndexedDB unchanged — while SECURITY.md claimed import was
 * "strictly structurally validated and re-projected".
 */

const validProfile = () =>
  ({ ...createProfile({ id: "p", name: "P" }) }) as Record<string, unknown>;

describe("untrusted record projection", () => {
  it("drops fields it does not know about", () => {
    const out = sanitizeProfile({
      ...validProfile(),
      surprise: { nested: { deep: "x".repeat(5000) } },
      __proto__polluted: true,
    });
    expect(out).not.toBeNull();
    expect(Object.keys(out!)).not.toContain("surprise");
    expect(Object.keys(out!)).not.toContain("__proto__polluted");
  });

  it("clamps numbers into their real ranges instead of trusting them", () => {
    const out = sanitizeProfile({
      ...validProfile(),
      xp: -5,
      avatarHue: 99999,
      skills: {
        "number-span": {
          level: 9999,
          streak: 3,
          recent: [0.5, 12, -4],
          recentInputMs: [100],
          attempts: 5,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    });
    expect(out!.xp).toBe(0);
    expect(out!.avatarHue).toBe(360);
    expect(out!.skills["number-span"]!.level).toBe(MAX_LEVEL);
    // Accuracies are 0..1; anything else is not an accuracy.
    expect(out!.skills["number-span"]!.recent).toEqual([0.5, 1, 0]);
  });

  it("rejects unknown exercise ids rather than storing them", () => {
    const out = sanitizeProfile({
      ...validProfile(),
      skills: { "not-an-exercise": { level: 5, updatedAt: "2026-07-01T00:00:00.000Z" } },
    });
    expect(Object.keys(out!.skills)).toEqual([]);
  });

  it("repairs wrong-typed preferences to their defaults", () => {
    const out = sanitizeProfile({
      ...validProfile(),
      preferences: { audioEnabled: "yes", volume: 40, locale: "kl", dailyGoalMinutes: "ten" },
    });
    expect(out!.preferences.audioEnabled).toBe(true);
    expect(out!.preferences.volume).toBe(1);
    expect(out!.preferences.locale).toBe("auto");
    expect(out!.preferences.dailyGoalMinutes).toBe(10);
  });

  it("never imports the coach opt-in as on", () => {
    // Enabling a feature that talks to a server is a local decision, not
    // something an imported file or a synced device gets to make.
    const out = sanitizeProfile({
      ...validProfile(),
      preferences: { ...(validProfile().preferences as object), aiCoach: true },
    });
    expect(out!.preferences.aiCoach).toBe(false);
  });

  it("refuses records missing the fields that identify them", () => {
    expect(sanitizeProfile({ name: "No id" })).toBeNull();
    expect(sanitizeProfile({ id: "x", name: "P", createdAt: "not a date" })).toBeNull();
    expect(sanitizeSession({ id: "s", profileId: "p" })).toBeNull();
  });

  it("keeps only known exercise results inside a session", () => {
    const out = sanitizeSession({
      id: "s",
      profileId: "p",
      startedAt: "2026-07-01T10:00:00.000Z",
      endedAt: "2026-07-01T10:10:00.000Z",
      durationMs: 600_000,
      xpEarned: 10,
      exercises: [
        {
          exerciseId: "number-span",
          rounds: 4,
          accuracy: 0.8,
          levelBefore: 2,
          levelAfter: 3,
          xp: 5,
        },
        { exerciseId: "made-up", rounds: 4, accuracy: 0.8, levelBefore: 2, levelAfter: 3, xp: 5 },
        "not an object",
      ],
    });
    expect(out!.exercises).toHaveLength(1);
    expect(out!.exercises[0].exerciseId).toBe("number-span");
  });

  it("projects a decrypted sync payload and drops orphaned sessions", () => {
    const profile = validProfile();
    const state = sanitizeSyncState({
      dataVersion: 8,
      profiles: [profile],
      sessions: [
        {
          id: "s1",
          profileId: "p",
          startedAt: "2026-07-01T10:00:00.000Z",
          endedAt: "2026-07-01T10:10:00.000Z",
          durationMs: 1,
          xpEarned: 1,
          exercises: [],
        },
        {
          id: "s2",
          profileId: "someone-else",
          startedAt: "2026-07-01T10:00:00.000Z",
          endedAt: "2026-07-01T10:10:00.000Z",
          durationMs: 1,
          xpEarned: 1,
          exercises: [],
        },
      ],
      tombstones: { deletedProfiles: { p2: "2026-07-01T00:00:00.000Z" }, clearedSessions: "junk" },
    });
    expect(state!.profiles).toHaveLength(1);
    expect(state!.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(state!.tombstones.clearedSessions).toEqual({});
    expect(state!.tombstones.deletedProfiles).toEqual({ p2: "2026-07-01T00:00:00.000Z" });
  });

  it("rejects a sync payload that is not the expected shape at all", () => {
    expect(sanitizeSyncState(null)).toBeNull();
    expect(sanitizeSyncState({ profiles: {}, sessions: [] })).toBeNull();
    expect(sanitizeSyncState("a string")).toBeNull();
  });
});
