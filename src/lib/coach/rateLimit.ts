/**
 * Rate limiting for the coach endpoint (issue #11, phase 2).
 *
 * The route spends the operator's compute — and, if they pointed it at a paid
 * provider, their money — on behalf of an unauthenticated caller. Cortex has
 * no accounts to authenticate against, so the proportionate control for a
 * household app is a hard ceiling on how often the route can be used at all,
 * plus the documented advice to keep the instance off the public internet.
 *
 * In-memory and per-instance: it resets on restart and does not coordinate
 * across replicas, which is the right complexity for a single-container
 * deployment. It is a spend limiter, not a security boundary.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may retry, when denied. */
  retryAfter: number;
}

const PER_CLIENT_INTERVAL_MS = 20_000;
const PER_CLIENT_PER_DAY = 40;
const GLOBAL_PER_DAY = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ClientState {
  lastAt: number;
  dayStart: number;
  dayCount: number;
}

const clients = new Map<string, ClientState>();
let globalDayStart = 0;
let globalDayCount = 0;

/** Exposed for tests; production callers never need this. */
export function resetRateLimits(): void {
  clients.clear();
  globalDayStart = 0;
  globalDayCount = 0;
}

export function checkRateLimit(clientKey: string, now: number = Date.now()): RateLimitDecision {
  if (now - globalDayStart >= DAY_MS) {
    globalDayStart = now;
    globalDayCount = 0;
  }
  if (globalDayCount >= GLOBAL_PER_DAY) {
    return { allowed: false, retryAfter: Math.ceil((globalDayStart + DAY_MS - now) / 1000) };
  }

  const state = clients.get(clientKey) ?? { lastAt: 0, dayStart: now, dayCount: 0 };
  if (now - state.dayStart >= DAY_MS) {
    state.dayStart = now;
    state.dayCount = 0;
  }
  if (now - state.lastAt < PER_CLIENT_INTERVAL_MS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((state.lastAt + PER_CLIENT_INTERVAL_MS - now) / 1000),
    };
  }
  if (state.dayCount >= PER_CLIENT_PER_DAY) {
    return { allowed: false, retryAfter: Math.ceil((state.dayStart + DAY_MS - now) / 1000) };
  }

  state.lastAt = now;
  state.dayCount += 1;
  clients.set(clientKey, state);
  globalDayCount += 1;
  // Bound memory on a long-running instance.
  if (clients.size > 1000) {
    for (const [key, value] of clients) {
      if (now - value.lastAt > DAY_MS) clients.delete(key);
    }
  }
  return { allowed: true, retryAfter: 0 };
}
