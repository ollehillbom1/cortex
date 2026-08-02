import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  QuotaExceededError,
  writeRecord,
  maxTotalBytes,
  DEFAULT_MAX_TOTAL_BYTES,
} from "./serverStore";

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
    // always allowed. The ceiling is set so the store is genuinely FULL —
    // an earlier version used a ceiling the record never reached, so the
    // naive "refuse every write when full" implementation passed it too.
    const dir = tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "1700";
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

  it("holds the byte ceiling under concurrent writes to different groups", async () => {
    // The per-group lock does not help: the budget is a property of the whole
    // store, so concurrent writes to DIFFERENT groups each read a stale usage
    // and all pass. Measured before the gate: 116% of the byte budget.
    const dir = tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "6000";
    try {
      const writes = Array.from({ length: 20 }, (_, i) =>
        writeRecord(dir, groupId(i + 1), payload("A".repeat(900))).catch(() => null),
      );
      const results = await Promise.all(writes);
      const accepted = results.filter(Boolean).length;
      expect(accepted).toBeGreaterThan(0);

      const { readdirSync, statSync } = await import("node:fs");
      const files = readdirSync(path.join(dir, "sync")).filter((f) => f.endsWith(".json"));
      const bytes = files.reduce((a, f) => a + statSync(path.join(dir, "sync", f)).size, 0);
      expect(bytes).toBeLessThanOrEqual(6000);
    } finally {
      delete process.env.SYNC_MAX_TOTAL_BYTES;
    }
  });

  it("resolves ceilings per call, so deployment settings are honoured", () => {
    // Read at module load, an env var set by the operator (or a test) after
    // import is silently ignored - the failure mode is a limit that looks
    // configured and is not.
    expect(maxTotalBytes()).toBe(DEFAULT_MAX_TOTAL_BYTES);
    process.env.SYNC_MAX_TOTAL_BYTES = "7777";
    try {
      expect(maxTotalBytes()).toBe(7777);
    } finally {
      delete process.env.SYNC_MAX_TOTAL_BYTES;
    }
    expect(maxTotalBytes()).toBe(DEFAULT_MAX_TOTAL_BYTES);
  });
});
