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
  /** Sessions for a profile, newest first, optionally limited. */
  listSessions(profileId: string, limit?: number): Promise<SessionRecord[]>;
  deleteSessions(profileId: string): Promise<void>;

  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}
