/**
 * Persistent-storage helpers (issue #9). When granted, the browser commits
 * to not evicting this origin's IndexedDB under storage pressure — the main
 * data-loss risk for rarely-used, non-installed PWAs (see ADR 0002).
 */

export type PersistenceState = "granted" | "denied" | "unsupported";

export async function requestPersistentStorage(): Promise<PersistenceState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export async function persistentStorageStatus(): Promise<PersistenceState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  try {
    return (await navigator.storage.persisted()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}
