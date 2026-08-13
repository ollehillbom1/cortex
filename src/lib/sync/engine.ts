import type { StorageAdapter } from "@/lib/storage/adapter";
import {
  CURRENT_DATA_VERSION,
  FutureDataVersionError,
  storedDataVersion,
} from "@/lib/storage/migrations";
import { withLocalConsent } from "@/lib/storage/exportImport";
import {
  CURRENT_SYNC_SCHEMA,
  LEGACY_SYNC_SCHEMA,
  decryptJson,
  deriveCodeCredentials,
  deriveCredentials,
  deriveLegacyCredentials,
  encryptJson,
  exportKeyJwk,
  importKeyJwk,
  type SyncCredentials,
  type EncryptedBlob,
} from "./crypto";
import { formatSyncCode, generateSyncSeed, parseSyncCode } from "./syncCode";
import {
  emptyTombstones,
  mergeStates,
  type SyncDeviceEntry,
  type SyncState,
  type SyncTombstones,
} from "./merge";
import { sanitizeSyncState } from "./validateState";

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
/** Which key-derivation schema the stored credentials came from. */
export const META_SYNC_SCHEMA = "syncSchema";
/** The v3 sync code, kept so the user can show it again and invite devices. */
export const META_SYNC_CODE = "syncCode";
/** Write capability sent on pushes; derived alongside the key (SEC-02). */
export const META_SYNC_WRITE_TOKEN = "syncWriteToken";
/** This device's stable identity in the household registry (ADR 0010). */
export const META_SYNC_DEVICE_ID = "syncDeviceId";
export const META_SYNC_DEVICE_LABEL = "syncDeviceLabel";
/** The merged registry, persisted like tombstones between cycles. */
export const META_SYNC_DEVICES = "syncDevices";

const MAX_PUSH_ATTEMPTS = 3;

/** Joining failed because nothing is stored under the derived identity. */
export class SyncGroupNotFoundError extends Error {
  constructor() {
    super("no sync group found");
    this.name = "SyncGroupNotFoundError";
  }
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  /**
   * True when sync is on but the credentials are passphrase-derived (v1/v2).
   * Those identities are guessable in a way the v3 random seed is not, so
   * the UI offers moving the household to a v3 group.
   */
  needsUpgrade: boolean;
  /** The v3 sync code, for showing again and inviting devices. Null pre-v3. */
  syncCode: string | null;
}

export async function getSyncStatus(storage: StorageAdapter): Promise<SyncStatus> {
  const [groupId, lastSyncAt, lastError, schema, code] = await Promise.all([
    storage.getMeta(META_SYNC_GROUP_ID),
    storage.getMeta(META_SYNC_LAST_AT),
    storage.getMeta(META_SYNC_LAST_ERROR),
    storage.getMeta(META_SYNC_SCHEMA),
    storage.getMeta(META_SYNC_CODE),
  ]);
  const enabled = !!groupId;
  return {
    enabled,
    lastSyncAt: lastSyncAt ?? null,
    lastError: lastError ?? null,
    // Credentials stored before the schema field existed are v1 by definition.
    needsUpgrade: enabled && Number(schema ?? 1) < CURRENT_SYNC_SCHEMA,
    syncCode: code || null,
  };
}

/**
 * Start a brand-new v3 sync group from this device's data.
 *
 * Returns the sync code — the group's whole identity. The caller must put it
 * in front of the user and insist it is saved: it is both the invite for the
 * next device and the only recovery if every device is lost.
 */
export async function createSyncGroup(storage: StorageAdapter): Promise<string> {
  const seed = generateSyncSeed();
  const code = formatSyncCode(seed);
  await persistCredentials(storage, await deriveCodeCredentials(seed), code);
  await syncNow(storage);
  return code;
}

/**
 * Join the group a sync code denotes. Throws SyncCodeFormatError on a
 * malformed or mistyped code and SyncGroupNotFoundError when the code is
 * well-formed but nothing is stored under it. Requiring the group to exist
 * closes the residual typo hole: a wrong code that happens to pass its
 * checksum lands on 2^128-sized nothing, not in a silently-created group
 * that splits the household.
 */
export async function joinSyncGroup(storage: StorageAdapter, code: string): Promise<void> {
  const seed = parseSyncCode(code);
  const credentials = await deriveCodeCredentials(seed);
  const existing = await fetchRemote(credentials.groupId);
  if (!existing.payload) throw new SyncGroupNotFoundError();
  await persistCredentials(storage, credentials, formatSyncCode(seed));
  await syncNow(storage);
}

