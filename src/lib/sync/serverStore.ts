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

    const record: StoredSyncRecord = {
      rev: currentRev + 1,
      blob: input.blob,
      iv: input.iv,
      updatedAt: new Date().toISOString(),
    };
    const target = recordPath(dir, groupId);
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
  });
}
