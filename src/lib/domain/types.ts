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
  | "dual-n-back"
  | "auditory-digits"
  | "tone-pattern"
  | "rhythm-recall"
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
  /** Kid-friendly mode: larger UI and a gentler difficulty ramp. */
  kidMode: boolean;
  /**
   * Leave out exercises that cannot be played without sight (see
   * `ExerciseDefinition.requiresVision`). Planned sessions and the default
   * library view then only offer non-visual exercises.
   */
  excludeVisionRequired: boolean;
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
  /** Bumped on every user-driven change; drives last-write-wins sync. */
  updatedAt: string;
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
  /**
   * Optional profile PIN (salted SHA-256). A courtesy barrier for household
   * profiles — NOT a security boundary; see PRIVACY.md.
   */
  pin?: { salt: string; hash: string };
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
  /**
   * True when the exercise cannot honestly be played without sight — the
   * stimulus itself is visual (tiles, positions, a colour change) and there
   * is no equivalent non-visual pathway. Labelled in the UI and filterable
   * by the `excludeVisionRequired` preference; we state this plainly rather
   * than pretending a screen-reader can convey a flashed grid.
   */
  requiresVision: boolean;
  /** True when the exercise needs audible sound to be playable at all. */
  requiresAudio: boolean;
}

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  "number-span": {
    id: "number-span",
    name: "Number Span",
    tagline: "Hold digits in mind, forwards and backwards",
    modalities: ["working-memory"],
    secondsPerRound: 22,
    defaultRounds: 4,
    requiresVision: true,
    requiresAudio: false,
  },
  "sequence-memory": {
    id: "sequence-memory",
    name: "Sequence Memory",
    tagline: "Repeat the order the tiles light up",
    modalities: ["working-memory", "visual-memory"],
    secondsPerRound: 20,
    defaultRounds: 4,
    requiresVision: true,
    requiresAudio: false,
  },
  "visual-pattern": {
    id: "visual-pattern",
    name: "Pattern Recall",
    tagline: "Rebuild the pattern from a brief glimpse",
    modalities: ["visual-memory"],
    secondsPerRound: 16,
    defaultRounds: 5,
    requiresVision: true,
    requiresAudio: false,
  },
  "n-back": {
    id: "n-back",
    name: "N-Back",
    tagline: "Spot repeats from N steps ago",
    modalities: ["working-memory", "attention"],
    secondsPerRound: 55,
    defaultRounds: 1,
    requiresVision: true,
    requiresAudio: false,
  },
  "dual-n-back": {
    id: "dual-n-back",
    name: "Dual N-Back",
    tagline: "Track positions and sounds at the same time",
    modalities: ["working-memory", "attention", "auditory-memory"],
    secondsPerRound: 65,
    defaultRounds: 1,
    requiresVision: true,
    requiresAudio: true,
  },
  "auditory-digits": {
    id: "auditory-digits",
    name: "Sound Span",
    tagline: "Recall spoken digits you cannot see",
    modalities: ["auditory-memory", "working-memory"],
    secondsPerRound: 24,
    defaultRounds: 4,
    requiresVision: false,
    requiresAudio: true,
  },
  "tone-pattern": {
    id: "tone-pattern",
    name: "Tone Pattern",
    tagline: "Replay a melody by ear",
    modalities: ["auditory-memory", "working-memory"],
    secondsPerRound: 18,
    defaultRounds: 4,
    requiresVision: false,
    requiresAudio: true,
  },
  "rhythm-recall": {
    id: "rhythm-recall",
    name: "Rhythm Recall",
    tagline: "Tap back the rhythm you heard",
    modalities: ["auditory-memory", "attention"],
    secondsPerRound: 16,
    defaultRounds: 4,
    requiresVision: false,
    requiresAudio: true,
  },
  "reaction-time": {
    id: "reaction-time",
    name: "Reaction",
    tagline: "React the instant the signal turns",
    modalities: ["speed", "attention"],
    secondsPerRound: 8,
    defaultRounds: 5,
    requiresVision: true,
    requiresAudio: false,
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
