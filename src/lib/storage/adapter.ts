import type { Profile, SessionRecord } from "@/lib/domain/types";

/**
 * Storage abstraction. The app talks only to this interface, so a backend
 * sync layer can later be added as another adapter (or a wrapper around the
 * IndexedDB one) without touching gameplay or UI code.
 */
export interface StorageAdapter {
  listProfiles(): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | undefined>;
  putProfile(profile: Profile): Promise<void>;
  /** Deletes the profile and all of its sessions. */
  deleteProfile(id: string): Promise<void>;

  addSession(session: SessionRecord): Promise<void>;
  /**
   * Write a finished session and the profile it produced in ONE transaction.
   *
   * These two writes are a single fact: the session happened and the profile
   * earned its XP, skills and records. Written separately, a failure between
   * them leaves history without progression (or progression without history),
   * and no later read can tell which. Re-committing the same session id is
   * idempotent, so a retry after a partial failure is safe.
   */
  commitSession(session: SessionRecord, profile: Profile): Promise<void>;
  /** Sessions for a profile, newest first, optionally limited. */
  listSessions(profileId: string, limit?: number): Promise<SessionRecord[]>;
  deleteSessions(profileId: string): Promise<void>;
  /** Removes one session. Used when a sync merge decides it is gone. */
  deleteSession(sessionId: string): Promise<void>;

  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}
