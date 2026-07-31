import type { Profile, SessionRecord } from "@/lib/domain/types";
import type { StorageAdapter } from "@/lib/storage/adapter";
import { CURRENT_DATA_VERSION, migrateProfile } from "@/lib/storage/migrations";

/**
 * JSON export / import with structural validation.
 *
 * The export bundles every profile and session. Import is additive: records
 * whose ids already exist are skipped, nothing is overwritten. All string
 * fields are length-capped; unknown fields are dropped by re-projection.
 */

export const EXPORT_FORMAT = "cortex-export";

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  dataVersion: number;
  exportedAt: string;
  profiles: Profile[];
  sessions: SessionRecord[];
}

export async function exportAll(storage: StorageAdapter): Promise<ExportBundle> {
  const profiles = await storage.listProfiles();
  const sessions: SessionRecord[] = [];
  for (const p of profiles) {
    sessions.push(...(await storage.listSessions(p.id)));
  }
  return {
    format: EXPORT_FORMAT,
    dataVersion: CURRENT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    sessions,
  };
}

export interface ImportResult {
  profilesAdded: number;
  profilesSkipped: number;
  sessionsAdded: number;
  sessionsSkipped: number;
}

export class ImportError extends Error {}

const MAX_STRING = 200;
const MAX_PROFILES = 50;
const MAX_SESSIONS = 20_000;

export function parseExportBundle(text: string): ExportBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("The file is not valid JSON.");
  }
  if (!isRecord(raw)) throw new ImportError("The file has an unexpected structure.");
  if (raw.format !== EXPORT_FORMAT) {
    throw new ImportError("This is not a Cortex export file.");
  }
  const dataVersion = raw.dataVersion;
  if (typeof dataVersion !== "number" || dataVersion < 1 || dataVersion > CURRENT_DATA_VERSION) {
    throw new ImportError(
      "This export was created by a newer version of Cortex. Update the app first.",
    );
  }
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.sessions)) {
    throw new ImportError("The file has an unexpected structure.");
  }
  if (raw.profiles.length > MAX_PROFILES || raw.sessions.length > MAX_SESSIONS) {
    throw new ImportError("The file is unreasonably large.");
  }

  const profiles = raw.profiles.map((p, i) => validateProfile(p, i));
  const sessions = raw.sessions.map((s, i) => validateSession(s, i));
  return {
    format: EXPORT_FORMAT,
    dataVersion,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date(0).toISOString(),
    profiles,
    sessions,
  };
}

export async function importBundle(
  storage: StorageAdapter,
  bundle: ExportBundle,
): Promise<ImportResult> {
  const result: ImportResult = {
    profilesAdded: 0,
    profilesSkipped: 0,
    sessionsAdded: 0,
    sessionsSkipped: 0,
  };
  const knownProfiles = new Set((await storage.listProfiles()).map((p) => p.id));
  for (const profile of bundle.profiles) {
    if (knownProfiles.has(profile.id)) {
      result.profilesSkipped++;
      continue;
    }
    await storage.putProfile(
      migrateProfile({ ...profile, dataVersion: bundle.dataVersion }) as Profile,
    );
    knownProfiles.add(profile.id);
    result.profilesAdded++;
  }
  for (const session of bundle.sessions) {
    if (!knownProfiles.has(session.profileId)) {
      result.sessionsSkipped++;
      continue;
    }
    const existing = await storageHasSession(storage, session);
    if (existing) {
      result.sessionsSkipped++;
      continue;
    }
    await storage.addSession(session);
    result.sessionsAdded++;
  }
  return result;
}

async function storageHasSession(storage: StorageAdapter, session: SessionRecord) {
  const sessions = await storage.listSessions(session.profileId);
  return sessions.some((s) => s.id === session.id);
}

function validateProfile(raw: unknown, index: number): Profile {
  if (!isRecord(raw)) throw new ImportError(`Profile ${index} is malformed.`);
  requireString(raw, "id", index, "Profile");
  requireString(raw, "name", index, "Profile");
  requireString(raw, "createdAt", index, "Profile");
  if (!isRecord(raw.preferences) || !isRecord(raw.streak)) {
    throw new ImportError(`Profile ${index} is missing required sections.`);
  }
  if (typeof raw.xp !== "number" || !Number.isFinite(raw.xp) || raw.xp < 0) {
    throw new ImportError(`Profile ${index} has an invalid XP value.`);
  }
  const p = raw as unknown as Profile;
  return {
    ...p,
    id: capString(p.id),
    name: capString(p.name),
    avatar: capString(typeof p.avatar === "string" ? p.avatar : "🧠", 8),
    skills: isRecord(raw.skills) ? p.skills : {},
    records: isRecord(raw.records) ? p.records : {},
    achievements: isRecord(raw.achievements) ? p.achievements : {},
  };
}

function validateSession(raw: unknown, index: number): SessionRecord {
  if (!isRecord(raw)) throw new ImportError(`Session ${index} is malformed.`);
  requireString(raw, "id", index, "Session");
  requireString(raw, "profileId", index, "Session");
  requireString(raw, "startedAt", index, "Session");
  requireString(raw, "endedAt", index, "Session");
  if (!Array.isArray(raw.exercises)) {
    throw new ImportError(`Session ${index} has no exercise list.`);
  }
  if (typeof raw.xpEarned !== "number" || !Number.isFinite(raw.xpEarned)) {
    throw new ImportError(`Session ${index} has an invalid XP value.`);
  }
  const s = raw as unknown as SessionRecord;
  return {
    ...s,
    id: capString(s.id),
    profileId: capString(s.profileId),
    unlocked: Array.isArray(raw.unlocked) ? s.unlocked : [],
  };
}

function requireString(obj: Record<string, unknown>, key: string, index: number, kind: string) {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_STRING) {
    throw new ImportError(`${kind} ${index} has an invalid "${key}" field.`);
  }
}

function capString(v: string, max = MAX_STRING): string {
  return v.slice(0, max);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
