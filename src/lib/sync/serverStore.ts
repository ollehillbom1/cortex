import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Server-side blob store for sync (issue #2). The server only ever sees an
 * opaque AES-GCM ciphertext per sync group; it stores exactly one record per
 * group (the latest merged state) with a revision counter for optimistic
 * concurrency. Plain JSON files on disk: household-scale by design, no
 * database dependency, atomic via write-to-temp + rename.
 */

export interface StoredSyncRecord {
  rev: number;
  blob: string;
  iv: string;
  updatedAt: string;
}

export class RevConflictError extends Error {
  constructor(public currentRev: number) {
    super("revision conflict");
  }
}

/** Ciphertext cap (base64 chars): ~6 MB of encrypted state, plenty. */
export const MAX_BLOB_CHARS = 8_000_000;

/**
 * Global ceilings for the whole store.
 *
 * Per-request limits and per-IP rate limits bound how fast one client can
 * write, not how much the store can hold: an unauthenticated PUT creates a
 * file, and any group id the client picks is a new file. Without a total
 * budget the only limit is the disk.
 *
 * Overridable so a larger deployment can raise them deliberately.
 */
export const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAX_GROUPS = 500;

/** Resolved per call, not at module load, so deployment and tests can set it. */
export function maxTotalBytes(): number {
  const raw = Number(process.env.SYNC_MAX_TOTAL_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOTAL_BYTES;
}

export function maxGroups(): number {
  const raw = Number(process.env.SYNC_MAX_GROUPS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_GROUPS;
}

/** Thrown when a write would take the store past a global ceiling. */
export class QuotaExceededError extends Error {
  constructor(readonly reason: "bytes") {
    super(`sync store quota exceeded (${reason})`);
    this.name = "QuotaExceededError";
  }
}

/** Current group count and total bytes on disk. */
async function storeUsage(dir: string): Promise<{ groups: number; bytes: number }> {
  const syncDir = path.join(dir, "sync");
  let names: string[];
  try {
    names = await fs.readdir(syncDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { groups: 0, bytes: 0 };
    throw err;
  }
  let groups = 0;
  let bytes = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue; // skip in-flight *.tmp files
    groups += 1;
    try {
      bytes += (await fs.stat(path.join(syncDir, name))).size;
    } catch {
      // Raced with a rename; the next write will see it.
    }
  }
  return { groups, bytes };
}

export function syncDataDir(): string {
  return process.env.SYNC_DATA_DIR || path.join(process.cwd(), "data");
}

function recordPath(dir: string, groupId: string): string {
  return path.join(dir, "sync", `${groupId}.json`);
}

export async function readRecord(dir: string, groupId: string): Promise<StoredSyncRecord | null> {
  try {
    const raw = await fs.readFile(recordPath(dir, groupId), "utf8");
    return JSON.parse(raw) as StoredSyncRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Serialises writes per sync group.
 *
 * Reading the current revision and writing the next one is a check-then-act
 * sequence: without this, two requests quoting the same `expectedRev` both
 * pass the check and both write, so one device's state is lost even though
 * the server answered 200. Optimistic concurrency only holds if the pair is
 * indivisible.
 *
 * This covers concurrency within one server process, which is how Cortex is
 * deployed (a single container — see docker-compose.yml). Running several
 * replicas against one shared volume would need a cross-process lock.
 */
const groupWrites = new Map<string, Promise<unknown>>();

/**
 * Serialises the quota check with the write it guards.
 *
 * withGroupLock is per group, but the budget is a property of the WHOLE
 * store, so concurrent writes to different groups each read a stale usage and
 * all pass: measured 40 groups against a ceiling of 5, and 116% of the byte
 * budget. Check-then-act across groups needs a lock across groups.
 */
let quotaGate: Promise<unknown> = Promise.resolve();

function withQuotaGate<T>(fn: () => Promise<T>): Promise<T> {
  const result = quotaGate.then(fn, fn);
  quotaGate = result.then(
    () => {},
    () => {},
  );
  return result;
}

function withGroupLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const previous = groupWrites.get(groupId) ?? Promise.resolve();
  // Chain on settlement, not success: one failed write must not wedge the group.
  const result = previous.then(fn, fn);
  const settled = result.then(
    () => {},
    () => {},
  );
  groupWrites.set(groupId, settled);
  void settled.then(() => {
    // Drop the entry once this is the last write queued, so the map does not
    // grow without bound across group ids.
    if (groupWrites.get(groupId) === settled) groupWrites.delete(groupId);
  });
  return result;
}

/**
 * Write the next revision. `expectedRev` must match the stored revision
 * (0 when no record exists yet) or a RevConflictError is thrown.
 */
export function writeRecord(
  dir: string,
  groupId: string,
  input: { blob: string; iv: string; expectedRev: number },
): Promise<StoredSyncRecord> {
  return withGroupLock(groupId, async () => {
    const current = await readRecord(dir, groupId);
    const currentRev = current?.rev ?? 0;
    if (input.expectedRev !== currentRev) throw new RevConflictError(currentRev);

    // A full store must stop taking on more, without locking out the
    // households already using it: replacing a record with one no larger is
    // always allowed, so an existing group can keep syncing (and shrink).
    const record: StoredSyncRecord = {
      rev: currentRev + 1,
      blob: input.blob,
      iv: input.iv,
      updatedAt: new Date().toISOString(),
    };
    const target = recordPath(dir, groupId);
    const nextSize = Buffer.byteLength(JSON.stringify(record), "utf8");
    const previousSize = current ? await recordSize(target) : 0;
    if (nextSize > previousSize) {
      return withQuotaGate(async () => {
        const usage = await storeUsage(dir);
        // Byte budget only. A group COUNT ceiling looked prudent and was the
        // cheaper attack: 550 empty groups (~50 kB, ~2 s from one host) locked
        // every new household out permanently, because nothing expires records
        // and existing groups kept working so nothing surfaced it. Bytes are
        // what the disk actually runs out of, and filling those costs the
        // attacker the same as it costs the server.
        if (usage.bytes - previousSize + nextSize > maxTotalBytes()) {
          throw new QuotaExceededError("bytes");
        }
        // Written inside the gate: releasing it before the bytes land would
        // let the next writer read a usage that does not include them.
        return persist(target, record);
      });
    }
    return persist(target, record);
  });
}

/** Atomic write-then-rename of one record. */
async function persist(target: string, record: StoredSyncRecord): Promise<StoredSyncRecord> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Unique per write: a name derived from pid and rev collides between
  // concurrent writes, which corrupts the temp file and makes one rename
  // fail with ENOENT after the other has moved it.
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(record), "utf8");
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return record;
}

/** Size on disk of an existing record, or 0 when it is gone. */
async function recordSize(target: string): Promise<number> {
  try {
    return (await fs.stat(target)).size;
  } catch {
    return 0;
  }
}
