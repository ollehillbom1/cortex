/**
 * XP and level curve. Pure functions only.
 *
 * XP is awarded per round based on accuracy and the difficulty level played,
 * with small bonuses for perfect rounds. Profile levels follow a gentle
 * super-linear curve so early levels feel quick and later ones meaningful.
 */

export const XP_BASE_PER_ROUND = 10;

export interface RoundXpInput {
  accuracy: number;
  /** Effective difficulty level of the round. */
  level: number;
  perfect?: boolean;
  personalBest?: boolean;
}

export function xpForRound(input: RoundXpInput): number {
  const base = XP_BASE_PER_ROUND * clamp01(input.accuracy);
  const levelBonus = Math.max(0, input.level - 1) * 1.5;
  const perfectBonus = input.perfect ? 5 : 0;
  const recordBonus = input.personalBest ? 10 : 0;
  return Math.round(base + levelBonus + perfectBonus + recordBonus);
}

/** Total XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * Math.pow(level - 1, 1.5));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  inLevel: number;
  /** XP needed to go from the current level to the next. */
  needed: number;
  /** 0..1 progress towards the next level. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const needed = ceil - floor;
  const inLevel = xp - floor;
  return { level, inLevel, needed, fraction: needed === 0 ? 0 : inLevel / needed };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
