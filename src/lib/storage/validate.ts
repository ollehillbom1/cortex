import {
  ALL_EXERCISE_IDS,
  type ExerciseId,
  type ExerciseResult,
  type Profile,
  type ProfilePreferences,
  type SessionRecord,
  type SkillState,
} from "@/lib/domain/types";
import { MAX_LEVEL, MIN_LEVEL } from "@/lib/adaptive/engine";

/**
 * Allow-listed projection of untrusted records.
 *
 * Two paths accept data this app did not write: a JSON import chosen by the
 * user, and a sync payload decrypted from the server. Both used to be
 * validated by spot-checking a few fields and then spreading the original
 * object through — so unknown keys, nested junk, out-of-range numbers and
 * wrong-typed preferences went straight into IndexedDB. SECURITY.md claimed
 * import was "strictly structurally validated and re-projected"; it was not.
 *
 * These functions REBUILD each record from named fields with checked types
 * and bounds. Anything not named here does not survive, which is the point:
 * an allow-list cannot be outgrown by an attacker's imagination the way a
 * deny-list can.
 *
 * They return null rather than throwing, so sync can reject a payload
 * quietly and import can turn it into a message.
 */

const MAX_STRING = 200;
const MAX_RECENT = 10;
const MAX_EXERCISES_PER_SESSION = 32;
const MAX_RECORD_KEYS = 200;
const MAX_ACHIEVEMENTS = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max = MAX_STRING): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return v.slice(0, max);
}

function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** ISO-ish timestamp, or null. Dates drive merge order, so shape matters. */
function isoDate(v: unknown): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : s;
}

function numberArray(v: unknown, max: number, lo: number, hi: number): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v.slice(0, max)) {
    const n = num(item, lo, hi);
    if (n !== null) out.push(n);
  }
  return out;
}

function isExerciseId(v: unknown): v is ExerciseId {
  return typeof v === "string" && (ALL_EXERCISE_IDS as readonly string[]).includes(v);
}

