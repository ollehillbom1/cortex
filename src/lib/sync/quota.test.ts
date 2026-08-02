import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { QuotaExceededError, writeRecord, maxGroups, DEFAULT_MAX_GROUPS } from "./serverStore";

/**
 * Per-request size limits and per-IP rate limits bound how fast one client
 * writes, not how much the store can hold. An unauthenticated PUT creates a
 * file, and every group id a client invents is a new file — so without a
 * total budget the only limit was the disk.
 *
 * The budget must not lock out households already syncing: a full store
 * stops growing, it does not stop working.
 */

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cortex-quota-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const groupId = (n: number) => `g${String(n).padStart(63, "0")}`;
const payload = (blob: string, expectedRev = 0) => ({ blob, iv: "AAAAAAAAAAAAAAAA", expectedRev });

describe("sync store quotas", () => {
  it("refuses a new group once the store is at its byte ceiling", async () => {
    const dir = tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "2000";
    try {
      await writeRecord(dir, groupId(1), payload("A".repeat(1500)));
      await expect(writeRecord(dir, groupId(2), payload("A".repeat(1500)))).rejects.toBeInstanceOf(
        QuotaExceededError,
      );
    } finally {
      delete process.env.SYNC_MAX_TOTAL_BYTES;
    }
  });

  it("still lets an existing group keep syncing when the store is full", async () => {
    // The households already using the server must not be locked out by a
    // newcomer filling it: a replacement no larger than what it replaces is
    // always allowed.
    const dir = tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "2000";
    try {
      await writeRecord(dir, groupId(1), payload("A".repeat(1500)));
      const same = await writeRecord(dir, groupId(1), payload("B".repeat(1500), 1));
      expect(same.rev).toBe(2);
      const smaller = await writeRecord(dir, groupId(1), payload("C".repeat(100), 2));
      expect(smaller.rev).toBe(3);
    } finally {
      delete process.env.SYNC_MAX_TOTAL_BYTES;
    }
  });

  it("refuses growth past the ceiling even for an existing group", async () => {
    const dir = tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "2000";
    try {
      await writeRecord(dir, groupId(1), payload("A".repeat(1500)));
      await expect(
        writeRecord(dir, groupId(1), payload("A".repeat(5000), 1)),
      ).rejects.toBeInstanceOf(QuotaExceededError);
    } finally {
      delete process.env.SYNC_MAX_TOTAL_BYTES;
    }
  });

  it("refuses a new group past the group ceiling", async () => {
    const dir = tempDir();
    process.env.SYNC_MAX_GROUPS = "3";
    try {
      for (let i = 1; i <= 3; i++) await writeRecord(dir, groupId(i), payload("A".repeat(10)));
      await expect(writeRecord(dir, groupId(4), payload("A".repeat(10)))).rejects.toBeInstanceOf(
        QuotaExceededError,
      );
      // ...and the groups that exist still work.
      const again = await writeRecord(dir, groupId(1), payload("B".repeat(10), 1));
      expect(again.rev).toBe(2);
    } finally {
      delete process.env.SYNC_MAX_GROUPS;
    }
  });

  it("resolves ceilings per call, so deployment settings are honoured", () => {
    // Read at module load, an env var set by the operator (or a test) after
    // import is silently ignored - the failure mode is a limit that looks
    // configured and is not.
    expect(maxGroups()).toBe(DEFAULT_MAX_GROUPS);
    process.env.SYNC_MAX_GROUPS = "7";
    try {
      expect(maxGroups()).toBe(7);
    } finally {
      delete process.env.SYNC_MAX_GROUPS;
    }
    expect(maxGroups()).toBe(DEFAULT_MAX_GROUPS);
  });
});
