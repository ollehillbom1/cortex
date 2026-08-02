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

export const CURRENT_DATA_VERSION = 8;

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
  // v3 -> v4: introduced the locale preference ("auto" follows the browser).
  (p) => {
    const preferences = (p.preferences ?? {}) as Record<string, unknown>;
    return { ...p, preferences: { locale: "auto", ...preferences } };
  },
  // v4 -> v5: introduced kid mode (profile PIN is optional, needs no default).
  (p) => {
    const preferences = (p.preferences ?? {}) as Record<string, unknown>;
    return { ...p, preferences: { kidMode: false, ...preferences } };
  },
  // v5 -> v6: profiles carry updatedAt for last-write-wins sync.
  (p) => ({ updatedAt: p.createdAt ?? new Date(0).toISOString(), ...p }),
  // v6 -> v7: accessibility preference to leave out vision-only exercises.
  (p) => {
    const preferences = (p.preferences ?? {}) as Record<string, unknown>;
    return { ...p, preferences: { excludeVisionRequired: false, ...preferences } };
  },
  // v7 -> v8: opt-in AI phrasing of insights (off unless explicitly enabled).
  (p) => {
    const preferences = (p.preferences ?? {}) as Record<string, unknown>;
    return { ...p, preferences: { aiCoach: false, ...preferences } };
  },
];

/** The `dataVersion` a stored record carries; 1 when it predates the field. */
export function storedDataVersion(raw: Record<string, unknown>): number {
  return typeof raw.dataVersion === "number" ? raw.dataVersion : 1;
}

/**
 * True when a record was written by a newer build than this one.
 *
 * Such a record must be left alone: this build cannot know what its fields
 * mean, and writing it back would relabel newer data with an older version
 * number — after which the migration chain would replay on data that has
 * already been migrated past it. Household sync makes this reachable
 * whenever one device updates before another.
 */
export function isFutureDataVersion(raw: Record<string, unknown>): boolean {
  return storedDataVersion(raw) > CURRENT_DATA_VERSION;
}

/** Thrown when this build is asked to overwrite data from a newer build. */
export class FutureDataVersionError extends Error {
  constructor(readonly storedVersion: number) {
    super(
      `Data was saved by a newer version of Cortex (data version ${storedVersion}, this build understands ${CURRENT_DATA_VERSION}). Update the app to continue.`,
    );
    this.name = "FutureDataVersionError";
  }
}

/**
 * Bring a stored record up to CURRENT_DATA_VERSION. A record already at or
 * beyond the current version is returned untouched — in particular its
 * version stamp is preserved, never rewritten downwards.
 */
export function migrateProfile(raw: Record<string, unknown>): StoredProfile {
  let profile = raw;
  let version = storedDataVersion(raw);
  if (version >= CURRENT_DATA_VERSION) return { ...profile } as unknown as StoredProfile;
  while (version < CURRENT_DATA_VERSION) {
    const migration = MIGRATIONS[version - 1];
    if (!migration) break;
    profile = migration(profile);
    version += 1;
  }
  return { ...profile, dataVersion: version } as StoredProfile;
}
