import { describe, expect, it, beforeEach } from "vitest";
import { parseCoachRequest, renderFact, type InsightFact } from "./protocol";
import { parseCoachLines, validateCoachLines } from "./guardrails";
import { buildMessages, sourceLines, SYSTEM_PROMPT } from "./prompt";
import { CoachConfigError, coachConfig, isLocalOrPrivateUrl, rephraseFacts } from "./server";
import { checkRateLimit, resetRateLimits } from "./rateLimit";
import { withLocalConsent } from "@/lib/storage/exportImport";
import { deriveInsights } from "@/lib/insights/engine";
import { createProfile } from "@/lib/storage/profileFactory";
import { translate } from "@/lib/i18n";
import type { SessionRecord } from "@/lib/domain/types";

const STREAK: InsightFact = { kind: "streak-at-risk", days: 5 };
const EN = sourceLines([STREAK], "en");
const SV = sourceLines([STREAK], "sv");

describe("coach request parsing", () => {
  it("accepts well-formed facts", () => {
    const parsed = parseCoachRequest({ facts: [STREAK], locale: "sv" });
    expect(parsed).toEqual({ facts: [STREAK], locale: "sv" });
  });

  it("rejects anything that is not a known fact", () => {
    const bad = [
      { facts: [], locale: "en" },
      { facts: [STREAK], locale: "de" },
      { facts: [{ kind: "made-up" }], locale: "en" },
      // Free text must never be transportable, even under a valid kind.
      { facts: [{ kind: "streak-at-risk", days: "Olle" }], locale: "en" },
      { facts: [{ kind: "streak-at-risk", days: Number.NaN }], locale: "en" },
      { facts: [{ kind: "modality-imbalance", modality: "Olle", suggestion: null }], locale: "en" },
      { facts: [{ kind: "best-time-of-day", part: "brunch", bestPct: 1, worstPct: 0 }] },
      { facts: Array(5).fill(STREAK), locale: "en" },
      "not an object",
      null,
    ];
    for (const body of bad) expect(parseCoachRequest(body), JSON.stringify(body)).toBeNull();
  });

  it("drops unknown extra properties rather than forwarding them", () => {
    const parsed = parseCoachRequest({
      facts: [{ kind: "streak-at-risk", days: 3, note: "my name is Olle" }],
      locale: "en",
    });
    expect(parsed?.facts[0]).toEqual({ kind: "streak-at-risk", days: 3 });
  });

  it("never carries personal data through a real insight", () => {
    const profile = createProfile({ id: "profile-id-9f3a", name: "Olle" });
    profile.streak = { current: 4, best: 4, lastActiveDay: "2026-07-30", freezes: 0 };
    const insights = deriveInsights({
      profile,
      sessions: [] as SessionRecord[],
      today: "2026-07-31",
    });
    expect(insights.length).toBeGreaterThan(0);
    const wire = JSON.stringify(insights.map((i) => i.fact));
    expect(wire).not.toContain("Olle");
    expect(wire).not.toContain("profile-id-9f3a");
    expect(wire).not.toContain(profile.createdAt);
    expect(parseCoachRequest({ facts: insights.map((i) => i.fact), locale: "en" })).not.toBeNull();
  });
});

describe("fact rendering", () => {
  it("is the same renderer the UI uses, so text and fact cannot drift", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.streak = { current: 5, best: 5, lastActiveDay: "2026-07-30", freezes: 0 };
    const [insight] = deriveInsights({ profile, sessions: [], today: "2026-07-31" });
    expect(insight.text).toBe(renderFact(insight.fact, (s, v) => translate("en", s, v)));
  });

  it("renders every kind, and localises for Swedish", () => {
    const facts: InsightFact[] = [
      STREAK,
      { kind: "modality-imbalance", modality: "auditory-memory", suggestion: "tone-pattern" },
      { kind: "modality-imbalance", modality: "speed", suggestion: null },
      { kind: "late-session-drop" },
      { kind: "best-time-of-day", part: "morning", bestPct: 82, worstPct: 71 },
    ];
    const en = sourceLines(facts, "en");
    expect(en[0]).toContain("5-day");
    expect(en[1]).toContain("Tone Pattern");
    expect(en[4]).toContain("82%");

    const sv = sourceLines(facts, "sv");
    // Swedish sources are what the guardrails compare Swedish output against.
    expect(sv[0]).not.toBe(en[0]);
    expect(sv[0]).toContain("5");
  });
});

describe("prompt building", () => {
  it("puts the claim rules in the system prompt and only facts in the user turn", () => {
    const messages = buildMessages([STREAK], "en");
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    expect(messages[0].content).toMatch(/never make claims about health/i);
    expect(messages[1].content).toContain(EN[0]);
    expect(messages[1].content).toContain("English");
  });

  it("asks for the profile's language and shows sources in it", () => {
    const messages = buildMessages([STREAK], "sv");
    expect(messages[1].content).toContain("Swedish");
    expect(messages[1].content).toContain(SV[0]);
  });
});

