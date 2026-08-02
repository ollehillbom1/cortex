import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Profile, SessionRecord } from "@/lib/domain/types";
import type { StorageAdapter } from "@/lib/storage/adapter";
import {
  CURRENT_DATA_VERSION,
  FutureDataVersionError,
  isFutureDataVersion,
  migrateProfile,
  storedDataVersion,
  type StoredProfile,
} from "@/lib/storage/migrations";

/**
 * IndexedDB adapter (the only storage implementation in the MVP).
 * Uses `idb` (~1 kB) for promise-based access. All important progression
 * lives here — React state is only a view of this data.
 */

interface CortexDB extends DBSchema {
  profiles: {
    key: string;
    value: StoredProfile;
  };
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { "by-profile-started": [string, string] };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

const DB_NAME = "cortex";
const DB_SCHEMA_VERSION = 1;

function open(): Promise<IDBPDatabase<CortexDB>> {
  return openDB<CortexDB>(DB_NAME, DB_SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("profiles", { keyPath: "id" });
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-profile-started", ["profileId", "startedAt"]);
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });
}

export class IndexedDBAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBPDatabase<CortexDB>> | null = null;

  private db(): Promise<IDBPDatabase<CortexDB>> {
    if (!this.dbPromise) this.dbPromise = open();
    return this.dbPromise;
  }

  async listProfiles(): Promise<Profile[]> {
    const db = await this.db();
    const raw = await db.getAll("profiles");
    const migrated = raw.map((p) => migrateProfile(p as unknown as Record<string, unknown>));
    // Persist migrations so they run once, not on every read. Only ever write
    // a record we actually moved forward: a record from a newer build is
    // returned as-is and never rewritten (see isFutureDataVersion).
    for (let i = 0; i < raw.length; i++) {
      if (storedDataVersion(raw[i] as unknown as Record<string, unknown>) < CURRENT_DATA_VERSION) {
        await db.put("profiles", migrated[i]);
      }
    }
    return migrated.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getProfile(id: string): Promise<Profile | undefined> {
    const db = await this.db();
    const raw = await db.get("profiles", id);
    if (!raw) return undefined;
    const migrated = migrateProfile(raw as unknown as Record<string, unknown>);
    if (storedDataVersion(raw as unknown as Record<string, unknown>) < CURRENT_DATA_VERSION) {
      await db.put("profiles", migrated);
    }
    return migrated;
  }

  async putProfile(profile: Profile): Promise<void> {
    const db = await this.db();
    // Refuse to overwrite a record written by a newer build: this build does
    // not know what its fields mean, and saving would silently discard them.
    const existing = await db.get("profiles", profile.id);
    if (existing && isFutureDataVersion(existing as unknown as Record<string, unknown>)) {
      throw new FutureDataVersionError(
        storedDataVersion(existing as unknown as Record<string, unknown>),
      );
    }
    await db.put("profiles", { ...profile, dataVersion: CURRENT_DATA_VERSION });
  }

  async deleteProfile(id: string): Promise<void> {
    const db = await this.db();
    await this.deleteSessions(id);
    await db.delete("profiles", id);
  }

  async commitSession(session: SessionRecord, profile: Profile): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(["sessions", "profiles"], "readwrite");
    const profiles = tx.objectStore("profiles");
    // Same guard as putProfile: never overwrite a record from a newer build.
    const existing = await profiles.get(profile.id);
    if (existing && (existing.dataVersion ?? 1) > CURRENT_DATA_VERSION) {
      tx.abort();
      // The abort rejects tx.done; that is the intent, not an unhandled error.
      await tx.done.catch(() => {});
      throw new Error(
        `Profile was saved by a newer version of Cortex (data version ${existing.dataVersion}). Update the app to continue.`,
      );
    }
    try {
      // Both puts inside the try: `put` validates its argument and can throw
      // SYNCHRONOUSLY (a missing key path, a value that cannot be structured-
      // cloned). Without this, the first put had already been issued to the
      // transaction, the second threw before being issued, nothing aborted,
      // and the transaction committed the half it had — a session written
      // with no profile, which is exactly the split this method exists to
      // prevent.
      // Every write gets a rejection handler the instant it is issued, not
      // once the whole batch is built. Two reasons, and both bite:
      // `Promise.all` short-circuits on the first failure, and `put` can
      // throw SYNCHRONOUSLY — so building an array first leaves any earlier
      // write orphaned when a later one throws. The abort below then rejects
      // it with nobody listening, which is an unhandled rejection on every
      // rolled-back commit.
      const writes: Promise<unknown>[] = [];
      const issue = (write: Promise<unknown>) => {
        void write.catch(() => {});
        writes.push(write);
      };
      issue(tx.objectStore("sessions").put(session));
      issue(profiles.put({ ...profile, dataVersion: CURRENT_DATA_VERSION }));
      await Promise.all(writes);
      await tx.done;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* Already aborted or finished; the rollback is what matters. */
      }
      await tx.done.catch(() => {});
      throw err;
    }
  }

  async importRecords(profiles: Profile[], sessions: SessionRecord[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(["sessions", "profiles"], "readwrite");
    try {
      // Same discipline as commitSession: every write gets its rejection
      // handler the instant it is issued, because `put` can throw
      // synchronously and `Promise.all` short-circuits — either way an
      // already-issued write would otherwise reject into nobody's hands when
      // the abort below rolls the transaction back.
      const writes: Promise<unknown>[] = [];
      const issue = (write: Promise<unknown>) => {
        void write.catch(() => {});
        writes.push(write);
      };
      const profileStore = tx.objectStore("profiles");
      const sessionStore = tx.objectStore("sessions");
      for (const profile of profiles) {
        issue(profileStore.put({ ...profile, dataVersion: CURRENT_DATA_VERSION }));
      }
      for (const session of sessions) {
        issue(sessionStore.put(session));
      }
      await Promise.all(writes);
      await tx.done;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* Already aborted or finished; the rollback is what matters. */
      }
      await tx.done.catch(() => {});
      throw err;
    }
  }

  async addSession(session: SessionRecord): Promise<void> {
    const db = await this.db();
    await db.put("sessions", session);
  }

  async listSessions(profileId: string, limit?: number): Promise<SessionRecord[]> {
    const db = await this.db();
    const range = IDBKeyRange.bound([profileId, ""], [profileId, "￿"]);
    const index = db.transaction("sessions").store.index("by-profile-started");
    const out: SessionRecord[] = [];
    // Iterate newest-first via a reversed cursor so `limit` stays efficient.
    let cursor = await index.openCursor(range, "prev");
    while (cursor && (limit === undefined || out.length < limit)) {
      out.push(cursor.value);
      cursor = await cursor.continue();
    }
    return out;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.db();
    await db.delete("sessions", sessionId);
  }

  async deleteSessions(profileId: string): Promise<void> {
    const db = await this.db();
    const range = IDBKeyRange.bound([profileId, ""], [profileId, "￿"]);
    const tx = db.transaction("sessions", "readwrite");
    let cursor = await tx.store.index("by-profile-started").openCursor(range);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async getMeta(key: string): Promise<string | undefined> {
    const db = await this.db();
    return (await db.get("meta", key))?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const db = await this.db();
    await db.put("meta", { key, value });
  }
}

let singleton: StorageAdapter | null = null;

/** App-wide storage instance (client only). */
export function getStorage(): StorageAdapter {
  if (!singleton) singleton = new IndexedDBAdapter();
  return singleton;
}