/**
 * Move this device from its passphrase-derived (v1/v2) group to a fresh v3
 * group, carrying all data. The old server record is left in place — other
 * devices may still be reading it, and they follow by joining with the new
 * code, not by upgrading themselves.
 *
 * The pre-switch sync is mandatory: it pulls whatever the old group holds
 * that this device has not seen. Skipping it on failure would strand
 * remote-only history under an identity this device is about to stop using.
 */
export async function upgradeSyncToV3(storage: StorageAdapter): Promise<string> {
  const groupId = await storage.getMeta(META_SYNC_GROUP_ID);
  if (!groupId) throw new Error("sync is not enabled");
  if (!(await syncNow(storage))) {
    const reason = await storage.getMeta(META_SYNC_LAST_ERROR);
    throw new Error(reason || "could not reach the old sync group");
  }
  const seed = generateSyncSeed();
  const code = formatSyncCode(seed);
  await persistCredentials(storage, await deriveCodeCredentials(seed), code);
  // Push into the new group. A failure here loses nothing — everything is
  // local after the pull above — and the next sync retries; the status line
  // carries the error meanwhile.
  await syncNow(storage);
  return code;
}

/**
 * Join an existing passphrase-derived group (v2, migrating v1 on the way).
 *
 * This is the rejoin/restore path for households created before v3 — it
 * never CREATES a group any more. A passphrase that matches nothing throws
 * SyncGroupNotFoundError instead of silently minting a fresh deterministic
 * group, because deterministic identities are exactly what SEC-01 retired:
 * two households choosing the same phrase used to end up sharing a group
 * and a key. New groups only come from createSyncGroup's random seed.
 *
 * Entering the passphrase is the only moment a v1 group can be found: if
 * nothing is stored under the v2 id but a v1 group exists, its contents are
 * re-encrypted under the v2 key before we switch over.
 */
export async function enableSync(storage: StorageAdapter, passphrase: string): Promise<void> {
  const credentials = await deriveCredentials(passphrase);
  await migrateLegacyGroup(credentials, passphrase);
  const existing = await fetchRemote(credentials.groupId);
  if (!existing.payload) throw new SyncGroupNotFoundError();
  // Deliberately NOT the current schema: these credentials are still
  // passphrase-derived, so the device keeps advertising the v3 upgrade.
  await persistCredentials(storage, credentials, "", LEGACY_SYNC_SCHEMA);
  await syncNow(storage);
}

async function persistCredentials(
  storage: StorageAdapter,
  credentials: SyncCredentials,
  code: string,
  schema: number = CURRENT_SYNC_SCHEMA,
): Promise<void> {
  await storage.setMeta(META_SYNC_GROUP_ID, credentials.groupId);
  await storage.setMeta(META_SYNC_KEY_JWK, await exportKeyJwk(credentials.key));
  await storage.setMeta(META_SYNC_SCHEMA, String(schema));
  await storage.setMeta(META_SYNC_CODE, code);
  await storage.setMeta(META_SYNC_WRITE_TOKEN, credentials.writeToken ?? "");
}

/**
 * Copy a v1 group's state to its v2 id, re-encrypted under the v2 key.
 *
 * Errors propagate deliberately. Swallowing them would let a transient
 * network failure look like "no old group here": sync would switch to an
 * empty v2 group, push the local state over it, and the household's real
 * history would sit unreachable under the v1 id with nothing reported. A
 * failed upgrade that says so is recoverable — the user retries. Missing
 * data that reports success is not.
 *
 * A genuine 404 on the v1 id is not an error and returns quietly. The v1
 * record is left in place either way: other devices may still be reading it,
 * and deleting the old copy is not this function's call to make.
 */
async function migrateLegacyGroup(credentials: SyncCredentials, passphrase: string): Promise<void> {
  const existing = await fetchRemote(credentials.groupId);
  if (existing.payload) return; // Someone already migrated this household.

  const legacy = await deriveLegacyCredentials(passphrase);
  const old = await fetchRemote(legacy.groupId);
  if (!old.payload) return; // Nothing to carry over.

  const state = await decryptJson<SyncState>(legacy.key, old.payload);
  const reencrypted = await encryptJson(credentials.key, state);
  // expectedRev 0: the group must still be empty. A 409 means another device
  // migrated first and its copy stands, which is a fine outcome. The v2
  // token binds the fresh record; every v2 device derives the same one from
  // the passphrase, so nobody in the household is locked out.
  await pushRemote(credentials.groupId, reencrypted, 0, credentials.writeToken);
}

