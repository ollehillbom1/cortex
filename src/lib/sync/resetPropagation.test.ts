import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "@/lib/storage/db";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import type { SessionRecord } from "@/lib/domain/types";
import { deriveCredentials, encryptJson } from "./crypto";
import { emptyTombstones, type SyncState } from "./merge";
import { enableSync, syncNow } from "./engine";

/**
 * Resetting progression on one device has to reach the others. The merge
 * already dropped sessions from before the reset watermark, but applyLocally
 * only ever *added* sessions — so the old history stayed in local storage,
 * and in local statistics, indefinitely.
 */

const PASSPHRASE = "hemlig lösenfras";
const PROFILE_ID = "shared";

function mockServer() {
  const records = new Map<string, { blob: string; iv: string; rev: number }>();
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const groupId = String(url).split("/").pop()!;
    if (!init || init.method === undefined) {
      const record = records.get(groupId);
      if (!record) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      return new Response(JSON.stringify(record), { status: 200 });
    }
    const body = JSON.parse(String(init.body)) as { blob: string; iv: string; expectedRev: number };
    const current = records.get(groupId)?.rev ?? 0;
    if (body.expectedRev !== current) {
      return new Response(JSON.stringify({ error: "revision conflict", rev: current }), {
        status: 409,
      });
    }
    records.set(groupId, { blob: body.blob, iv: body.iv, rev: current + 1 });
    return new Response(JSON.stringify({ rev: current + 1 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return records;
}

function session(id: string, startedAt: string): SessionRecord {
  return {
    id,
    profileId: PROFILE_ID,
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 60_000,
    exercises: [],
    xpEarned: 10,
    unlocked: [],
  };
}

describe("progression reset across devices", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("removes locally the history another device cleared, and it stays gone", async () => {
    const records = mockServer();
    const creds = await deriveCredentials(PASSPHRASE);

    // This device holds two old sessions.
    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: PROFILE_ID, name: "Delad" });
    await storage.putProfile(profile);
    await storage.addSession(session("old-1", "2026-07-01T10:00:00.000Z"));
    await storage.addSession(session("old-2", "2026-07-02T10:00:00.000Z"));

    // The other device reset progression at 2026-07-03 and pushed the
    // watermark. Its own session list is empty.
    const remote: SyncState = {
      dataVersion: CURRENT_DATA_VERSION,
      profiles: [profile],
      sessions: [],
      tombstones: {
        deletedProfiles: {},
        clearedSessions: { [PROFILE_ID]: "2026-07-03T00:00:00.000Z" },
      },
    };
    const payload = await encryptJson(creds.key, remote);
    records.set(creds.groupId, { ...payload, rev: 1 });

    await enableSync(storage, PASSPHRASE);
    expect(await syncNow(storage)).toBe(true);

    expect(await storage.listSessions(PROFILE_ID)).toEqual([]);

    // And a second sync does not bring them back.
    expect(await syncNow(storage)).toBe(true);
    expect(await storage.listSessions(PROFILE_ID)).toEqual([]);
  });

  it("keeps sessions the merge did not drop", async () => {
    // Guards the guard: deleting everything not in the remote list would
    // pass the test above while destroying sessions this device just
    // recorded and has not pushed yet.
    const records = mockServer();
    const creds = await deriveCredentials(PASSPHRASE);

    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: PROFILE_ID, name: "Delad" });
    await storage.putProfile(profile);
    await storage.addSession(session("local-only", "2026-07-10T10:00:00.000Z"));

    const remote: SyncState = {
      dataVersion: CURRENT_DATA_VERSION,
      profiles: [profile],
      sessions: [session("remote-only", "2026-07-09T10:00:00.000Z")],
      tombstones: emptyTombstones(),
    };
    const payload = await encryptJson(creds.key, remote);
    records.set(creds.groupId, { ...payload, rev: 1 });

    await enableSync(storage, PASSPHRASE);
    expect(await syncNow(storage)).toBe(true);

    expect((await storage.listSessions(PROFILE_ID)).map((s) => s.id).sort()).toEqual([
      "local-only",
      "remote-only",
    ]);
  });
});
