import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBAdapter } from "@/lib/storage/db";
import { createProfile } from "@/lib/storage/profileFactory";
import { decryptJson, deriveCredentials, encryptJson } from "./crypto";
import { emptyTombstones, type SyncState } from "./merge";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import { SyncCodeFormatError } from "./syncCode";
import {
  createSyncGroup,
  deleteServerCopyAndDisable,
  getSyncStatus,
  joinSyncGroup,
  META_SYNC_GROUP_ID,
  META_SYNC_KEY_JWK,
  META_SYNC_SCHEMA,
  SyncGroupNotFoundError,
  upgradeSyncToV3,
} from "./engine";

/**
 * The v3 protocol (SEC-01): identity comes from a random seed shown to the
 * user as a sync code, never from anything a person chose. These tests pin
 * the three journeys — create, join, upgrade — and the refusals that make
 * the design safe: joining must fail loudly rather than land anywhere the
 * code does not denote.
 *
 * "Another device" is a fresh IDBFactory: adapters share the global
 * indexedDB, so isolation comes from swapping the global between devices.
 * The mock server (a Map) deliberately survives the swap, like the real one.
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
    if (init.method === "DELETE") {
      if (!records.delete(groupId)) {
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
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

/** A brand-new device: empty IndexedDB, nothing shared with earlier adapters. */
function freshDevice(): IndexedDBAdapter {
  indexedDB = new IDBFactory();
  return new IndexedDBAdapter();
}

async function deviceWithProfile(name: string): Promise<IndexedDBAdapter> {
  const storage = freshDevice();
  await storage.putProfile(createProfile({ id: `id-${name}`, name, now: new Date("2026-01-01") }));
  return storage;
}

async function v2Device(records: Map<string, { blob: string; iv: string; rev: number }>) {
  const v2 = await deriveCredentials(PASSPHRASE);
  const farmor = createProfile({ id: "farmor", name: "Farmor", now: new Date("2026-01-01") });
  const remote: SyncState = {
    dataVersion: CURRENT_DATA_VERSION,
    profiles: [farmor],
    sessions: [],
    tombstones: emptyTombstones(),
  };
  records.set(v2.groupId, { ...(await encryptJson(v2.key, remote)), rev: 1 });

  // A device already in the v2 group, as enableSync would have left it.
  const storage = freshDevice();
  await storage.setMeta(META_SYNC_GROUP_ID, v2.groupId);
  await storage.setMeta(
    META_SYNC_KEY_JWK,
    JSON.stringify(await crypto.subtle.exportKey("jwk", v2.key)),
  );
  await storage.setMeta(META_SYNC_SCHEMA, "2");
  return { storage, v2 };
}

