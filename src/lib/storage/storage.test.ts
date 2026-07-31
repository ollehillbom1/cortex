import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "./db";
import { createProfile } from "./profileFactory";
import { CURRENT_DATA_VERSION, migrateProfile } from "./migrations";
import { exportAll, importBundle, ImportError, parseExportBundle } from "./exportImport";
import type { SessionRecord } from "@/lib/domain/types";

function makeSession(id: string, profileId: string, startedAt: string): SessionRecord {
  return {
    id,
    profileId,
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 300_000,
    exercises: [],
    xpEarned: 10,
    unlocked: [],
  };
}

describe("IndexedDBAdapter", () => {
  let storage: IndexedDBAdapter;

  beforeEach(() => {
    // Fresh in-memory IndexedDB per test.
    globalThis.indexedDB = new IDBFactory();
    storage = new IndexedDBAdapter();
  });

  it("stores and lists profiles", async () => {
    const a = createProfile({ id: "a", name: "Alpha", now: new Date("2026-01-01") });
    const b = createProfile({ id: "b", name: "Beta", now: new Date("2026-01-02") });
    await storage.putProfile(b);
    await storage.putProfile(a);
    const list = await storage.listProfiles();
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
    expect(await storage.getProfile("a")).toMatchObject({ name: "Alpha" });
  });

  it("lists sessions newest first with a limit", async () => {
    await storage.putProfile(createProfile({ id: "p", name: "P" }));
    await storage.addSession(makeSession("s1", "p", "2026-07-01T10:00:00Z"));
    await storage.addSession(makeSession("s2", "p", "2026-07-02T10:00:00Z"));
    await storage.addSession(makeSession("s3", "p", "2026-07-03T10:00:00Z"));
    await storage.addSession(makeSession("x1", "other", "2026-07-04T10:00:00Z"));
    const sessions = await storage.listSessions("p", 2);
    expect(sessions.map((s) => s.id)).toEqual(["s3", "s2"]);
    expect(await storage.listSessions("p")).toHaveLength(3);
  });

  it("deletes a profile together with its sessions", async () => {
    await storage.putProfile(createProfile({ id: "p", name: "P" }));
    await storage.addSession(makeSession("s1", "p", "2026-07-01T10:00:00Z"));
    await storage.deleteProfile("p");
    expect(await storage.getProfile("p")).toBeUndefined();
    expect(await storage.listSessions("p")).toHaveLength(0);
  });

  it("persists meta values", async () => {
    await storage.setMeta("activeProfile", "p1");
    expect(await storage.getMeta("activeProfile")).toBe("p1");
    expect(await storage.getMeta("missing")).toBeUndefined();
  });
});

