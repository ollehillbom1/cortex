import { beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter } from "@/lib/storage/adapter";
import {
  clearCrashes,
  META_CRASH_LOG,
  readCrashes,
  recordCrash,
  type CrashEntry,
} from "./crashLog";

/** Minimal in-memory meta store — the crash log only touches get/setMeta. */
function fakeStorage(): StorageAdapter & { _meta: Map<string, string> } {
  const meta = new Map<string, string>();
  const s = {
    _meta: meta,
    getMeta: async (k: string) => meta.get(k),
    setMeta: async (k: string, v: string) => void meta.set(k, v),
  };
  return s as unknown as StorageAdapter & { _meta: Map<string, string> };
}

describe("crash log", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it("returns an empty log when nothing has been recorded", async () => {
    expect(await readCrashes(storage)).toEqual([]);
  });

  it("records newest-first and caps at 20 entries", async () => {
    for (let i = 0; i < 25; i++) {
      await recordCrash(storage, { message: `boom ${i}`, kind: "error", at: `t${i}` });
    }
    const log = await readCrashes(storage);
    expect(log).toHaveLength(20);
    expect(log[0].message).toBe("boom 24"); // newest first
    expect(log[19].message).toBe("boom 5"); // oldest kept
  });

  it("trims oversized messages and stacks", async () => {
    await recordCrash(storage, {
      message: "x".repeat(1000),
      stack: "y".repeat(5000),
      kind: "error",
    });
    const [entry] = await readCrashes(storage);
    expect(entry.message.length).toBe(500);
    expect(entry.stack?.length).toBe(2000);
  });

  it("stamps a timestamp when none is given", async () => {
    await recordCrash(storage, { message: "no stamp", kind: "rejection" });
    const [entry] = await readCrashes(storage);
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.kind).toBe("rejection");
  });

  it("degrades a corrupt log to empty rather than throwing", async () => {
    storage._meta.set(META_CRASH_LOG, "{not json");
    expect(await readCrashes(storage)).toEqual([]);
    // And a malformed array drops the invalid entries only.
    storage._meta.set(META_CRASH_LOG, JSON.stringify([{ junk: true }, validEntry()]));
    const log = await readCrashes(storage);
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe("real");
  });

  it("never throws even when storage fails", async () => {
    const broken = {
      getMeta: async () => {
        throw new Error("idb gone");
      },
      setMeta: async () => {
        throw new Error("idb gone");
      },
    } as unknown as StorageAdapter;
    // Must resolve, not reject — recording a crash cannot cause a crash.
    await expect(recordCrash(broken, { message: "x", kind: "error" })).resolves.toBeUndefined();
  });

  it("keeps every crash when several are recorded concurrently", async () => {
    // Errors cascade: a render throw trips a handler that rejects a promise,
    // so recordCrash fires several times at once. Read-modify-write on one
    // key would keep only the last; the write queue must keep them all.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        recordCrash(storage, { message: `c${i}`, kind: "error" }),
      ),
    );
    const log = await readCrashes(storage);
    expect(log).toHaveLength(8);
    expect(new Set(log.map((e) => e.message)).size).toBe(8);
  });

  it("clears to an empty array, even against an in-flight write", async () => {
    void recordCrash(storage, { message: "gone soon", kind: "error" });
    await clearCrashes(storage);
    expect(await readCrashes(storage)).toEqual([]);
  });
});

function validEntry(): CrashEntry {
  return { at: "2026-08-12T00:00:00.000Z", message: "real", kind: "error" };
}
