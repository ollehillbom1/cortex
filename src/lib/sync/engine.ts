import type { StorageAdapter } from "@/lib/storage/adapter";
import { CURRENT_DATA_VERSION } from "@/lib/storage/migrations";
import { withLocalConsent } from "@/lib/storage/exportImport";
import {
  decryptJson,
  deriveCredentials,
  encryptJson,
  exportKeyJwk,
  importKeyJwk,
  type EncryptedBlob,
} from "./crypto";
import { emptyTombstones, mergeStates, type SyncState, type SyncTombstones } from "./merge";

/**
 * Client sync engine (issue #2): pull → merge → apply locally → push, with
 * optimistic concurrency (the server rejects a push against a stale revision
 * and the client re-pulls and retries). Everything works offline; sync is
 * strictly additive to the local-first model.
 */

export const META_SYNC_GROUP_ID = "syncGroupId";
export const META_SYNC_KEY_JWK = "syncKeyJwk";
export const META_SYNC_TOMBSTONES = "syncTombstones";
export const META_SYNC_LAST_AT = "syncLastAt";
export const META_SYNC_LAST_ERROR = "syncLastError";

const MAX_PUSH_ATTEMPTS = 3;

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export async function getSyncStatus(storage: StorageAdapter): Promise<SyncStatus> {
  const [groupId, lastSyncAt, lastError] = await Promise.all([
    storage.getMeta(META_SYNC_GROUP_ID),
    storage.getMeta(META_SYNC_LAST_AT),
    storage.getMeta(META_SYNC_LAST_ERROR),
  ]);
  return {
    enabled: !!groupId,
    lastSyncAt: lastSyncAt ?? null,
    lastError: lastError ?? null,
  };
}

/** Derive and persist credentials, then run a first sync. */
export async function enableSync(storage: StorageAdapter, passphrase: string): Promise<void> {
  const credentials = await deriveCredentials(passphrase);
  await storage.setMeta(META_SYNC_GROUP_ID, credentials.groupId);
  await storage.setMeta(META_SYNC_KEY_JWK, await exportKeyJwk(credentials.key));
  await syncNow(storage);
}

/** Forget credentials and status; local data is left untouched. */
export async function disableSync(storage: StorageAdapter): Promise<void> {
  await storage.setMeta(META_SYNC_GROUP_ID, "");
  await storage.setMeta(META_SYNC_KEY_JWK, "");
  await storage.setMeta(META_SYNC_LAST_AT, "");
  await storage.setMeta(META_SYNC_LAST_ERROR, "");
}

/** Record a profile deletion so it sticks across synced devices. */
export async function recordProfileDeletion(storage: StorageAdapter, profileId: string) {
  const tombstones = await loadTombstones(storage);
  tombstones.deletedProfiles[profileId] = new Date().toISOString();
  await storage.setMeta(META_SYNC_TOMBSTONES, JSON.stringify(tombstones));
}

/** Record a progression reset so old sessions do not resurrect via sync. */
export async function recordSessionsCleared(storage: StorageAdapter, profileId: string) {
  const tombstones = await loadTombstones(storage);
  tombstones.clearedSessions[profileId] = new Date().toISOString();
  await storage.setMeta(META_SYNC_TOMBSTONES, JSON.stringify(tombstones));
}

/**
 * Run one sync cycle. Returns true when a cycle completed (or sync is
 * simply disabled); false when it failed — the error lands in meta and the
 * app keeps working locally either way.
 */
