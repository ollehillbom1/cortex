import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "./db";
import { createProfile } from "./profileFactory";
import type { SessionRecord } from "@/lib/domain/types";

/**
 * A finished session and the progression it produced are one fact. Writing
 * them as two operations meant a failure in between left history without XP,
 * or XP without history, with no way to tell afterwards which had happened.
 */

function session(id: string, profileId: string, xpEarned = 42): SessionRecord {
  return {
    id,
    profileId,
    type: "recommended",
    startedAt: "2026-08-02T10:00:00.000Z",
    endedAt: "2026-08-02T10:10:00.000Z",
    durationMs: 600_000,
    exercises: [],
    xpEarned,
    unlocked: [],
  };
}

describe("commitSession", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it("writes the session and the profile together", async () => {
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "p", name: "P" });
    await storage.putProfile(profile);

    await storage.commitSession(session("s1", "p"), { ...profile, xp: 42 });

    expect((await storage.listSessions("p")).map((s) => s.id)).toEqual(["s1"]);
    expect((await storage.getProfile("p"))?.xp).toBe(42);
  });

  it("writes neither when the SECOND write fails", async () => {
    // The load-bearing case, and the one the first version of this test got
    // wrong. A session with no key path makes `put` throw synchronously
    // BEFORE the profile put is ever issued — so a non-atomic implementation
    // passes, because the profile was never written in the first place.
    // Failing on the second write is what actually distinguishes the two:
    // the session put has already been issued, and only a rollback undoes it.
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "p", name: "P" });
    await storage.putProfile(profile);

    // A function cannot be structured-cloned: `put` rejects it synchronously.
    const uncloneable = { ...profile, xp: 999, boom: () => "boom" } as unknown as typeof profile;
    await expect(storage.commitSession(session("s2", "p"), uncloneable)).rejects.toBeTruthy();

    expect(await storage.listSessions("p")).toEqual([]);
    expect((await storage.getProfile("p"))?.xp).toBe(0);
  });

  it("writes neither when the FIRST write fails", async () => {
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "p", name: "P" });
    await storage.putProfile(profile);

    const broken = { ...session("s3", "p"), id: undefined } as unknown as SessionRecord;
    await expect(storage.commitSession(broken, { ...profile, xp: 999 })).rejects.toBeTruthy();

    expect(await storage.listSessions("p")).toEqual([]);
    expect((await storage.getProfile("p"))?.xp).toBe(0);
  });

  it("is idempotent, so a retry cannot double-count", async () => {
    // persistSession keeps the session id in a ref across attempts precisely
    // so this holds: a retry after a partial failure overwrites, never adds.
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "p", name: "P" });
    await storage.putProfile(profile);

    await storage.commitSession(session("s3", "p"), { ...profile, xp: 42 });
    await storage.commitSession(session("s3", "p"), { ...profile, xp: 42 });

    expect(await storage.listSessions("p")).toHaveLength(1);
    expect((await storage.getProfile("p"))?.xp).toBe(42);
  });

  it("refuses to overwrite a profile from a newer build", async () => {
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "p", name: "P" });
    await storage.putProfile(profile);
    // Simulate a record written by a newer build.
    const db = await (
      storage as unknown as { db: () => Promise<import("idb").IDBPDatabase<never>> }
    ).db();
    await (db as unknown as { put: (s: string, v: unknown) => Promise<unknown> }).put("profiles", {
      ...profile,
      dataVersion: 99,
    });

    await expect(storage.commitSession(session("s4", "p"), profile)).rejects.toThrow(
      /newer version/i,
    );
    expect(await storage.listSessions("p")).toEqual([]);
  });
});
