import { sanitizeProfile, sanitizeSession } from "@/lib/storage/validate";
import {
  emptyTombstones,
  type SyncDeviceEntry,
  type SyncState,
  type SyncTombstones,
} from "./merge";

/**
 * Allow-listed projection of a decrypted sync payload.
 *
 * Decryption proves the payload came from someone holding the group key. It
 * says nothing about its shape: the server stores whatever was pushed, and
 * an older or modified client can push anything that encrypts. This used to
 * be cast straight to SyncState and written to IndexedDB.
 */

const MAX_PROFILES = 50;
const MAX_SESSIONS = 50_000;
const MAX_TOMBSTONES = 500;
const MAX_DEVICES = 25;
const MAX_DEVICE_LABEL = 40;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeStamps(raw: unknown): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, MAX_TOMBSTONES)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 64) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) continue;
    out[key.slice(0, 64)] = value.slice(0, 40);
  }
  return out;
}

function sanitizeTombstones(raw: unknown): SyncTombstones {
  if (!isRecord(raw)) return emptyTombstones();
  return {
    deletedProfiles: sanitizeStamps(raw.deletedProfiles),
    clearedSessions: sanitizeStamps(raw.clearedSessions),
  };
}

function sanitizeDevices(raw: unknown): Record<string, SyncDeviceEntry> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, SyncDeviceEntry> = Object.create(null);
  for (const [key, value] of Object.entries(raw).slice(0, MAX_DEVICES)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 64) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (!isRecord(value)) continue;
    const label = typeof value.label === "string" ? value.label.slice(0, MAX_DEVICE_LABEL) : "";
    const lastSeenAt = value.lastSeenAt;
    if (typeof lastSeenAt !== "string" || Number.isNaN(Date.parse(lastSeenAt))) continue;
    out[key] = { label, lastSeenAt: lastSeenAt.slice(0, 40) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeSyncState(raw: unknown): SyncState | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.sessions)) return null;
  if (raw.profiles.length > MAX_PROFILES || raw.sessions.length > MAX_SESSIONS) return null;

  const profiles = raw.profiles.map(sanitizeProfile).filter((p) => p !== null);
  // Orphan filtering is deliberately NOT done here. mergeStates already drops
  // sessions with no live profile, using the union of local and remote
  // profiles — strictly more information than this side has. Filtering on the
  // remote payload alone deleted sessions whose profile merely failed
  // validation here while existing perfectly well locally, and the merged
  // result is pushed back, so one bad field on one profile erased that
  // profile's whole history for every device in the group.
  const sessions = raw.sessions.map(sanitizeSession).filter((s) => s !== null);

  const dataVersion = typeof raw.dataVersion === "number" ? raw.dataVersion : 1;
  return {
    dataVersion,
    profiles,
    sessions,
    tombstones: sanitizeTombstones(raw.tombstones),
    devices: sanitizeDevices(raw.devices),
  };
}
