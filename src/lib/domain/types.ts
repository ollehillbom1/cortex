/**
 * Core domain types shared across the app.
 *
 * These types describe persisted data, so changes here usually require a
 * storage migration (see src/lib/storage/migrations.ts).
 */

export type ExerciseId =
  | "number-span"
  | "sequence-memory"
  | "visual-pattern"
  | "n-back"
  | "auditory-digits"
  | "reaction-time";

export type Modality =
  "working-memory" | "visual-memory" | "auditory-memory" | "attention" | "speed";

/** Adaptive skill estimate for one exercise. Levels are continuous floats >= 1. */
export interface SkillState {
  /** Continuous difficulty estimate. floor(level) is the effective level. */
  level: number;
  /** Consecutive rounds above / below target: positive = successes. */
  streak: number;
  /** Ring buffer of recent round accuracies (0..1), newest last, max 10. */
  recent: number[];
  /** Ring buffer of recent answer times in ms, newest last, max 10. */
  recentInputMs: number[];
  /** Total rounds ever played. */
  attempts: number;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

export interface StreakState {
  /** Consecutive active days, counting today if trained today. */
  current: number;
  best: number;
  /** Local day key (YYYY-MM-DD) of the most recent training day. */
  lastActiveDay: string | null;
  /** Streak freezes available (earned every 7 streak days, max 2). */
  freezes: number;
}

export interface ProfilePreferences {
  /** Sound on/off for the whole app. */
  audioEnabled: boolean;
  /** 0..1 output gain. */
  volume: number;
  /** Prefer larger base text. */
  largeText: boolean;
  /** Reduce non-essential animation regardless of the OS setting. */
  reduceMotion: boolean;
  /** Daily training goal, in minutes. */
  dailyGoalMinutes: number;
  /** UI language: follow the browser ("auto") or a fixed locale. */
  locale: "auto" | "en" | "sv";
}

export interface PersonalRecord {
  value: number;
  achievedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  /** Emoji used as the avatar. */
  avatar: string;
  /** Accent hue (0-360) for the avatar background. */
  avatarHue: number;
  createdAt: string;
  preferences: ProfilePreferences;
  xp: number;
  streak: StreakState;
  skills: Partial<Record<ExerciseId, SkillState>>;
  /** Keyed records such as "reaction-time:bestMs" or "number-span:maxSpan". */
  records: Record<string, PersonalRecord>;
  /** Achievement id -> ISO timestamp unlocked. */
  achievements: Record<string, string>;
  /** Whether onboarding has been completed. */
  onboarded: boolean;
}

/** Result of one exercise block (several rounds) inside a session. */
export interface ExerciseResult {
  exerciseId: ExerciseId;
  rounds: number;
  /** Mean round accuracy 0..1. */
  accuracy: number;
  levelBefore: number;
  levelAfter: number;
  xp: number;
  /** Mean reaction / response time in ms, where meaningful. */
  avgResponseMs?: number;
  bestResponseMs?: number;
  /** Exercise-specific extras (e.g. n-back false alarms, max span reached). */
  details?: Record<string, number>;
}

export interface SessionRecord {
  id: string;
  profileId: string;
  type: "recommended" | "single";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exercises: ExerciseResult[];
  xpEarned: number;
  /** Achievements unlocked by this session. */
  unlocked: string[];
}

export interface ExerciseDefinition {
  id: ExerciseId;
  name: string;
  tagline: string;
  modalities: Modality[];
  /** Rough duration of one round in seconds, used for session planning. */
  secondsPerRound: number;
  /** Default number of rounds in a session block. */
  defaultRounds: number;
}

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  "number-span": {
    id: "number-span",
    name: "Number Span",
    tagline: "Hold digits in mind, forwards and backwards",
    modalities: ["working-memory"],
    secondsPerRound: 22,
    defaultRounds: 4,
  },
  "sequence-memory": {
    id: "sequence-memory",
    name: "Sequence Memory",
    tagline: "Repeat the order the tiles light up",
    modalities: ["working-memory", "visual-memory"],
    secondsPerRound: 20,
    defaultRounds: 4,
  },
  "visual-pattern": {
    id: "visual-pattern",
    name: "Pattern Recall",
    tagline: "Rebuild the pattern from a brief glimpse",
    modalities: ["visual-memory"],
    secondsPerRound: 16,
    defaultRounds: 5,
  },
  "n-back": {
    id: "n-back",
    name: "N-Back",
    tagline: "Spot repeats from N steps ago",
    modalities: ["working-memory", "attention"],
    secondsPerRound: 55,
    defaultRounds: 1,
  },
  "auditory-digits": {
    id: "auditory-digits",
    name: "Sound Span",
    tagline: "Recall spoken digits you cannot see",
    modalities: ["auditory-memory", "working-memory"],
    secondsPerRound: 24,
    defaultRounds: 4,
  },
  "reaction-time": {
    id: "reaction-time",
    name: "Reaction",
    tagline: "React the instant the signal turns",
    modalities: ["speed", "attention"],
    secondsPerRound: 8,
    defaultRounds: 5,
  },
};

export const ALL_EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[];

export const MODALITY_LABELS: Record<Modality, string> = {
  "working-memory": "Working memory",
  "visual-memory": "Visual memory",
  "auditory-memory": "Auditory memory",
  attention: "Attention",
  speed: "Speed",
};
