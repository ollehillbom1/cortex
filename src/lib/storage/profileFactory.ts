import type { Profile, ProfilePreferences } from "@/lib/domain/types";
import { initialStreak } from "@/lib/progression/streak";

export const DEFAULT_PREFERENCES: ProfilePreferences = {
  audioEnabled: true,
  volume: 0.8,
  largeText: false,
  reduceMotion: false,
  dailyGoalMinutes: 10,
  locale: "auto",
  kidMode: false,
  excludeVisionRequired: false,
  aiCoach: false,
};

export const AVATAR_CHOICES = ["🧠", "🦊", "🐙", "🦉", "🐬", "🪐", "🌊", "⚡️", "🌱", "🔮"];

export function createProfile(input: {
  id: string;
  name: string;
  avatar?: string;
  avatarHue?: number;
  now?: Date;
}): Profile {
  const created = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    name: input.name.trim(),
    avatar: input.avatar ?? AVATAR_CHOICES[0],
    avatarHue: input.avatarHue ?? 250,
    createdAt: created,
    updatedAt: created,
    preferences: { ...DEFAULT_PREFERENCES },
    xp: 0,
    streak: initialStreak(),
    skills: {},
    records: {},
    achievements: {},
    onboarded: false,
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
