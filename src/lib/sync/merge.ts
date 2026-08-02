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

  // Profiles: last-write-wins for the fields a user edits (name, avatar,
  // preferences), but progression is merged field by field. Whole-profile
  // LWW silently discarded the loser's XP, skills, records and achievements
  // even though its sessions were kept, so history and summary disagreed
  // whenever two devices finished a session from the same base.
  //
  // Progression is merged against the sessions that SURVIVE the reset
  // watermark, not the raw lists. Counting a cleared session's XP would undo
  // the reset it belongs to — and re-add it for every device that joins
  // later, so the total climbs without bound while the history stays empty.
  const surviving = (sessions: SessionRecord[]) =>
    sessions.filter((s) => {
      const clearedAt = tombstones.clearedSessions[s.profileId];
      return !clearedAt || s.startedAt >= clearedAt;
    });
  const aLive = surviving(a.sessions);
  const bLive = surviving(b.sessions);

  const profileMap = new Map<string, Profile>();
  const seenIds = new Set([...a.profiles, ...b.profiles].map((p) => p.id));
  for (const id of seenIds) {
    const left = a.profiles.find((p) => p.id === id);
    const right = b.profiles.find((p) => p.id === id);
    if (!left || !right) {
      profileMap.set(id, (left ?? right)!);
      continue;
    }
    profileMap.set(id, mergeProfiles(left, right, aLive, bLive, tombstones));
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
/**
 * Merge two versions of the same profile.
 *
 * Identity and preferences follow last-write-wins on `updatedAt` — those are
 * user edits, and the newest intent should win. Progression is different:
 * both sides earned theirs, so nothing may be dropped.
 *
 * - **xp**: the winner's total plus the XP of sessions only the loser had.
 *   Recomputing from all sessions would zero a profile whose history was not
 *   imported alongside it; this counts exactly what the winner never saw.
 * - **skills**: per exercise, the state with the newer `updatedAt`. Two
 *   devices training different exercises both keep their progress.
 * - **records**: the better value per key, which is what a record means.
 * - **achievements**: union, keeping the earliest unlock timestamp.
 * - **streak**: the longer `best`, the further `lastActiveDay`, and the
 *   `current`/`freezes` belonging to that day — a streak is about days
 *   trained, and both devices agree on the days once sessions have merged.
 */
export function mergeProfiles(
  x: Profile,
  y: Profile,
  xSessions: SessionRecord[] = [],
  ySessions: SessionRecord[] = [],
  tombstones: SyncTombstones = emptyTombstones(),
): Profile {
  const winner = pickNewer(x, y);
  const loser = winner === x ? y : x;
  const winnerSessions = winner === x ? xSessions : ySessions;
  const loserSessions = winner === x ? ySessions : xSessions;

  const winnerSessionIds = new Set(
    winnerSessions.filter((s) => s.profileId === winner.id).map((s) => s.id),
  );
  const unaccountedXp = loserSessions
    .filter((s) => s.profileId === winner.id && !winnerSessionIds.has(s.id))
    .reduce((sum, s) => sum + (s.xpEarned ?? 0), 0);

  // A reset that postdates the loser's last edit means the loser is carrying
  // exactly the progression the user asked to clear. Merging its records and
  // achievements back in would resurrect them one device at a time.
  const clearedAt = tombstones.clearedSessions[winner.id];
  const loserWasCleared = Boolean(clearedAt && (loser.updatedAt ?? "") < clearedAt);

  const skills: Profile["skills"] = { ...winner.skills };
  for (const [id, loserSkill] of Object.entries(loser.skills)) {
    const mine = skills[id as keyof Profile["skills"]];
    if (!loserSkill) continue;
    if (!mine || (loserSkill.updatedAt ?? "") > (mine.updatedAt ?? "")) {
      skills[id as keyof Profile["skills"]] = loserSkill;
    }
    // attempts only ever grows, so a clock behind the other device must not
    // make it shrink — that would re-trigger the x1.8 calibration ramp.
    const chosen = skills[id as keyof Profile["skills"]];
    if (chosen && mine) {
      skills[id as keyof Profile["skills"]] = {
        ...chosen,
        attempts: Math.max(chosen.attempts, mine.attempts),
      };
    }
  }

  const records: Profile["records"] = { ...winner.records };
  if (!loserWasCleared) {
    for (const [key, theirs] of Object.entries(loser.records)) {
      const mine = records[key];
      if (!mine || betterRecord(key, theirs.value, mine.value)) records[key] = theirs;
    }
  }

  const achievements: Profile["achievements"] = { ...winner.achievements };
  if (!loserWasCleared) {
    for (const [id, at] of Object.entries(loser.achievements)) {
      const mine = achievements[id];
      if (!mine || at < mine) achievements[id] = at;
    }
  }

  const aheadOnDays =
    (loser.streak.lastActiveDay ?? "") > (winner.streak.lastActiveDay ?? "")
      ? loser.streak
      : winner.streak;

  return {
    ...winner,
    xp: winner.xp + unaccountedXp,
    skills,
    records,
    achievements,
    streak: {
      ...aheadOnDays,
      best: Math.max(x.streak.best, y.streak.best),
    },
  };
}

/** Lower is better for millisecond keys; higher for everything else. */
function betterRecord(key: string, candidate: number, current: number): boolean {
  return key.endsWith("Ms") ? candidate < current : candidate > current;
}

function pickNewer(x: Profile, y: Profile): Profile {
  const xu = x.updatedAt ?? "";
  const yu = y.updatedAt ?? "";
  if (xu !== yu) return xu > yu ? x : y;
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}
