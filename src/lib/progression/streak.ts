import type { StreakState } from "@/lib/domain/types";

/**
 * Humane daily streak model.
 *
 * - Training on consecutive local days grows the streak.
 * - Missing exactly one day consumes a streak freeze (if available) and the
 *   streak survives. Freezes are earned automatically: one for every 7
 *   consecutive days, stored up to a max of 2.
 * - Missing more days than freezes can cover resets the streak to 1 on the
 *   next training day — progress records and XP are never touched.
 */

export const MAX_FREEZES = 2;
export const FREEZE_EARN_INTERVAL = 7;

export function initialStreak(): StreakState {
  return { current: 0, best: 0, lastActiveDay: null, freezes: 0 };
}

/** Local-time day key, e.g. "2026-07-31". */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole local days between two day keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / 86_400_000);
}

export interface StreakUpdate {
  streak: StreakState;
  /** Whether a freeze was consumed by this update. */
  freezeUsed: boolean;
  /** Whether the streak was reset (previous progress lost). */
  reset: boolean;
}

/** Apply a completed training day. Pure: returns a new state. */
export function recordActiveDay(state: StreakState, today: string): StreakUpdate {
  if (state.lastActiveDay === today) {
    return { streak: state, freezeUsed: false, reset: false };
  }

  let current: number;
  let freezes = state.freezes;
  let freezeUsed = false;
  let reset = false;

  if (state.lastActiveDay === null) {
    current = 1;
  } else {
    const gap = daysBetween(state.lastActiveDay, today);
    if (gap <= 0) {
      // Clock moved backwards (e.g. timezone travel): keep the streak as-is.
      return { streak: state, freezeUsed: false, reset: false };
    }
    if (gap === 1) {
      current = state.current + 1;
    } else if (gap === 2 && freezes > 0) {
      freezes -= 1;
      freezeUsed = true;
      current = state.current + 1;
    } else {
      current = 1;
      reset = state.current > 1;
    }
  }

  // Earn a freeze on every FREEZE_EARN_INTERVAL-day milestone.
  if (current > 0 && current % FREEZE_EARN_INTERVAL === 0 && freezes < MAX_FREEZES) {
    freezes += 1;
  }

  return {
    streak: {
      current,
      best: Math.max(state.best, current),
      lastActiveDay: today,
      freezes,
    },
    freezeUsed,
    reset,
  };
}

/**
 * Streak as it should be displayed *before* training today: a streak whose
 * last active day is older than yesterday (beyond freeze coverage) shows 0.
 */
export function displayedStreak(state: StreakState, today: string): number {
  if (state.lastActiveDay === null) return 0;
  const gap = daysBetween(state.lastActiveDay, today);
  if (gap <= 1) return state.current;
  if (gap === 2 && state.freezes > 0) return state.current;
  return 0;
}

/** True when the streak survives only if today is trained (urgency hint). */
export function streakAtRisk(state: StreakState, today: string): boolean {
  if (state.lastActiveDay === null || state.current === 0) return false;
  const gap = daysBetween(state.lastActiveDay, today);
  return gap === 1 || (gap === 2 && state.freezes > 0);
}