/**
 * The lost-device ritual as one guided operation (ADR 0010 outcome).
 *
 * A lost phone holds the sync code, and a code cannot be unshared — but it
 * can be made worthless: pull the latest state, move the household to a
 * FRESH group under a new code, and delete the old record. The lost device
 * then knows a code that unlocks nothing, and the only data it retains is
 * what was already on it — which no protocol, v4 included, could recall.
 *
 * Order matters: the new group must exist and hold everything BEFORE the
 * old record is deleted, so a failure at any step leaves a working group.
 * Deleting the old copy is best-effort hygiene — `oldCopyDeleted: false`
 * means the caller should say the old record lingers (frozen: nothing new
 * is ever written to it) rather than pretend it is gone.
 *
 * v3 groups only: the deletion needs the bound capability, and a
 * passphrase-era group should upgrade first anyway.
 */
export async function rotateGroupAfterLoss(
  storage: StorageAdapter,
): Promise<{ code: string; oldCopyDeleted: boolean; newGroupSynced: boolean }> {
  const oldGroupId = await storage.getMeta(META_SYNC_GROUP_ID);
  if (!oldGroupId) throw new Error("sync is not enabled");
  const oldCode = await storage.getMeta(META_SYNC_CODE);
  if (!oldCode) {
    throw new Error("this group predates sync codes — upgrade sync security first");
  }
  const oldToken = await loadWriteToken(storage);

  // Pull what the household has that this device has not seen. Mandatory:
  // rotating without it strands remote-only history in the record we are
  // about to delete.
  if (!(await syncNow(storage))) {
    const reason = await storage.getMeta(META_SYNC_LAST_ERROR);
    throw new Error(reason || "could not reach the current sync group");
  }

  const seed = generateSyncSeed();
  const code = formatSyncCode(seed);
  await persistCredentials(storage, await deriveCodeCredentials(seed), code);
  // Push the household's data to the NEW group, and check it landed. The old
  // record must not be deleted until the new one exists: if this push failed
  // (server full, offline), the old copy is still the household's only
  // backup — deleting it here would destroy it and leave the new group empty,
  // in the very flow the user runs BECAUSE a device was lost.
  const newGroupSynced = await syncNow(storage);

  let oldCopyDeleted = false;
  if (newGroupSynced && oldToken) {
    try {
      const res = await fetch(`/api/sync/${oldGroupId}`, {
        method: "DELETE",
        headers: { "x-sync-write-token": oldToken },
      });
      oldCopyDeleted = res.ok || res.status === 404;
    } catch {
      // Network hiccup after the new copy is safely up: the old record is
      // frozen and holds nothing new. Report it as kept rather than delete.
    }
  }
  return { code, oldCopyDeleted, newGroupSynced };
}

/**
 * Remove the group's record from the server, then turn sync off locally.
 * Local data is untouched — this deletes the household's ENCRYPTED BACKUP,
 * not anyone's training.
 *
 * Only v3 groups can do this: deletion requires the bound write capability
 * (SEC-02), which passphrase-era groups never had. A 404 is success — the
 * copy is gone, which is what was asked. Note for callers' copy: any OTHER
 * device still syncing this group will upload a fresh record on its next
 * cycle (same seed, same capability), so turn sync off there first.
 */
export async function deleteServerCopyAndDisable(storage: StorageAdapter): Promise<void> {
  const groupId = await storage.getMeta(META_SYNC_GROUP_ID);
  if (groupId) {
    const token = await loadWriteToken(storage);
    if (!token) {
      throw new Error("this group predates delete capabilities — upgrade sync security first");
    }
    const res = await fetch(`/api/sync/${groupId}`, {
      method: "DELETE",
      headers: { "x-sync-write-token": token },
    });
    if (!res.ok && res.status !== 404) throw new Error(`sync server error ${res.status}`);
  }
  await disableSync(storage);
}

