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
 * Write the next revision. `expectedRev` must match the stored revision
 * (0 when no record exists yet) or a RevConflictError is thrown.
 */
export async function writeRecord(
  dir: string,
  groupId: string,
  input: { blob: string; iv: string; expectedRev: number },
): Promise<StoredSyncRecord> {
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
  const tmp = `${target}.${process.pid}.${record.rev}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record), "utf8");
  await fs.rename(tmp, target);
  return record;
}
