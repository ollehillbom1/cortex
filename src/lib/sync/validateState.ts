import { sanitizeProfile, sanitizeSession } from "@/lib/storage/validate";
import { emptyTombstones, type SyncState, type SyncTombstones } from "./merge";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeStamps(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, MAX_TOMBSTONES)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 64) continue;
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

export function sanitizeSyncState(raw: unknown): SyncState | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.sessions)) return null;
  if (raw.profiles.length > MAX_PROFILES || raw.sessions.length > MAX_SESSIONS) return null;

  const profiles = raw.profiles.map(sanitizeProfile).filter((p) => p !== null);
  const known = new Set(profiles.map((p) => p.id));
  // Sessions whose profile did not survive are orphans; the merge drops them
  // anyway, and keeping them would mean writing rows nothing can reach.
  const sessions = raw.sessions
    .map(sanitizeSession)
    .filter((s) => s !== null)
    .filter((s) => known.has(s.profileId));

  const dataVersion = typeof raw.dataVersion === "number" ? raw.dataVersion : 1;
  return { dataVersion, profiles, sessions, tombstones: sanitizeTombstones(raw.tombstones) };
}
