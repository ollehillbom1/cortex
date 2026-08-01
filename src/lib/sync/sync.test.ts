import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyTombstones, mergeStates, type SyncState } from "./merge";
import {
  decryptJson,
  deriveCredentials,
  deriveLegacyCredentials,
  encryptJson,
  isValidGroupId,
} from "./crypto";
import { readRecord, RevConflictError, writeRecord, type StoredSyncRecord } from "./serverStore";
import { createProfile } from "@/lib/storage/profileFactory";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import type { Profile, SessionRecord } from "@/lib/domain/types";

function profile(id: string, name: string, updatedAt: string): Profile {
  const p = createProfile({ id, name, now: new Date("2026-01-01T00:00:00Z") });
  p.updatedAt = updatedAt;
  return p;
}

function session(id: string, profileId: string, startedAt: string): SessionRecord {
  return {
    id,
    profileId,
    type: "recommended",
    startedAt,
    endedAt: startedAt,
    durationMs: 60_000,
    exercises: [],
    xpEarned: 10,
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("sync merge", () => {
  it("profiles: newer updatedAt wins in both directions", () => {
    const older = profile("p", "Old name", "2026-07-01T00:00:00Z");
    const newer = profile("p", "New name", "2026-07-02T00:00:00Z");
    const ab = mergeStates(state({ profiles: [older] }), state({ profiles: [newer] }));
    const ba = mergeStates(state({ profiles: [newer] }), state({ profiles: [older] }));
    expect(ab.profiles[0].name).toBe("New name");
    expect(ba.profiles[0].name).toBe("New name");
  });

  it("profiles: equal timestamps resolve symmetrically", () => {
    const x = profile("p", "Alpha", "2026-07-01T00:00:00Z");
    const y = profile("p", "Beta", "2026-07-01T00:00:00Z");
    const ab = mergeStates(state({ profiles: [x] }), state({ profiles: [y] }));
    const ba = mergeStates(state({ profiles: [y] }), state({ profiles: [x] }));
    expect(ab.profiles[0].name).toBe(ba.profiles[0].name);
  });

  it("sessions: union by id, sorted, no duplicates", () => {
    const p = profile("p", "P", "2026-07-01T00:00:00Z");
    const a = state({
      profiles: [p],
      sessions: [
        session("s1", "p", "2026-07-01T10:00:00Z"),
        session("s2", "p", "2026-07-02T10:00:00Z"),
      ],
    });
    const b = state({
      profiles: [p],
      sessions: [
        session("s2", "p", "2026-07-02T10:00:00Z"),
        session("s3", "p", "2026-07-03T10:00:00Z"),
      ],
    });
    const merged = mergeStates(a, b);
    expect(merged.sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("deletion tombstones win over older profile edits and propagate", () => {
    const edited = profile("p", "Edited", "2026-07-01T00:00:00Z");
    const withTombstone = state({
      tombstones: { deletedProfiles: { p: "2026-07-02T00:00:00Z" }, clearedSessions: {} },
    });
    const merged = mergeStates(state({ profiles: [edited] }), withTombstone);
    expect(merged.profiles).toHaveLength(0);
    expect(merged.tombstones.deletedProfiles.p).toBe("2026-07-02T00:00:00Z");
  });

  it("an edit AFTER the deletion revives the profile", () => {
    const revived = profile("p", "Back again", "2026-07-03T00:00:00Z");
    const withTombstone = state({
      tombstones: { deletedProfiles: { p: "2026-07-02T00:00:00Z" }, clearedSessions: {} },
    });
    const merged = mergeStates(state({ profiles: [revived] }), withTombstone);
    expect(merged.profiles).toHaveLength(1);
  });

  it("cleared-session watermarks drop old sessions but keep new ones", () => {
    const p = profile("p", "P", "2026-07-05T00:00:00Z");
    const a = state({
      profiles: [p],
      sessions: [
        session("old", "p", "2026-07-01T10:00:00Z"),
        session("new", "p", "2026-07-04T10:00:00Z"),
      ],
    });
    const b = state({
      profiles: [p],
      tombstones: { deletedProfiles: {}, clearedSessions: { p: "2026-07-03T00:00:00Z" } },
    });
    const merged = mergeStates(a, b);
    expect(merged.sessions.map((s) => s.id)).toEqual(["new"]);
  });

  it("drops sessions whose profile no longer exists", () => {
    const a = state({ sessions: [session("s1", "ghost", "2026-07-01T10:00:00Z")] });
    expect(mergeStates(a, state({})).sessions).toHaveLength(0);
  });
});

describe("sync crypto", () => {
  it("derives a deterministic, valid group id and key from the passphrase", async () => {
    const a = await deriveCredentials("hemlig lösenfras");
    const b = await deriveCredentials("hemlig lösenfras");
    const other = await deriveCredentials("annan lösenfras");
    expect(a.groupId).toBe(b.groupId);
    expect(isValidGroupId(a.groupId)).toBe(true);
    expect(other.groupId).not.toBe(a.groupId);
  });

  it("round-trips data and rejects the wrong key", async () => {
    const right = await deriveCredentials("rätt lösenfras");
    const wrong = await deriveCredentials("fel lösenfras");
    const payload = await encryptJson(right.key, { hello: "värld", n: 42 });
    expect(await decryptJson(right.key, payload)).toEqual({ hello: "värld", n: 42 });
    await expect(decryptJson(wrong.key, payload)).rejects.toThrow();
  });

  it("never produces the same ciphertext twice (random IV)", async () => {
    const { key } = await deriveCredentials("samma lösenfras");
    const one = await encryptJson(key, { a: 1 });
    const two = await encryptJson(key, { a: 1 });
    expect(one.blob).not.toBe(two.blob);
  });

  it("the group id is not a cheap hash of the passphrase", async () => {
    const passphrase = "hemlig lösenfras";
    const { groupId } = await deriveCredentials(passphrase);

    // v1 handed the server SHA-256(context + passphrase) as a filename, so a
    // single hash per guess was enough to brute-force the household secret.
    // Any derivation reproducible that cheaply is a regression.
    for (const context of [
      "cortex-sync-id:v1:",
      "cortex-sync-key:v1:",
      "cortex-sync:v2",
      "cortex-sync-id:v2",
      "",
    ]) {
      expect(groupId).not.toBe(await sha256Hex(context + passphrase));
      expect(groupId).not.toBe(await sha256Hex(passphrase + context));
    }
  });

  it("the group id reveals nothing usable about the key", async () => {
    const { groupId, key } = await deriveCredentials("hemlig lösenfras");
    const raw = Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("hex");
    // Separate HKDF info strings: neither output is a prefix, suffix or copy
    // of the other, so publishing the id cannot leak key material.
    expect(raw).not.toBe(groupId);
    expect(groupId.includes(raw)).toBe(false);
    expect(raw.includes(groupId)).toBe(false);
  });

  it("v2 lands in a different group than v1, and v1 is still readable", async () => {
    const passphrase = "hemlig lösenfras";
    const v2 = await deriveCredentials(passphrase);
    const v1 = await deriveLegacyCredentials(passphrase);
    expect(v2.groupId).not.toBe(v1.groupId);
    expect(isValidGroupId(v1.groupId)).toBe(true);

    // Migration depends on v1 still round-tripping its own ciphertext.
    const payload = await encryptJson(v1.key, { legacy: true });
    expect(await decryptJson(v1.key, payload)).toEqual({ legacy: true });
    // And the two keys must not be interchangeable.
    await expect(decryptJson(v2.key, payload)).rejects.toThrow();
  });
});

describe("sync server store", () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cortex-sync-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const GROUP = "a".repeat(64);

  it("stores and reads records with increasing revisions", async () => {
    const dir = tempDir();
    expect(await readRecord(dir, GROUP)).toBeNull();
    const first = await writeRecord(dir, GROUP, { blob: "AAAA", iv: "BBBB", expectedRev: 0 });
    expect(first.rev).toBe(1);
    const second = await writeRecord(dir, GROUP, { blob: "CCCC", iv: "DDDD", expectedRev: 1 });
    expect(second.rev).toBe(2);
    expect((await readRecord(dir, GROUP))?.blob).toBe("CCCC");
  });

  it("rejects stale revisions with the current rev (optimistic concurrency)", async () => {
    const dir = tempDir();
    await writeRecord(dir, GROUP, { blob: "AAAA", iv: "BBBB", expectedRev: 0 });
    await expect(
      writeRecord(dir, GROUP, { blob: "XXXX", iv: "YYYY", expectedRev: 0 }),
    ).rejects.toThrow(RevConflictError);
    // The stored record is untouched by the failed write.
    expect((await readRecord(dir, GROUP))?.blob).toBe("AAAA");
  });

  it("two devices pushing the same rev at once: exactly one wins", async () => {
    const dir = tempDir();
    await writeRecord(dir, GROUP, { blob: "AAAA", iv: "BBBB", expectedRev: 0 });

    // Both devices pulled rev 1 and push their own merged state.
    const results = await Promise.allSettled([
      writeRecord(dir, GROUP, { blob: "DEVICEONE", iv: "IVAA", expectedRev: 1 }),
      writeRecord(dir, GROUP, { blob: "DEVICETWO", iv: "IVBB", expectedRev: 1 }),
    ]);

    const accepted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is told to re-merge, not handed a storage error: only 409
    // makes the client pull, merge and retry.
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RevConflictError);

    // What the winner was told it stored is what is actually on disk.
    const winner = (accepted[0] as PromiseFulfilledResult<StoredSyncRecord>).value;
    const stored = await readRecord(dir, GROUP);
    expect(stored?.blob).toBe(winner.blob);
    expect(stored?.rev).toBe(winner.rev);
    expect(stored?.rev).toBe(2);
  });

  it("a burst of writes leaves one record per revision, none blended", async () => {
    const dir = tempDir();
    await writeRecord(dir, GROUP, { blob: "SEED", iv: "IV", expectedRev: 0 });

    // Ten devices race on rev 1. Nine must be told to re-merge.
    const blobs = Array.from({ length: 10 }, (_, i) => "ABCDEFGHIJ"[i].repeat(4096));
    const results = await Promise.allSettled(
      blobs.map((blob) => writeRecord(dir, GROUP, { blob, iv: "IV", expectedRev: 1 })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Every loser must be told to re-merge. A storage error here would make
    // those nine clients give up instead of retrying.
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RevConflictError);
    }

    // The survivor is exactly one writer's payload, not a splice of several.
    const stored = await readRecord(dir, GROUP);
    expect(blobs).toContain(stored?.blob);

    // No temp files left behind.
    const leftovers = (await readdir(path.join(dir, "sync"))).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
