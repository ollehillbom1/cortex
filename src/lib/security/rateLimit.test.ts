import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rateLimit";

/** Manual clock so refill maths is tested exactly, not approximately. */
function clock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("rate limiter", () => {
  it("allows a cold burst up to capacity, then denies", () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 60, now: c.now });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("refills at the sustained rate and recovers", () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: c.now });
    limiter.check("ip");
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);

    // 60/min = one token per second.
    c.advance(1_000);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("reports a usable Retry-After", () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 6, now: c.now });
    limiter.check("ip");
    const denied = limiter.check("ip");
    expect(denied.allowed).toBe(false);
    // 6/min = one token per 10 s.
    expect(denied.retryAfterSeconds).toBe(10);

    c.advance(10_000);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("keeps clients independent: one abuser cannot exhaust another's budget", () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 1, now: c.now });
    limiter.check("attacker");
    limiter.check("attacker");
    expect(limiter.check("attacker").allowed).toBe(false);
    expect(limiter.check("household").allowed).toBe(true);
  });

  it("never refills past capacity, even after a long idle", () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: c.now });
    c.advance(3_600_000);
    limiter.check("ip");
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);
  });
});

describe("clientKey", () => {
  it("uses the rightmost X-Forwarded-For entry — the proxy-appended one", () => {
    // A spoofing client sends its own XFF; the proxy appends the address it
    // actually saw. Trusting the leftmost entry would let every request pick
    // a fresh bucket and walk straight past the limit.
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9" });
    expect(clientKey(headers)).toBe("9.9.9.9");
  });

  it("falls back to a shared bucket without the header", () => {
    expect(clientKey(new Headers())).toBe("direct");
    expect(clientKey(new Headers({ "x-forwarded-for": "  " }))).toBe("direct");
  });

  it("walks past trusted proxy hops to the real client", () => {
    // The 2026-08 production chain: Cloudflare appends the client address,
    // then Apache appends the local tunnel hop. Keying on the literal
    // rightmost entry gave every client on the internet the same bucket.
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 127.0.0.1" });
    expect(clientKey(headers, ["127.0.0.1"])).toBe("9.9.9.9");
  });

  it("does not let a spoofed header reach past a trusted hop", () => {
    // The client-controlled entries sit to the LEFT of the entry the first
    // trusted proxy appended; the walk must stop at the first untrusted
    // entry rather than continue into the spoofed ones.
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9, 127.0.0.1" });
    expect(clientKey(headers, ["127.0.0.1"])).toBe("9.9.9.9");
  });

  it("skips several trusted hops in a row", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.2, 127.0.0.1" });
    expect(clientKey(headers, ["127.0.0.1", "10.0.0.2"])).toBe("9.9.9.9");
  });

  it("keys on the leftmost entry when every entry is a trusted hop", () => {
    // Traffic originating inside the chain itself (proxy health checks).
    // One bucket for all of it is fine; returning "direct" would merge it
    // with the tailnet callers, which have a different trust story.
    const headers = new Headers({ "x-forwarded-for": "127.0.0.1" });
    expect(clientKey(headers, ["127.0.0.1"])).toBe("127.0.0.1");
  });

  it("changes nothing when no trusted proxies are configured", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" });
    expect(clientKey(headers, [])).toBe("9.9.9.9");
  });
});
