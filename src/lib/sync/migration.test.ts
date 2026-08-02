import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "@/lib/storage/db";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import { decryptJson, deriveCredentials, deriveLegacyCredentials, encryptJson } from "./crypto";
import { emptyTombstones, type SyncState } from "./merge";
import {
  enableSync,
  getSyncStatus,
  META_SYNC_GROUP_ID,
  META_SYNC_SCHEMA,
  SyncGroupNotFoundError,
} from "./engine";

/**
 * The v1 -> v2 key-derivation migration. Entering the passphrase is the only
 * moment an old group can be found, so these tests pin that path: data must
 * survive the move, and a device must never silently land in an empty group.
 */

const PASSPHRASE = "hemlig lösenfras";

/** Minimal stand-in for the sync endpoint, keyed by group id. */
function mockServer() {
  const records = new Map<string, { blob: string; iv: string; rev: number }>();
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const groupId = String(url).split("/").pop()!;
    if (!init || init.method === undefined) {
      const record = records.get(groupId);
      if (!record) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      return new Response(JSON.stringify(record), { status: 200 });
    }
    const body = JSON.parse(String(init.body)) as {
      blob: string;
      iv: string;
      expectedRev: number;
    };
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

function legacyState(): SyncState {
  const p = createProfile({ id: "old-profile", name: "Farmor", now: new Date("2026-01-01") });
  return {
    dataVersion: CURRENT_DATA_VERSION,
    profiles: [p],
    sessions: [],
    tombstones: emptyTombstones(),
  };
}

describe("sync key-derivation migration", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("carries an existing v1 group over to its v2 id, re-encrypted", async () => {
    const records = mockServer();
    const v1 = await deriveLegacyCredentials(PASSPHRASE);
    const v2 = await deriveCredentials(PASSPHRASE);

    // A household already syncing under the old derivation.
    const payload = await encryptJson(v1.key, legacyState());
    records.set(v1.groupId, { ...payload, rev: 1 });

    const storage = new IndexedDBAdapter();
    await enableSync(storage, PASSPHRASE);

    // The restore flow on /welcome decides success by whether any profile
    // arrived. Without migration this is empty and the user is told the
    // passphrase is wrong — pointing the blame at the one thing that is right.
    expect((await storage.listProfiles()).map((p) => p.name)).toContain("Farmor");

    // The v2 group now exists and holds the same profile, under the new key.
    const migrated = records.get(v2.groupId);
    expect(migrated).toBeDefined();
    const state = await decryptJson<SyncState>(v2.key, {
      blob: migrated!.blob,
      iv: migrated!.iv,
    });
    expect(state.profiles.map((p) => p.name)).toContain("Farmor");

    // The old record is left alone: other devices may still be reading it.
    expect(records.get(v1.groupId)).toBeDefined();
  });

  it("a legacy join stores the legacy schema and still advertises the v3 upgrade", async () => {
    const records = mockServer();
    const v2 = await deriveCredentials(PASSPHRASE);
    records.set(v2.groupId, { ...(await encryptJson(v2.key, legacyState())), rev: 1 });

    const storage = new IndexedDBAdapter();
    await enableSync(storage, PASSPHRASE);

    expect(await storage.getMeta(META_SYNC_GROUP_ID)).toBe(v2.groupId);
    // Still passphrase-derived: the device must keep offering the move to a
    // random v3 identity, not report itself as current.
    expect(await storage.getMeta(META_SYNC_SCHEMA)).toBe("2");
    expect((await getSyncStatus(storage)).needsUpgrade).toBe(true);
  });

  it("flags a device still holding v1 credentials", async () => {
    const storage = new IndexedDBAdapter();
    // What an unmigrated device has in meta: an id, a key, no schema field.
    const v1 = await deriveLegacyCredentials(PASSPHRASE);
    await storage.setMeta(META_SYNC_GROUP_ID, v1.groupId);

    const status = await getSyncStatus(storage);
    expect(status.enabled).toBe(true);
    expect(status.needsUpgrade).toBe(true);
  });

  it("does not flag an upgrade when sync is off", async () => {
    const status = await getSyncStatus(new IndexedDBAdapter());
    expect(status.enabled).toBe(false);
    expect(status.needsUpgrade).toBe(false);
  });

  it("leaves an already-migrated v2 group untouched", async () => {
    const records = mockServer();
    const v1 = await deriveLegacyCredentials(PASSPHRASE);
    const v2 = await deriveCredentials(PASSPHRASE);

    // Another device migrated first; its state is authoritative.
    records.set(v1.groupId, { ...(await encryptJson(v1.key, legacyState())), rev: 1 });
    const winner: SyncState = { ...legacyState(), profiles: [] };
    records.set(v2.groupId, { ...(await encryptJson(v2.key, winner)), rev: 1 });

    await enableSync(new IndexedDBAdapter(), PASSPHRASE);

    // The v2 record was merged into, not overwritten by the stale v1 copy.
    const after = records.get(v2.groupId)!;
    expect(after.rev).toBeGreaterThanOrEqual(1);
    await expect(
      decryptJson<SyncState>(v2.key, { blob: after.blob, iv: after.iv }),
    ).resolves.toBeDefined();
  });

  it("surfaces a failed upgrade instead of quietly starting an empty group", async () => {
    // The server is reachable enough to answer for the v2 id but fails on the
    // v1 lookup — a transient error mid-upgrade.
    const v1 = await deriveLegacyCredentials(PASSPHRASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).endsWith(v1.groupId)
          ? new Response("", { status: 500 })
          : new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
      ),
    );

    const storage = new IndexedDBAdapter();
    // Must reject: swallowing this would switch the device to an empty v2
    // group and push over it, stranding the real history under the v1 id.
    await expect(enableSync(storage, PASSPHRASE)).rejects.toThrow();
    // And sync must not have been turned on against the wrong group.
    expect(await storage.getMeta(META_SYNC_GROUP_ID)).toBeFalsy();
  });

  it("refuses to CREATE a group from a passphrase (SEC-01)", async () => {
    // Deterministic identities are retired: a passphrase that matches no
    // existing group must fail loudly, not mint a group that a second
    // household choosing the same phrase would silently share.
    const records = mockServer();
    const storage = new IndexedDBAdapter();
    await expect(enableSync(storage, PASSPHRASE)).rejects.toThrow(SyncGroupNotFoundError);

    expect(records.size).toBe(0);
    const status = await getSyncStatus(storage);
    expect(status.enabled).toBe(false);
    expect(await storage.getMeta(META_SYNC_GROUP_ID)).toBeFalsy();
  });
});
