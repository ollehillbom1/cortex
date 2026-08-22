/**
 * In-process token-bucket rate limiter for the public API routes.
 *
 * The sync endpoint is deliberately unauthenticated — access is the
 * capability of knowing a group id — which means the only thing standing
 * between the open internet and "PUT an 8 MB blob under a fresh group id
 * until the disk is full" is a request budget. A reverse proxy in front may
 * add its own limit, but the app must not depend on being deployed behind
 * the right proxy.
 *
 * In-memory and per-process on purpose: Cortex runs as a single container
 * (see docker-compose.yml), the same assumption serverStore's write lock
 * already makes. Buckets refill continuously; a full bucket is indistinguishable
 * from an absent one, so idle entries are dropped to keep the map bounded.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until one token is available again; only set when denied. */
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(key: string): RateLimitVerdict;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Sweep the bucket map when it grows past this many keys. */
const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(options: {
  /** Burst size: requests allowed at once from a cold start. */
  capacity: number;
  /** Sustained rate: tokens restored per minute. */
  refillPerMinute: number;
  /** Injectable clock for tests. */
  now?: () => number;
}): RateLimiter {
  const { capacity, refillPerMinute } = options;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  const refill = (bucket: Bucket, at: number) => {
    const elapsedMinutes = Math.max(0, at - bucket.updatedAt) / 60_000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedMinutes * refillPerMinute);
    bucket.updatedAt = at;
  };

  const sweep = (at: number) => {
    if (buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, bucket] of buckets) {
      refill(bucket, at);
      if (bucket.tokens >= capacity) buckets.delete(key);
    }
  };

  return {
    check(key: string): RateLimitVerdict {
      const at = now();
      sweep(at);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, updatedAt: at };
        buckets.set(key, bucket);
      } else {
        refill(bucket, at);
      }
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }
      const secondsPerToken = 60 / refillPerMinute;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((1 - bucket.tokens) * secondsPerToken),
      };
    },
  };
}

/**
 * Client key for rate limiting: the rightmost X-Forwarded-For entry that is
 * not one of our own proxy hops.
 *
 * Rightmost, not leftmost: each proxy appends the address it accepted the
 * connection from, so entries grow more trustworthy to the right — the
 * leftmost ones are whatever the client claimed. But the literal rightmost
 * entry is only the client when exactly one proxy stands in front. Behind a
 * chain (CDN → tunnel → reverse proxy), the last entry is the chain's own
 * internal hop — the same address for every client on the internet, which
 * silently collapses all buckets into one shared budget.
 *
 * TRUSTED_PROXIES names those own-hop addresses (comma-separated, matched
 * exactly against the entry); the key is the first entry from the right that
 * is not in the list. Unset, the plain rightmost entry is used, which is
 * correct for a single proxy. Requests without the header (direct tailnet
 * access, e2e against localhost) share one bucket — those callers are
 * trusted anyway.
 */
export function clientKey(
  headers: Headers,
  trustedProxies: readonly string[] = envTrustedProxies(),
): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return "direct";
  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "direct";
  let index = parts.length - 1;
  while (index > 0 && trustedProxies.includes(parts[index].toLowerCase())) index -= 1;
  return parts[index];
}

let cachedTrustedProxies: string[] | undefined;

function envTrustedProxies(): string[] {
  cachedTrustedProxies ??= (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return cachedTrustedProxies;
}