export async function syncNow(storage: StorageAdapter): Promise<boolean> {
  const groupId = await storage.getMeta(META_SYNC_GROUP_ID);
  const keyJwk = await storage.getMeta(META_SYNC_KEY_JWK);
  if (!groupId || !keyJwk) return true;

  try {
    const key = await importKeyJwk(keyJwk);

    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
      // 1. Pull.
      const remote = await fetchRemote(groupId);
      let remoteState: SyncState | null = null;
      if (remote.payload) {
        remoteState = await decryptJson<SyncState>(key, remote.payload);
      }

      // 2. Merge with the full local state.
      const local = await readLocalState(storage);
      const merged = remoteState ? mergeStates(local, remoteState) : local;

      // 3. Apply the merged state locally.
      await applyLocally(storage, merged);
      await storage.setMeta(META_SYNC_TOMBSTONES, JSON.stringify(merged.tombstones));

      // 4. Push, guarded by the revision we pulled.
      const payload = await encryptJson(key, merged);
      const pushed = await pushRemote(groupId, payload, remote.rev);
      if (pushed) {
        await storage.setMeta(META_SYNC_LAST_AT, new Date().toISOString());
        await storage.setMeta(META_SYNC_LAST_ERROR, "");
        return true;
      }
      // 409: someone else pushed meanwhile — loop pulls and merges again.
    }
    throw new Error("conflict retries exhausted");
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    await storage.setMeta(META_SYNC_LAST_ERROR, message);
    return false;
  }
}

async function readLocalState(storage: StorageAdapter): Promise<SyncState> {
  const profiles = await storage.listProfiles();
  const sessions = [];
  for (const p of profiles) sessions.push(...(await storage.listSessions(p.id)));
  return {
    dataVersion: CURRENT_DATA_VERSION,
    profiles,
    sessions,
    tombstones: await loadTombstones(storage),
  };
}

async function applyLocally(storage: StorageAdapter, merged: SyncState): Promise<void> {
  const localProfiles = await storage.listProfiles();
  const mergedIds = new Set(merged.profiles.map((p) => p.id));

  // Deletions decided by the merge (tombstones) take effect locally too.
  for (const local of localProfiles) {
    if (!mergedIds.has(local.id)) await storage.deleteProfile(local.id);
  }
  for (const profile of merged.profiles) {
    const local = localProfiles.find((p) => p.id === profile.id);
    // Coach consent is per device and per operator; it never syncs in.
    const incoming = local?.preferences.aiCoach
      ? { ...profile, preferences: { ...profile.preferences, aiCoach: true } }
      : withLocalConsent(profile);
    if (!local || JSON.stringify(local) !== JSON.stringify(incoming)) {
      await storage.putProfile(incoming);
    }
  }
  for (const profile of merged.profiles) {
    const known = new Set((await storage.listSessions(profile.id)).map((s) => s.id));
    for (const session of merged.sessions) {
      if (session.profileId === profile.id && !known.has(session.id)) {
        await storage.addSession(session);
      }
    }
  }
}

async function loadTombstones(storage: StorageAdapter): Promise<SyncTombstones> {
  const raw = await storage.getMeta(META_SYNC_TOMBSTONES);
  if (!raw) return emptyTombstones();
  try {
    const parsed = JSON.parse(raw) as Partial<SyncTombstones>;
    return {
      deletedProfiles: parsed.deletedProfiles ?? {},
      clearedSessions: parsed.clearedSessions ?? {},
    };
  } catch {
    return emptyTombstones();
  }
}

interface RemoteRecord {
  payload: EncryptedBlob | null;
  rev: number;
}

async function fetchRemote(groupId: string): Promise<RemoteRecord> {
  const res = await fetch(`/api/sync/${groupId}`, { cache: "no-store" });
  if (res.status === 404) return { payload: null, rev: 0 };
  if (!res.ok) throw new Error(`sync server error ${res.status}`);
  const body = (await res.json()) as { blob: string; iv: string; rev: number };
  return { payload: { blob: body.blob, iv: body.iv }, rev: body.rev };
}

/** Returns false on a 409 revision conflict (caller retries). */
async function pushRemote(
  groupId: string,
  payload: EncryptedBlob,
  expectedRev: number,
): Promise<boolean> {
  const res = await fetch(`/api/sync/${groupId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expectedRev }),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`sync server error ${res.status}`);
  return true;
}