/** Forget credentials and status; local data is left untouched. */
export async function disableSync(storage: StorageAdapter): Promise<void> {
  await storage.setMeta(META_SYNC_GROUP_ID, "");
  await storage.setMeta(META_SYNC_KEY_JWK, "");
  await storage.setMeta(META_SYNC_LAST_AT, "");
  await storage.setMeta(META_SYNC_LAST_ERROR, "");
  await storage.setMeta(META_SYNC_SCHEMA, "");
  await storage.setMeta(META_SYNC_CODE, "");
  await storage.setMeta(META_SYNC_WRITE_TOKEN, "");
  // The registry belongs to the group; the device's own id and label stay,
  // so rejoining later keeps a stable identity.
  await storage.setMeta(META_SYNC_DEVICES, "");
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
    const writeToken = await loadWriteToken(storage);
    const device = await ensureDeviceIdentity(storage);

    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
      // 1. Pull.
      const remote = await fetchRemote(groupId);
      let remoteState: SyncState | null = null;
      if (remote.payload) {
        const decrypted = await decryptJson<unknown>(key, remote.payload);
        // Another device in this group runs a newer build. Merging would
        // apply fields this build does not understand and then push the
        // result back stamped with THIS version — silently downgrading the
        // whole group's data. Stop instead, and say why.
        //
        // Read the version off the RAW payload, before sanitizing: a future
        // shape may not survive the allow-list at all, and reporting it as
        // "malformed" would hide the real reason and invite a downgrade.
        const remoteVersion = (decrypted as { dataVersion?: unknown } | null)?.dataVersion;
        if (typeof remoteVersion === "number" && remoteVersion > CURRENT_DATA_VERSION) {
          throw new FutureDataVersionError(remoteVersion);
        }
        // Decrypting proves the payload came from someone holding the group
        // key. It proves nothing about its shape: the server stores whatever
        // was pushed, and an older or modified client can push anything that
        // encrypts. This used to be cast straight to SyncState and written
        // to IndexedDB.
        remoteState = sanitizeSyncState(decrypted);
        if (!remoteState) throw new Error("remote sync data is malformed");
      }

      // 2. Merge with the full local state.
      const local = await readLocalState(storage, device);
      const merged = remoteState ? mergeStates(local, remoteState) : local;

      // 3. Apply the merged state locally. The snapshot's session ids come
      // along: only sessions that were part of the merge input may be
      // deleted. Without that bound, a session finished WHILE this cycle ran
      // — the runner fires syncNow at the end of every session — is absent
      // from `merged` through nothing but timing, and gets destroyed.
      const snapshotSessionIds = new Set(local.sessions.map((s) => s.id));
      await applyLocally(storage, merged, snapshotSessionIds);
      await storage.setMeta(META_SYNC_TOMBSTONES, JSON.stringify(merged.tombstones));
      await storage.setMeta(META_SYNC_DEVICES, JSON.stringify(merged.devices ?? {}));

      // 4. Push, guarded by the revision we pulled.
      const payload = await encryptJson(key, merged);
      const pushed = await pushRemote(groupId, payload, remote.rev, writeToken);
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

/**
 * This device's stable identity, created on first use. The default label is
 * a coarse platform guess — it is DATA that syncs to the household (inside
 * the encryption), so it is plain text the user can edit, not a t() key.
 */
async function ensureDeviceIdentity(
  storage: StorageAdapter,
): Promise<{ id: string; label: string }> {
  let id = await storage.getMeta(META_SYNC_DEVICE_ID);
  if (!id) {
    id = crypto.randomUUID();
    await storage.setMeta(META_SYNC_DEVICE_ID, id);
  }
  let label = await storage.getMeta(META_SYNC_DEVICE_LABEL);
  if (!label) {
    label = defaultDeviceLabel();
    await storage.setMeta(META_SYNC_DEVICE_LABEL, label);
  }
  return { id, label };
}

function defaultDeviceLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Computer";
}

export interface SyncDeviceView extends SyncDeviceEntry {
  id: string;
  /** True for the device this code is running on. */
  self: boolean;
}