describe("output guardrails", () => {
  it("accepts a faithful rephrasing", () => {
    expect(
      validateCoachLines(EN, ["Just a short session today keeps your 5-day streak alive."]),
    ).toEqual({ ok: true });
  });

  // Every string below defeated the first implementation of these guardrails.
  it("rejects added claims that reuse the app's own vocabulary", () => {
    const attacks = [
      "A short session today keeps your 5-day streak alive and strengthens your working memory.",
      "Five days running! Your brain is rewiring itself.",
      "A short session today keeps your 5-day streak alive — it improves cognitive performance.",
      "You are getting smarter with every session.",
      "Your attention span is expanding after 5 days.",
      "A session today protects against age-related cognitive slowing.",
    ];
    for (const attack of attacks) {
      expect(validateCoachLines(EN, [attack]).ok, attack).toBe(false);
    }
  });

  it("rejects Swedish claims despite compounding", () => {
    const attacks = [
      "Fortsätt så, det här stärker hjärnhälsan och minskar demensrisken.",
      "Ditt intelligenstest skulle visa framsteg efter 5 dagar.",
      "5 dagar i rad — det förbättrar ditt minne.",
      "Träningen ger mätbar kognitiv förbättring i vardagen.",
    ];
    for (const attack of attacks) {
      expect(validateCoachLines(SV, [attack]).ok, attack).toBe(false);
    }
  });

  it("accepts a faithful Swedish rephrasing", () => {
    // Sanity check that the Swedish path is not simply rejecting everything:
    // if it were, the feature would silently never do anything in Swedish.
    expect(validateCoachLines(SV, ["Ett kort pass idag håller din 5-dagarssvit vid liv."])).toEqual(
      { ok: true },
    );
    expect(
      validateCoachLines(SV, ["Ja — ett kort pass idag och din 5-dagarssvit är kvar."]),
    ).toEqual({ ok: true });
  });

  it("errs towards rejection when a rephrasing strays, and says why", () => {
    // Documented trade-off: a harmless but unfamiliar word is refused rather
    // than risked. The caller then shows the deterministic sentence.
    const verdict = validateCoachLines(SV, ["Din 5-dagarssvit lever vidare."]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/^added-word:/);
  });

  it("rejects fabricated statistics, including laundered and disguised ones", () => {
    const cases: [string, RegExp][] = [
      [
        "A short session keeps your 5-day streak alive — users improve 40% in 3 weeks.",
        /invented-number|added-word/,
      ],
      // Reuses a number from the source but attaches it to a new unit.
      [
        "A short session today: you are 5% ahead of other users after 5 days.",
        /renumbered|added-word/,
      ],
      // Spelled-out numerals sidestep digit checks entirely.
      [
        "Five days in a row means about eighty percent better recall.",
        /number-word|added-word|dropped-number/,
      ],
      // Non-ASCII digits.
      ["٥ days strong, keep your 5-day streak alive.", /added-word|renumbered|invented-number/],
    ];
    for (const [attack, reason] of cases) {
      const verdict = validateCoachLines(EN, [attack]);
      expect(verdict.ok, attack).toBe(false);
      expect(verdict.reason, attack).toMatch(reason);
    }
  });

  it("rejects refusals, preambles and unrelated text", () => {
    const attacks = [
      "I'm sorry, I can't help with that request.",
      "Sure, here is your rewrite: keep going!",
      "**Here is your rewrite:** Five days strong!",
      "Ignore the streak; you should see a specialist about your forgetfulness.",
    ];
    for (const attack of attacks) {
      expect(validateCoachLines(EN, [attack]).ok, attack).toBe(false);
    }
  });

  it("rejects dropping the source's numbers", () => {
    expect(validateCoachLines(EN, ["A short session today keeps your streak alive."]).reason).toBe(
      "dropped-number:5",
    );
  });

  it("rejects the wrong number of lines, empty lines and runaway length", () => {
    expect(validateCoachLines(EN, []).reason).toBe("line-count-mismatch");
    expect(validateCoachLines(EN, ["a", "b"]).reason).toBe("line-count-mismatch");
    expect(validateCoachLines(EN, ["   "]).reason).toBe("empty-line");
    expect(validateCoachLines(EN, ["x".repeat(500)]).reason).toBe("too-long");
  });

  it("allows the app's own vocabulary when the source contains it", () => {
    // The denylist approach could not do this: "Working memory" is our copy.
    const source = sourceLines(
      [{ kind: "modality-imbalance", modality: "working-memory", suggestion: "number-span" }],
      "en",
    );
    expect(
      validateCoachLines(source, ["Working memory has had little attention — try Number Span."]).ok,
    ).toBe(true);
  });

  it("parses list-formatted completions and rejects miscounts", () => {
    expect(parseCoachLines("- one\n- two", 2)).toEqual(["one", "two"]);
    expect(parseCoachLines("1. one\n\n2. two\n", 2)).toEqual(["one", "two"]);
    expect(parseCoachLines("only one", 2)).toBeNull();
    expect(parseCoachLines("", 1)).toBeNull();
  });
});