describe("migrations", () => {
  it("migrates v1 profiles to the current version", () => {
    const v1 = {
      id: "old",
      name: "Old",
      createdAt: "2025-01-01T00:00:00Z",
      xp: 100,
      // v1 had no freezes on streak and no reduceMotion preference.
      streak: { current: 3, best: 5, lastActiveDay: "2025-01-01" },
      preferences: { audioEnabled: true, volume: 1, largeText: false, dailyGoalMinutes: 10 },
      skills: {},
      records: {},
      achievements: {},
      onboarded: true,
    };
    const migrated = migrateProfile(v1);
    expect(migrated.dataVersion).toBe(CURRENT_DATA_VERSION);
    expect(migrated.streak.freezes).toBe(0);
    expect(migrated.streak.current).toBe(3);
    expect(migrated.preferences.reduceMotion).toBe(false);
    expect(migrated.preferences.audioEnabled).toBe(true);
  });

  it("migrates v2 skills to gain the latency ring buffer (v3)", () => {
    const v2 = {
      ...createProfile({ id: "p", name: "P" }),
      dataVersion: 2,
      skills: {
        "number-span": {
          level: 6.2,
          streak: 2,
          recent: [0.8, 0.9],
          attempts: 12,
          updatedAt: "2026-07-01T00:00:00Z",
        },
      },
    };
    const migrated = migrateProfile(v2 as unknown as Record<string, unknown>);
    expect(migrated.dataVersion).toBe(CURRENT_DATA_VERSION);
    expect(migrated.skills["number-span"]?.recentInputMs).toEqual([]);
    expect(migrated.skills["number-span"]?.level).toBe(6.2);
    expect(migrated.skills["number-span"]?.recent).toEqual([0.8, 0.9]);
  });

  it("adds the locale preference when migrating to v4", () => {
    const v3 = {
      ...createProfile({ id: "p", name: "P" }),
      dataVersion: 3,
    } as unknown as Record<string, unknown>;
    delete (v3.preferences as Record<string, unknown>).locale;
    const migrated = migrateProfile(v3);
    expect(migrated.dataVersion).toBe(CURRENT_DATA_VERSION);
    expect(migrated.preferences.locale).toBe("auto");
    expect(migrated.preferences.audioEnabled).toBe(true);
  });

  it("leaves current-version profiles untouched", () => {
    const p = { ...createProfile({ id: "p", name: "P" }), dataVersion: CURRENT_DATA_VERSION };
    expect(migrateProfile(p as unknown as Record<string, unknown>)).toEqual(p);
  });
});

describe("export / import", () => {
  let storage: IndexedDBAdapter;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    storage = new IndexedDBAdapter();
  });

  it("round-trips profiles and sessions", async () => {
    const p = createProfile({ id: "p", name: "P" });
    await storage.putProfile(p);
    await storage.addSession(makeSession("s1", "p", "2026-07-01T10:00:00Z"));

    const bundle = await exportAll(storage);
    const parsed = parseExportBundle(JSON.stringify(bundle));

    globalThis.indexedDB = new IDBFactory();
    const fresh = new IndexedDBAdapter();
    const result = await importBundle(fresh, parsed);
    expect(result).toMatchObject({ profilesAdded: 1, sessionsAdded: 1 });
    expect(await fresh.getProfile("p")).toMatchObject({ name: "P" });
    expect(await fresh.listSessions("p")).toHaveLength(1);
  });

  it("skips existing records instead of overwriting", async () => {
    const p = createProfile({ id: "p", name: "Original" });
    await storage.putProfile(p);
    const bundle = await exportAll(storage);
    bundle.profiles[0].name = "Tampered";
    const result = await importBundle(storage, parseExportBundle(JSON.stringify(bundle)));
    expect(result.profilesSkipped).toBe(1);
    expect((await storage.getProfile("p"))?.name).toBe("Original");
  });

  it("rejects invalid payloads with helpful errors", () => {
    expect(() => parseExportBundle("not json")).toThrow(ImportError);
    expect(() => parseExportBundle(JSON.stringify({ format: "other" }))).toThrow(
      /not a Cortex export/,
    );
    expect(() =>
      parseExportBundle(
        JSON.stringify({
          format: "cortex-export",
          dataVersion: CURRENT_DATA_VERSION + 5,
          profiles: [],
          sessions: [],
        }),
      ),
    ).toThrow(/newer version/);
    expect(() =>
      parseExportBundle(
        JSON.stringify({
          format: "cortex-export",
          dataVersion: 1,
          profiles: [{ id: "", name: "x" }],
          sessions: [],
        }),
      ),
    ).toThrow(ImportError);
  });

  it("drops sessions whose profile is unknown", async () => {
    const bundle = {
      format: "cortex-export" as const,
      dataVersion: CURRENT_DATA_VERSION,
      exportedAt: "2026-07-31T00:00:00Z",
      profiles: [],
      sessions: [makeSession("s1", "ghost", "2026-07-01T10:00:00Z")],
    };
    const result = await importBundle(storage, parseExportBundle(JSON.stringify(bundle)));
    expect(result.sessionsSkipped).toBe(1);
    expect(result.sessionsAdded).toBe(0);
  });
});
