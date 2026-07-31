import type { Profile, SessionRecord } from "@/lib/domain/types";

/**
 * Pure merge logic for sync (issue #2).
 *
 * - Sessions are append-only: merge = union by id (conflict-free).
 * - Profiles are last-write-wins on `updatedAt`, with a deterministic,
 *   symmetric tie-break so every device converges on the same winner.
 * - Tombstones make deletions and progression resets stick across devices:
 *   a deleted profile stays deleted (unless edited *after* the deletion),
 *   and sessions started before a reset watermark stay gone.
 */

export interface SyncTombstones {
  /** profileId -> ISO timestamp of deletion. */
  deletedProfiles: Record<string, string>;
  /** profileId -> ISO watermark; sessions started before it are dropped. */
  clearedSessions: Record<string, string>;
}

export interface SyncState {
  dataVersion: number;
  profiles: Profile[];
  sessions: SessionRecord[];
  tombstones: SyncTombstones;
}

export function emptyTombstones(): SyncTombstones {
  return { deletedProfiles: {}, clearedSessions: {} };
}

export function mergeStates(a: SyncState, b: SyncState): SyncState {
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);

  // Profiles: LWW per id, then apply deletions (edits after deletion revive).
  const profileMap = new Map<string, Profile>();
  for (const p of [...a.profiles, ...b.profiles]) {
    const existing = profileMap.get(p.id);
    profileMap.set(p.id, existing ? pickNewer(existing, p) : p);
  }
  const profiles = [...profileMap.values()].filter((p) => {
    const deletedAt = tombstones.deletedProfiles[p.id];
    return !deletedAt || (p.updatedAt ?? "") > deletedAt;
  });
  const liveIds = new Set(profiles.map((p) => p.id));

  // Sessions: union by id, then apply watermarks and drop orphans.
  const sessionMap = new Map<string, SessionRecord>();
  for (const s of [...a.sessions, ...b.sessions]) {
    if (!sessionMap.has(s.id)) sessionMap.set(s.id, s);
  }
  const sessions = [...sessionMap.values()]
    .filter((s) => liveIds.has(s.profileId))
    .filter((s) => {
      const clearedAt = tombstones.clearedSessions[s.profileId];
      return !clearedAt || s.startedAt >= clearedAt;
    })
    .sort((x, y) => x.startedAt.localeCompare(y.startedAt));

  return {
    dataVersion: Math.max(a.dataVersion, b.dataVersion),
    profiles: profiles.sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
    sessions,
    tombstones,
  };
}

function mergeTombstones(a: SyncTombstones, b: SyncTombstones): SyncTombstones {
  const merged = emptyTombstones();
  for (const source of [a, b]) {
    for (const [id, at] of Object.entries(source.deletedProfiles)) {
      if (!merged.deletedProfiles[id] || at > merged.deletedProfiles[id]) {
        merged.deletedProfiles[id] = at;
      }
    }
    for (const [id, at] of Object.entries(source.clearedSessions)) {
      if (!merged.clearedSessions[id] || at > merged.clearedSessions[id]) {
        merged.clearedSessions[id] = at;
      }
    }
  }
  return merged;
}

/**
 * Newer profile wins; equal timestamps fall back to comparing the serialised
 * form, which is arbitrary but symmetric — both devices pick the same one.
 */
function pickNewer(x: Profile, y: Profile): Profile {
  const xu = x.updatedAt ?? "";
  const yu = y.updatedAt ?? "";
  if (xu !== yu) return xu > yu ? x : y;
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}
