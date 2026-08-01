import { describe, expect, it } from "vitest";
import { parseCoachRequest, renderFactEnglish, type InsightFact } from "./protocol";
import { parseCoachLines, validateCoachLines } from "./guardrails";
import { buildMessages, sourceLines, SYSTEM_PROMPT } from "./prompt";
import { coachConfig } from "./server";
import { deriveInsights } from "@/lib/insights/engine";
import { createProfile } from "@/lib/storage/profileFactory";
import type { SessionRecord } from "@/lib/domain/types";

const STREAK: InsightFact = { kind: "streak-at-risk", days: 5 };

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
      { facts: [{ kind: "modality-imbalance", modality: "telepathy", suggestion: null }] },
      { facts: [{ kind: "best-time-of-day", part: "brunch", bestPct: 1, worstPct: 0 }] },
      { facts: Array(5).fill(STREAK), locale: "en" },
      "not an object",
      null,
    ];
    for (const body of bad) expect(parseCoachRequest(body)).toBeNull();
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
  it("renders every kind to a sentence containing only its own numbers", () => {
    const facts: InsightFact[] = [
      STREAK,
      { kind: "modality-imbalance", modality: "auditory-memory", suggestion: "tone-pattern" },
      { kind: "modality-imbalance", modality: "speed", suggestion: null },
      { kind: "late-session-drop" },
      { kind: "best-time-of-day", part: "morning", bestPct: 82, worstPct: 71 },
    ];
    const rendered = facts.map(renderFactEnglish);
    expect(rendered[0]).toContain("5-day");
    expect(rendered[1]).toContain("Tone Pattern");
    expect(rendered[3]).toMatch(/accuracy/i);
    expect(rendered[4]).toContain("82%");
    for (const line of rendered) expect(line.length).toBeGreaterThan(10);
  });
});

describe("prompt building", () => {
  it("puts the claim rules in the system prompt and only facts in the user turn", () => {
    const messages = buildMessages([STREAK], "en");
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    expect(messages[0].content).toMatch(/never make claims about health/i);
    expect(messages[1].content).toContain(renderFactEnglish(STREAK));
    expect(messages[1].content).toContain("English");
  });

  it("asks for the profile's language", () => {
    expect(buildMessages([STREAK], "sv")[1].content).toContain("Swedish");
  });
});

describe("output guardrails", () => {
  const sources = sourceLines([STREAK]);

  it("accepts a faithful rephrasing", () => {
    expect(
      validateCoachLines(sources, ["Just a short session today and your 5-day run keeps going."]),
    ).toEqual({ ok: true });
  });

  it("rejects invented numbers", () => {
    const verdict = validateCoachLines(sources, [
      "A short session keeps your 5-day streak alive — users improve 40% in 3 weeks.",
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/invented-number/);
  });

  it("rejects health, IQ and diagnostic claims in both languages", () => {
    const claims = [
      "This keeps your 5-day streak and boosts your IQ.",
      "Daily practice can help prevent dementia.",
      "Your cognitive health is improving.",
      "A short session treats your attention problems.",
      "Detta stärker din intelligens.",
      "Kan bidra till att förebygga demens.",
    ];
    for (const claim of claims) {
      expect(validateCoachLines(sources, [claim]).ok, claim).toBe(false);
    }
  });

  it("rejects the wrong number of lines, empty lines and runaway length", () => {
    expect(validateCoachLines(sources, []).reason).toBe("line-count-mismatch");
    expect(validateCoachLines(sources, ["a", "b"]).reason).toBe("line-count-mismatch");
    expect(validateCoachLines(sources, ["   "]).reason).toBe("empty-line");
    expect(validateCoachLines(sources, ["x".repeat(500)]).reason).toBe("too-long");
  });

  it("matches banned terms on word boundaries, not substrings", () => {
    // "treat" is banned; "retreat"/"treats" style false positives matter
    // because a rejection silently downgrades the feature.
    expect(validateCoachLines(sources, ["Your 5-day streak is a great achievement."]).ok).toBe(
      true,
    );
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
});
