import type { Profile } from "@/lib/domain/types";
import { initialStreak } from "@/lib/progression/streak";

/**
 * Versioned data migrations for persisted profile records.
 *
 * Profiles are stored with a `dataVersion` field. On read, any profile below
 * CURRENT_DATA_VERSION is run through each migration in order. Session
 * records are treated as immutable history; if they ever need migrating, add
 * a parallel list here.
 *
 * IndexedDB *schema* changes (new stores/indexes) are handled separately in
 * db.ts via the idb `upgrade` callback.
 */

export const CURRENT_DATA_VERSION = 3;

export type StoredProfile = Profile & { dataVersion?: number };

type Migration = (profile: Record<string, unknown>) => Record<string, unknown>;

/** index i migrates version i+1 -> i+2. */
const MIGRATIONS: Migration[] = [
  // v1 -> v2: introduced streak freezes and the reduceMotion preference.
  (p) => {
    const streak = (p.streak ?? initialStreak()) as Record<string, unknown>;
    const preferences = (p.preferences ?? {}) as Record<string, unknown>;
    return {
      ...p,
      streak: { freezes: 0, ...streak },
      preferences: { reduceMotion: false, ...preferences },
    };
  },
  // v2 -> v3: skills gained a recentInputMs ring buffer (answer latency).
  (p) => {
    const skills = (p.skills ?? {}) as Record<string, Record<string, unknown>>;
    const upgraded: Record<string, Record<string, unknown>> = {};
    for (const [id, skill] of Object.entries(skills)) {
      upgraded[id] = { recentInputMs: [], ...skill };
    }
    return { ...p, skills: upgraded };
  },
];

export function migrateProfile(raw: Record<string, unknown>): StoredProfile {
  let profile = raw;
  let version = typeof raw.dataVersion === "number" ? raw.dataVersion : 1;
  while (version < CURRENT_DATA_VERSION) {
    const migration = MIGRATIONS[version - 1];
    if (!migration) break;
    profile = migration(profile);
    version += 1;
  }
  return { ...profile, dataVersion: CURRENT_DATA_VERSION } as StoredProfile;
}