/**
 * Keys that must never become properties of a rebuilt record.
 *
 * `JSON.parse` makes `__proto__` an OWN property, so it reaches
 * `Object.entries` and — on a normal object — assigning it hits the prototype
 * setter instead of defining a key. Even on a null-prototype object it would
 * be stored literally, which is a field the allow-list never named.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function safeKey(key: string, max = 64): string | null {
  if (FORBIDDEN_KEYS.has(key)) return null;
  return str(key, max);
}

function sanitizePreferences(raw: unknown): ProfilePreferences {
  const p = isRecord(raw) ? raw : {};
  const locale = p.locale;
  return {
    audioEnabled: bool(p.audioEnabled, true),
    volume: num(p.volume, 0, 1) ?? 0.8,
    largeText: bool(p.largeText, false),
    reduceMotion: bool(p.reduceMotion, false),
    dailyGoalMinutes: Math.round(num(p.dailyGoalMinutes, 1, 120) ?? 10),
    locale: locale === "en" || locale === "sv" ? locale : "auto",
    kidMode: bool(p.kidMode, false),
    excludeVisionRequired: bool(p.excludeVisionRequired, false),
    // Never imported as on: enabling a network feature is a local decision.
    aiCoach: false,
  };
}

function sanitizeSkill(raw: unknown): SkillState | null {
  if (!isRecord(raw)) return null;
  const level = num(raw.level, MIN_LEVEL, MAX_LEVEL);
  if (level === null) return null;
  return {
    level,
    streak: Math.round(num(raw.streak, -1000, 1000) ?? 0),
    recent: numberArray(raw.recent, MAX_RECENT, 0, 1),
    recentInputMs: numberArray(raw.recentInputMs, MAX_RECENT, 0, 3_600_000),
    attempts: Math.round(num(raw.attempts, 0, 1_000_000) ?? 0),
    updatedAt: isoDate(raw.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function sanitizeProfile(raw: unknown): Profile | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id, 64);
  const name = str(raw.name, 64);
  const createdAt = isoDate(raw.createdAt);
  if (!id || !name || !createdAt) return null;

  const skills: Partial<Record<ExerciseId, SkillState>> = {};
  if (isRecord(raw.skills)) {
    for (const [key, value] of Object.entries(raw.skills)) {
      if (!isExerciseId(key)) continue;
      const skill = sanitizeSkill(value);
      if (skill) skills[key] = skill;
    }
  }

  // Object.create(null): a JSON payload can carry `__proto__` as an OWN
  // property, and assigning it on a normal object hits the prototype setter
  // instead of defining a key — so the rebuilt record carried a field the
  // allow-list never named.
  const records: Profile["records"] = Object.create(null);
  if (isRecord(raw.records)) {
    for (const [key, value] of Object.entries(raw.records).slice(0, MAX_RECORD_KEYS)) {
      if (!isRecord(value)) continue;
      const short = safeKey(key);
      const val = num(value.value, -1e9, 1e9);
      const achievedAt = isoDate(value.achievedAt);
      if (short && val !== null && achievedAt) records[short] = { value: val, achievedAt };
    }
  }

  const achievements: Profile["achievements"] = Object.create(null);
  if (isRecord(raw.achievements)) {
    for (const [key, value] of Object.entries(raw.achievements).slice(0, MAX_ACHIEVEMENTS)) {
      const short = safeKey(key);
      const at = isoDate(value);
      if (short && at) achievements[short] = at;
    }
  }

  const streakRaw = isRecord(raw.streak) ? raw.streak : {};
  const pin = isRecord(raw.pin) ? raw.pin : null;
  const salt = pin ? str(pin.salt, 128) : null;
  const hash = pin ? str(pin.hash, 128) : null;

  return {
    id,
    name,
    avatar: str(raw.avatar, 8) ?? "🧠",
    avatarHue: Math.round(num(raw.avatarHue, 0, 360) ?? 210),
    createdAt,
    updatedAt: isoDate(raw.updatedAt) ?? createdAt,
    preferences: sanitizePreferences(raw.preferences),
    xp: Math.round(num(raw.xp, 0, 1e9) ?? 0),
    streak: {
      current: Math.round(num(streakRaw.current, 0, 100_000) ?? 0),
      best: Math.round(num(streakRaw.best, 0, 100_000) ?? 0),
      lastActiveDay: str(streakRaw.lastActiveDay, 10),
      freezes: Math.round(num(streakRaw.freezes, 0, 10) ?? 0),
    },
    skills,
    records,
    achievements,
    onboarded: bool(raw.onboarded, true),
    ...(salt && hash ? { pin: { salt, hash } } : {}),
  };
}

function sanitizeExerciseResult(raw: unknown): ExerciseResult | null {
  if (!isRecord(raw) || !isExerciseId(raw.exerciseId)) return null;
  const details: Record<string, number> = Object.create(null);
  if (isRecord(raw.details)) {
    for (const [key, value] of Object.entries(raw.details).slice(0, 32)) {
      const short = safeKey(key);
      const n = num(value, -1e9, 1e9);
      if (short && n !== null) details[short] = n;
    }
  }
  const avg = num(raw.avgResponseMs, 0, 3_600_000);
  const best = num(raw.bestResponseMs, 0, 3_600_000);
  // Carried through the allow-list deliberately: dropping it would relabel
  // every imported or synced record as "unknown mapping", which is the one
  // thing the stamp exists to prevent.
  const measurementVersion = num(raw.measurementVersion, 0, 10_000);
  return {
    exerciseId: raw.exerciseId,
    rounds: Math.round(num(raw.rounds, 0, 1000) ?? 0),
    accuracy: num(raw.accuracy, 0, 1) ?? 0,
    levelBefore: num(raw.levelBefore, MIN_LEVEL, MAX_LEVEL) ?? MIN_LEVEL,
    levelAfter: num(raw.levelAfter, MIN_LEVEL, MAX_LEVEL) ?? MIN_LEVEL,
    xp: Math.round(num(raw.xp, 0, 1e6) ?? 0),
    ...(avg !== null ? { avgResponseMs: avg } : {}),
    ...(best !== null ? { bestResponseMs: best } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
    ...(measurementVersion !== null ? { measurementVersion: Math.round(measurementVersion) } : {}),
  };
}

export function sanitizeSession(raw: unknown): SessionRecord | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id, 64);
  const profileId = str(raw.profileId, 64);
  const startedAt = isoDate(raw.startedAt);
  const endedAt = isoDate(raw.endedAt);
  if (!id || !profileId || !startedAt || !endedAt) return null;

  const exercises: ExerciseResult[] = [];
  if (Array.isArray(raw.exercises)) {
    for (const item of raw.exercises.slice(0, MAX_EXERCISES_PER_SESSION)) {
      const result = sanitizeExerciseResult(item);
      if (result) exercises.push(result);
    }
  }

  const unlocked: string[] = [];
  if (Array.isArray(raw.unlocked)) {
    for (const item of raw.unlocked.slice(0, 64)) {
      const short = str(item, 64);
      if (short) unlocked.push(short);
    }
  }

  return {
    id,
    profileId,
    type: raw.type === "single" ? "single" : "recommended",
    startedAt,
    endedAt,
    durationMs: Math.round(num(raw.durationMs, 0, 86_400_000) ?? 0),
    exercises,
    xpEarned: Math.round(num(raw.xpEarned, 0, 1e6) ?? 0),
    unlocked,
  };
}
