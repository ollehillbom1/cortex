import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "@/lib/storage/db";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import type { SessionRecord } from "@/lib/domain/types";
import { deriveCredentials, encryptJson } from "./crypto";
import { emptyTombstones, type SyncState, type SyncTombstones } from "./merge";
import {
  enableSync,
  META_SYNC_TOMBSTONES,
  recordProfileDeletion,
  recordSessionsCleared,
  syncNow,
} from "./engine";

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

  it("concurrent tombstone writes never clobber each other", async () => {
    // The runner fires syncNow in the background at the end of a session, so
    // an in-flight cycle's tombstone write can land amid a delete and a
    // reset. Read-modify-write on the single meta key kept only the last;
    // deleted profiles and cleared sessions then resurrected on the next
    // sync. The serialized union must keep every tombstone whatever the
    // interleaving.
    const storage = new IndexedDBAdapter();
    await Promise.all([
      recordProfileDeletion(storage, "prof-A"),
      recordSessionsCleared(storage, "prof-B"),
      recordProfileDeletion(storage, "prof-C"),
      recordSessionsCleared(storage, "prof-D"),
    ]);
    const stored = JSON.parse((await storage.getMeta(META_SYNC_TOMBSTONES))!) as SyncTombstones;
    expect(Object.keys(stored.deletedProfiles).sort()).toEqual(["prof-A", "prof-C"]);
    expect(Object.keys(stored.clearedSessions).sort()).toEqual(["prof-B", "prof-D"]);
  });

  it("never deletes a session that was finished while the sync was running", async () => {
    // The runner fires syncNow at the end of every session, so a second
    // session can land AFTER readLocalState took its snapshot and before
    // applyLocally writes. It is absent from `merged` through timing alone —
    // deleting it destroys a session the user just completed, with no reset
    // anywhere in the picture.
    const records = mockServer();
    const creds = await deriveCredentials(PASSPHRASE);

    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: PROFILE_ID, name: "Delad" });
    await storage.putProfile(profile);

    const remote: SyncState = {
      dataVersion: CURRENT_DATA_VERSION,
      profiles: [profile],
      sessions: [session("remote-1", "2026-07-09T10:00:00.000Z")],
      tombstones: emptyTombstones(),
    };
    const payload = await encryptJson(creds.key, remote);
    records.set(creds.groupId, { ...payload, rev: 1 });

    await enableSync(storage, PASSPHRASE);

    // Inject right after the snapshot read: the first listSessions call is
    // the one inside readLocalState.
    const realList = storage.listSessions.bind(storage);
    let injected = false;
    storage.listSessions = async (profileId: string, limit?: number) => {
      const list = await realList(profileId, limit);
      if (!injected) {
        injected = true;
        await storage.addSession(session("just-finished", "2026-07-11T10:00:00.000Z"));
      }
      return list;
    };

    expect(await syncNow(storage)).toBe(true);
    storage.listSessions = realList;

    const ids = (await storage.listSessions(PROFILE_ID)).map((s) => s.id).sort();
    expect(ids).toContain("just-finished");
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