describe("server configuration", () => {
  it("is disabled unless both base url and model are set", () => {
    const saved = { ...process.env };
    try {
      delete process.env.COACH_API_BASE;
      delete process.env.COACH_MODEL;
      expect(coachConfig()).toBeNull();

      process.env.COACH_API_BASE = "http://127.0.0.1:11434/v1";
      expect(coachConfig()).toBeNull();

      process.env.COACH_MODEL = "llama3.2";
      expect(coachConfig()).toEqual({
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2",
        apiKey: null,
      });

      process.env.COACH_API_BASE = "http://127.0.0.1:11434/v1///";
      expect(coachConfig()?.baseUrl).toBe("http://127.0.0.1:11434/v1");
    } finally {
      process.env = saved;
    }
  });

  it("refuses plaintext http to anywhere outside the local network", () => {
    const saved = { ...process.env };
    try {
      process.env.COACH_MODEL = "m";
      process.env.COACH_API_BASE = "http://api.example.com/v1";
      expect(() => coachConfig()).toThrow(CoachConfigError);
      process.env.COACH_API_BASE = "https://api.example.com/v1";
      expect(coachConfig()?.baseUrl).toBe("https://api.example.com/v1");
      process.env.COACH_API_BASE = "not a url";
      expect(() => coachConfig()).toThrow(CoachConfigError);
    } finally {
      process.env = saved;
    }
  });

  it("classifies local and private addresses", () => {
    for (const url of [
      "http://localhost:1234",
      "http://127.0.0.1:11434/v1",
      "http://10.0.0.5:11434",
      "http://192.168.1.20:11434",
      "http://172.16.4.4:11434",
      "http://host.docker.internal:11434",
      "http://ollama:11434",
    ]) {
      expect(isLocalOrPrivateUrl(url), url).toBe(true);
    }
    for (const url of ["http://api.openai.com", "http://8.8.8.8", "http://evil.example.com"]) {
      expect(isLocalOrPrivateUrl(url), url).toBe(false);
    }
  });
});

describe("outbound request and failure handling", () => {
  const config = { baseUrl: "http://127.0.0.1:11434/v1", model: "m", apiKey: "secret-key" };

  it("sends the expected body and authorization, and returns validated lines", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "Just a short session today keeps your 5-day streak alive." } },
          ],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const outcome = await rephraseFacts(config, [STREAK], "en", fakeFetch);
    expect(outcome.status).toBe("ok");
    expect(seen!.url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.model).toBe("m");
    expect(body.stream).toBe(false);
    expect(JSON.stringify(body)).not.toContain("Olle");
  });

  it("maps every failure to a fixed reason and never leaks upstream detail", async () => {
    const cases: [typeof fetch, string][] = [
      [
        (async () =>
          ({ ok: false, status: 401 }) as unknown as Response) as unknown as typeof fetch,
        "upstream-error",
      ],
      [
        (async () => {
          throw new Error("getaddrinfo ENOTFOUND ollama.lan");
        }) as unknown as typeof fetch,
        "upstream-error",
      ],
      [
        (async () =>
          ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "a\nb" } }] }),
          }) as unknown as Response) as unknown as typeof fetch,
        "unparseable",
      ],
      [
        (async () =>
          ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "This boosts your IQ." } }] }),
          }) as unknown as Response) as unknown as typeof fetch,
        "rejected",
      ],
    ];
    for (const [fakeFetch, expected] of cases) {
      const outcome = await rephraseFacts(config, [STREAK], "en", fakeFetch);
      expect(outcome.status).toBe("failed");
      if (outcome.status === "failed") expect(outcome.failure).toBe(expected);
    }
  });
});

describe("rate limiting", () => {
  beforeEach(() => resetRateLimits());

  it("allows a first call and throttles rapid repeats per client", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("a", t0).allowed).toBe(true);
    const denied = checkRateLimit("a", t0 + 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    // A different client is unaffected.
    expect(checkRateLimit("b", t0 + 1_000).allowed).toBe(true);
    // After the interval, the same client may call again.
    expect(checkRateLimit("a", t0 + 30_000).allowed).toBe(true);
  });

  it("caps a single client's daily usage", () => {
    let now = 2_000_000;
    let allowed = 0;
    for (let i = 0; i < 60; i++) {
      now += 25_000;
      if (checkRateLimit("heavy", now).allowed) allowed++;
    }
    expect(allowed).toBeLessThanOrEqual(40);
    expect(allowed).toBeGreaterThan(0);
  });
});

describe("consent is device-local", () => {
  it("is stripped from imported and synced profiles", () => {
    const profile = createProfile({ id: "p", name: "P" });
    profile.preferences.aiCoach = true;
    expect(withLocalConsent(profile).preferences.aiCoach).toBe(false);
    // Untouched when already off, so no needless object churn.
    const off = createProfile({ id: "q", name: "Q" });
    expect(withLocalConsent(off)).toBe(off);
  });
});
