import type { Profile, SessionRecord } from "@/lib/domain/types";
import { levelForXp } from "@/lib/progression/xp";

/**
 * Achievements are earned by real training behaviour and checked with pure
 * predicates over the profile (after the session is applied) and the session
 * just completed plus history counts.
 */

export interface AchievementContext {
  profile: Profile;
  session: SessionRecord;
  /** Total completed sessions including this one. */
  totalSessions: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first-session",
    title: "First Steps",
    description: "Complete your first training session.",
    check: (ctx) => ctx.totalSessions >= 1,
  },
  {
    id: "sessions-10",
    title: "Regular",
    description: "Complete 10 training sessions.",
    check: (ctx) => ctx.totalSessions >= 10,
  },
  {
    id: "sessions-50",
    title: "Dedicated",
    description: "Complete 50 training sessions.",
    check: (ctx) => ctx.totalSessions >= 50,
  },
  {
    id: "streak-3",
    title: "Warming Up",
    description: "Train 3 days in a row.",
    check: (ctx) => ctx.profile.streak.current >= 3,
  },
  {
    id: "streak-7",
    title: "One Full Week",
    description: "Train 7 days in a row.",
    check: (ctx) => ctx.profile.streak.current >= 7,
  },
  {
    id: "streak-30",
    title: "Habit Formed",
    description: "Train 30 days in a row.",
    check: (ctx) => ctx.profile.streak.current >= 30,
  },
  {
    id: "level-5",
    title: "Gaining Momentum",
    description: "Reach profile level 5.",
    check: (ctx) => levelForXp(ctx.profile.xp) >= 5,
  },
  {
    id: "level-10",
    title: "Sharpened",
    description: "Reach profile level 10.",
    check: (ctx) => levelForXp(ctx.profile.xp) >= 10,
  },
  {
    id: "span-7",
    title: "Seven Digits",
    description: "Recall a span of 7 digits or more.",
    check: (ctx) => (ctx.profile.records["number-span:maxSpan"]?.value ?? 0) >= 7,
  },
  {
    id: "quick-250",
    title: "Lightning",
    description: "Average under 250 ms in a Reaction block.",
    check: (ctx) =>
      ctx.session.exercises.some(
        (e) => e.exerciseId === "reaction-time" && (e.avgResponseMs ?? Infinity) < 250,
      ),
  },
  {
    id: "nback-2",
    title: "Two Back",
    description: "Reach 2-back in the N-Back exercise.",
    check: (ctx) => (ctx.profile.skills["n-back"]?.level ?? 1) >= 4,
  },
  {
    id: "perfect-block",
    title: "Flawless",
    description: "Finish an exercise block at 100% accuracy.",
    check: (ctx) => ctx.session.exercises.some((e) => e.rounds >= 3 && e.accuracy >= 0.999),
  },
  {
    id: "well-rounded",
    title: "Well Rounded",
    description: "Train four different exercises in one session.",
    check: (ctx) => new Set(ctx.session.exercises.map((e) => e.exerciseId)).size >= 4,
  },
];

/** Ids of achievements newly earned by this session (not yet on the profile). */
export function evaluateAchievements(ctx: AchievementContext): string[] {
  return ACHIEVEMENTS.filter(
    (a) => ctx.profile.achievements[a.id] === undefined && a.check(ctx),
  ).map((a) => a.id);
}

export function achievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