describe("v3 sync protocol", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("create: pushes this device's data under a random identity and returns the code", async () => {
    const records = mockServer();
    const storage = await deviceWithProfile("Anna");

    const code = await createSyncGroup(storage);

    // The push carried the write capability in a header (SEC-02): the group
    // binds it at creation, and the id in the URL stops being a credential.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const putCall = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const headers = (putCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-sync-write-token"]).toMatch(/^[0-9a-f]{64}$/);
    expect(String(putCall![0])).not.toContain(headers["x-sync-write-token"]);

    expect(code).toMatch(/^C3-/);
    expect(records.size).toBe(1);
    const status = await getSyncStatus(storage);
    expect(status.enabled).toBe(true);
    expect(status.needsUpgrade).toBe(false);
    expect(status.syncCode).toBe(code);
    expect(await storage.getMeta(META_SYNC_SCHEMA)).toBe("3");
  });

  it("join: the code from one device brings its data to another", async () => {
    mockServer();
    const code = await createSyncGroup(await deviceWithProfile("Anna"));

    const deviceB = freshDevice();
    expect(await deviceB.listProfiles()).toEqual([]);
    await joinSyncGroup(deviceB, code);

    expect((await deviceB.listProfiles()).map((p) => p.name)).toContain("Anna");
    expect((await getSyncStatus(deviceB)).syncCode).toBe(code);
  });

  it("join: hand-typed variants of the code work, and the canonical form is stored", async () => {
    mockServer();
    const code = await createSyncGroup(await deviceWithProfile("Anna"));

    const deviceB = freshDevice();
    await joinSyncGroup(deviceB, code.toLowerCase().replace(/-/g, " "));
    expect((await deviceB.listProfiles()).map((p) => p.name)).toContain("Anna");
    expect((await getSyncStatus(deviceB)).syncCode).toBe(code);
  });

  it("join: two households can never collide", async () => {
    mockServer();
    const codeA = await createSyncGroup(await deviceWithProfile("Anna"));
    const codeB = await createSyncGroup(await deviceWithProfile("Berit"));
    expect(codeA).not.toBe(codeB);

    const joiner = freshDevice();
    await joinSyncGroup(joiner, codeB);
    const names = (await joiner.listProfiles()).map((p) => p.name);
    expect(names).toContain("Berit");
    expect(names).not.toContain("Anna");
  });

  it("join: a well-formed code that denotes nothing fails loudly and persists nothing", async () => {
    const records = mockServer();
    // A code from a different server, or a group since deleted.
    const foreign = await createSyncGroup(freshDevice());
    records.clear();

    const storage = await deviceWithProfile("Anna");
    await expect(joinSyncGroup(storage, foreign)).rejects.toThrow(SyncGroupNotFoundError);
    expect(await storage.getMeta(META_SYNC_GROUP_ID)).toBeFalsy();
    // The device's own data never left it.
    expect(records.size).toBe(0);
  });

  it("join: a mangled code is rejected before touching the network", async () => {
    const records = mockServer();
    await expect(joinSyncGroup(freshDevice(), "C3-NOT-A-REAL-CODE-XXXX-XXXX-XX")).rejects.toThrow(
      SyncCodeFormatError,
    );
    expect(records.size).toBe(0);
  });

  it("upgrade: carries a v2 group's data to a v3 identity and leaves the old record", async () => {
    const records = mockServer();
    const { storage, v2 } = await v2Device(records);

    const code = await upgradeSyncToV3(storage);

    // Remote-only data was pulled before the switch...
    expect((await storage.listProfiles()).map((p) => p.name)).toContain("Farmor");
    // ...the new group exists, distinct from the old, holding the same data...
    const status = await getSyncStatus(storage);
    expect(await storage.getMeta(META_SYNC_GROUP_ID)).not.toBe(v2.groupId);
    expect(status.needsUpgrade).toBe(false);
    expect(status.syncCode).toBe(code);
    // ...and another device can follow with the code alone.
    const follower = freshDevice();
    await joinSyncGroup(follower, code);
    expect((await follower.listProfiles()).map((p) => p.name)).toContain("Farmor");
    // The v2 record stays: devices that have not moved yet are still reading it.
    const old = records.get(v2.groupId)!;
    expect(old).toBeDefined();
    const oldState = await decryptJson<SyncState>(v2.key, { blob: old.blob, iv: old.iv });
    expect(oldState.profiles.map((p) => p.name)).toContain("Farmor");
  });

  it("delete: removes the server record with the capability, then disables locally", async () => {
    const records = mockServer();
    const storage = await deviceWithProfile("Anna");
    await createSyncGroup(storage);
    expect(records.size).toBe(1);

    await deleteServerCopyAndDisable(storage);

    expect(records.size).toBe(0);
    const status = await getSyncStatus(storage);
    expect(status.enabled).toBe(false);
    // The DELETE carried the capability header, and never put it in the URL.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const delCall = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(delCall).toBeDefined();
    const headers = (delCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-sync-write-token"]).toMatch(/^[0-9a-f]{64}$/);
    expect(String(delCall![0])).not.toContain(headers["x-sync-write-token"]);
    // Local training data was never touched.
    expect((await storage.listProfiles()).map((p) => p.name)).toContain("Anna");
  });

  it("delete: a passphrase-era group refuses and stays enabled", async () => {
    const records = mockServer();
    const { storage, v2 } = await v2Device(records);

    await expect(deleteServerCopyAndDisable(storage)).rejects.toThrow(/upgrade sync security/i);
    expect(records.get(v2.groupId)).toBeDefined();
    expect((await getSyncStatus(storage)).enabled).toBe(true);
  });

  it("upgrade: an unreachable old group aborts the move with credentials intact", async () => {
    const records = mockServer();
    const { storage, v2 } = await v2Device(records);
    // Every fetch now fails: the mandatory pre-switch pull cannot complete.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );

    await expect(upgradeSyncToV3(storage)).rejects.toThrow();
    // Still pointing at the old group — nothing was stranded.
    expect(await storage.getMeta(META_SYNC_GROUP_ID)).toBe(v2.groupId);
    expect(await storage.getMeta(META_SYNC_SCHEMA)).toBe("2");
    expect((await getSyncStatus(storage)).needsUpgrade).toBe(true);
  });
});