/** The household's device registry, freshest first, from the last merge. */
export async function listSyncDevices(storage: StorageAdapter): Promise<SyncDeviceView[]> {
  const [raw, ownId] = await Promise.all([
    storage.getMeta(META_SYNC_DEVICES),
    storage.getMeta(META_SYNC_DEVICE_ID),
  ]);
  let devices: Record<string, SyncDeviceEntry> = {};
  try {
    devices = raw ? (JSON.parse(raw) as Record<string, SyncDeviceEntry>) : {};
  } catch {
    devices = {};
  }
  return Object.entries(devices)
    .map(([id, entry]) => ({ id, ...entry, self: id === ownId }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/**
 * A device that has not completed a sync in this long is worth pointing
 * at: its owner thinks they are backed up, and they are not. This is the
 * warning half of the retention decision — nothing expires, a human is
 * told (ADR 0010's principle: deliberate action over timers).
 */
export const DEVICE_STALE_DAYS = 14;

export function isDeviceStale(lastSeenAt: string, now: Date = new Date()): boolean {
  const parsed = Date.parse(lastSeenAt);
  if (Number.isNaN(parsed)) return true;
  return now.getTime() - parsed >= DEVICE_STALE_DAYS * 86_400_000;
}

/** Rename this device; the next sync carries it to the household. */
export async function setDeviceLabel(storage: StorageAdapter, label: string): Promise<void> {
  const trimmed = label.trim().slice(0, 40);
  if (!trimmed) return;
  await storage.setMeta(META_SYNC_DEVICE_LABEL, trimmed);
}

/**
 * The write capability for this device's group, if it has one.
 *
 * Backfill: a device whose credentials were stored before tokens existed
 * has no token in meta, but a v3 device DOES hold the sync code — the whole
 * identity — so the token is re-derived from it once and persisted. A v2
 * device cannot backfill (the passphrase is never stored); it sends nothing,
 * which its unbound legacy record accepts, and gains a token when it joins
 * or upgrades.
 */
async function loadWriteToken(storage: StorageAdapter): Promise<string | undefined> {
  const stored = await storage.getMeta(META_SYNC_WRITE_TOKEN);
  if (stored) return stored;
  const code = await storage.getMeta(META_SYNC_CODE);
  if (!code) return undefined;
  const { writeToken } = await deriveCodeCredentials(parseSyncCode(code));
  if (writeToken) await storage.setMeta(META_SYNC_WRITE_TOKEN, writeToken);
  return writeToken;
}

async function readLocalState(
  storage: StorageAdapter,
  device?: { id: string; label: string },
): Promise<SyncState> {
  const profiles = await storage.listProfiles();
  const sessions = [];
  for (const p of profiles) sessions.push(...(await storage.listSessions(p.id)));

  // Stamp this device into the registry it is about to push: label as the
  // user set it, lastSeenAt = now. The merge keeps the freshest entry per
  // device, so every completed cycle refreshes ours.
  const devices = await loadDevices(storage);
  if (device) {
    devices[device.id] = { label: device.label, lastSeenAt: new Date().toISOString() };
  }
  // The envelope must describe what is INSIDE it, not what this build is.
  // Hard-coding CURRENT meant a device holding a future-stamped record — a
  // rolled-back PWA with newer IndexedDB still present, which is the exact
  // premise the putProfile guard assumes — pushed an envelope claiming this
  // version while carrying newer records. Receiving devices saw a version
  // they understood, the guard never fired, and the newer data was relabelled
  // downwards: the very corruption this change exists to stop, arriving
  // through the push path instead of the pull path.
  const highest = profiles.reduce(
    (max, p) => Math.max(max, storedDataVersion(p as unknown as Record<string, unknown>)),
    CURRENT_DATA_VERSION,
  );
  return {
    dataVersion: highest,
    profiles,
    sessions,
    tombstones: await loadTombstones(storage),
    devices,
  };
}

async function loadDevices(storage: StorageAdapter): Promise<Record<string, SyncDeviceEntry>> {
  const raw = await storage.getMeta(META_SYNC_DEVICES);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, SyncDeviceEntry>;
  } catch {
    return {};
  }
}

async function applyLocally(
  storage: StorageAdapter,
  merged: SyncState,
  /** Session ids that fed the merge. Anything else is newer than this cycle. */
  snapshotSessionIds: Set<string>,
): Promise<void> {
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
    const local = await storage.listSessions(profile.id);
    const known = new Set(local.map((s) => s.id));
    const survives = new Set(
      merged.sessions.filter((s) => s.profileId === profile.id).map((s) => s.id),
    );
    // Apply the merge in both directions. Adding only what was missing meant
    // a progression reset on another device never reached this one: the
    // merge dropped those sessions (they precede the reset watermark) but
    // they stayed in local storage, and in local statistics, for ever.
    for (const session of local) {
      // A session the merge dropped is deleted; a session the merge never saw
      // is left alone and will be included in the next cycle.
      if (snapshotSessionIds.has(session.id) && !survives.has(session.id)) {
        await storage.deleteSession(session.id);
      }
    }
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
  writeToken?: string,
): Promise<boolean> {
  const res = await fetch(`/api/sync/${groupId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      // In a header, never the URL: the group id already lands in access
      // logs as a locator; the capability must not follow it there.
      ...(writeToken ? { "x-sync-write-token": writeToken } : {}),
    },
    body: JSON.stringify({ ...payload, expectedRev }),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`sync server error ${res.status}`);
  return true;
}
