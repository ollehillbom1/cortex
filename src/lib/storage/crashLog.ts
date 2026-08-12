import type { StorageAdapter } from "@/lib/storage/adapter";

/**
 * A local crash log — no telemetry, on-device only.
 *
 * Cortex sends nothing off the device, so a bug the household hits is
 * invisible unless someone can articulate a report. This records unhandled
 * errors to IndexedDB (a bounded ring, newest kept) and surfaces them under
 * Profile → Diagnostics, turning "it crashed once, I forget how" into a
 * copyable stack. It stays on the phone until the user reads or clears it.
 *
 * Stored in a single meta key as a JSON array rather than its own object
 * store, so it needs no schema bump: a corrupt or oversized value degrades
 * to an empty log rather than breaking storage open.
 */

export const META_CRASH_LOG = "crashLog";
const MAX_ENTRIES = 20;
/** A stack can be huge; keep the log from bloating IndexedDB. */
const MAX_STACK_CHARS = 2000;

export interface CrashEntry {
  /** ISO timestamp. */
  at: string;
  message: string;
  stack?: string;
  /** Route or component context, when known. */
  where?: string;
  /** "error" (thrown/render) or "rejection" (unhandled promise). */
  kind: "error" | "rejection";
}

function isEntry(v: unknown): v is CrashEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CrashEntry).at === "string" &&
    typeof (v as CrashEntry).message === "string" &&
    ((v as CrashEntry).kind === "error" || (v as CrashEntry).kind === "rejection")
  );
}

export async function readCrashes(storage: StorageAdapter): Promise<CrashEntry[]> {
  const raw = await storage.getMeta(META_CRASH_LOG);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    // A malformed log is data we cannot trust, not a reason to throw on a
    // screen the user opened precisely because something already went wrong.
    return [];
  }
}

/**
 * Serialises the read-modify-write below. Errors often cascade — a render
 * failure throws, which trips an event handler, which rejects a promise —
 * so recordCrash is called several times almost at once. Without this
 * queue each call reads the same log and the last write wins, silently
 * dropping every crash but one. The store has no atomic append, so we
 * provide the ordering ourselves.
 */
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Append one crash, newest first, capped at MAX_ENTRIES. Best-effort and
 * self-contained: recording a crash must never throw a second one, so a
 * storage failure here is swallowed (the boundary UI still renders).
 * Concurrent calls are serialised, so simultaneous crashes are all kept.
 */
export function recordCrash(
  storage: StorageAdapter,
  entry: Omit<CrashEntry, "at"> & { at?: string },
): Promise<void> {
  const at = entry.at ?? new Date().toISOString();
  writeQueue = writeQueue
    .then(async () => {
      const trimmed: CrashEntry = {
        at,
        message: entry.message.slice(0, 500),
        stack: entry.stack?.slice(0, MAX_STACK_CHARS),
        where: entry.where?.slice(0, 200),
        kind: entry.kind,
      };
      const existing = await readCrashes(storage);
      const next = [trimmed, ...existing].slice(0, MAX_ENTRIES);
      await storage.setMeta(META_CRASH_LOG, JSON.stringify(next));
    })
    .catch(() => {
      /* never let crash-recording cause a crash */
    });
  return writeQueue;
}

export async function clearCrashes(storage: StorageAdapter): Promise<void> {
  // Flush the write queue first so a crash recorded a moment ago cannot land
  // after the clear and resurrect the log.
  writeQueue = writeQueue.then(() => storage.setMeta(META_CRASH_LOG, "[]")).catch(() => {});
  await writeQueue;
}
