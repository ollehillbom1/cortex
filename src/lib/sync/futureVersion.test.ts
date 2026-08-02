import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "@/lib/storage/db";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import { decryptJson, deriveCredentials, encryptJson } from "./crypto";
import { emptyTombstones, type SyncState } from "./merge";
import {
  enableSync,
  META_SYNC_GROUP_ID,
  META_SYNC_KEY_JWK,
  META_SYNC_LAST_ERROR,
  META_SYNC_SCHEMA,
  syncNow,
} from "./engine";

/**
 * A household updates one device before another. The updated device pushes a
 * state this build does not understand; the older device must refuse it.
 *
 * Before this guard the older device merged the newer state, wrote it locally
 * with its own version stamp, and pushed the result back — downgrading the
 * whole group's data to the older shape, permanently and silently.
 */

const PASSPHRASE = "hemlig lösenfras";

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

/**
 * Wire credentials directly: these tests are about syncNow, and enableSync
 * is join-only since v3 — it refuses when no group exists yet, which is
 * exactly the empty-server situation these tests start from.
 */
async function wireCredentials(storage: IndexedDBAdapter) {
  const creds = await deriveCredentials(PASSPHRASE);
  await storage.setMeta(META_SYNC_GROUP_ID, creds.groupId);
  await storage.setMeta(
    META_SYNC_KEY_JWK,
    JSON.stringify(await crypto.subtle.exportKey("jwk", creds.key)),
  );
  await storage.setMeta(META_SYNC_SCHEMA, "2");
}

function futureState(): SyncState {
  const p = createProfile({ id: "newer-device", name: "Framtiden", now: new Date("2026-01-01") });
  return {
    dataVersion: CURRENT_DATA_VERSION + 1,
    profiles: [{ ...p, futureField: "kept" } as typeof p],
    sessions: [],
    tombstones: emptyTombstones(),
  };
}

describe("sync against a newer build", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses the remote state and never pushes a downgraded copy", async () => {
    const records = mockServer();
    const creds = await deriveCredentials(PASSPHRASE);
    const payload = await encryptJson(creds.key, futureState());
    records.set(creds.groupId, { ...payload, rev: 7 });

    const storage = new IndexedDBAdapter();
    await enableSync(storage, PASSPHRASE);

    const ok = await syncNow(storage);
    expect(ok).toBe(false);

    // The group's record is untouched: same revision, same bytes. This is the
    // assertion that matters — a downgrade would have bumped the revision.
    const after = records.get(creds.groupId)!;
    expect(after.rev).toBe(7);
    expect(after.blob).toBe(payload.blob);

    // Nothing from the newer state was written locally either.
    expect(await storage.listProfiles()).toEqual([]);

    // ...and the user is told what to do about it.
    const error = await storage.getMeta(META_SYNC_LAST_ERROR);
    expect(error).toMatch(/newer version/i);
  });

  it("labels the pushed envelope with the newest record it carries", async () => {
    // A device holding a future-stamped record used to push an envelope
    // claiming THIS version, so receiving devices saw a version they
    // understood, the guard never fired, and the newer data was relabelled
    // downwards — the same corruption, arriving through the push path.
    const records = mockServer();
    const creds = await deriveCredentials(PASSPHRASE);

    const storage = new IndexedDBAdapter();
    const profile = createProfile({ id: "local", name: "Lokal" });
    await storage.putProfile(profile);
    // Simulate a record written by a newer build sitting in local storage.
    const db = await (
      storage as unknown as { db: () => Promise<import("idb").IDBPDatabase<never>> }
    ).db();
    await (db as unknown as { put: (s: string, v: unknown) => Promise<unknown> }).put("profiles", {
      ...profile,
      dataVersion: CURRENT_DATA_VERSION + 1,
    });

    await wireCredentials(storage);
    await syncNow(storage);

    const pushed = records.get(creds.groupId);
    expect(pushed).toBeDefined();
    const state = await decryptJson<SyncState>(creds.key, {
      blob: pushed!.blob,
      iv: pushed!.iv,
    });
    expect(state.dataVersion).toBe(CURRENT_DATA_VERSION + 1);
  });

  it("still syncs normally against a state at the current version", async () => {
    // Guards the guard: a version check that rejects everything would pass
    // the test above while breaking sync entirely.
    mockServer();
    const storage = new IndexedDBAdapter();
    await storage.putProfile(createProfile({ id: "local", name: "Lokal" }));
    await wireCredentials(storage);

    expect(await syncNow(storage)).toBe(true);
    expect(await storage.getMeta(META_SYNC_LAST_ERROR)).toBe("");
  });
});
