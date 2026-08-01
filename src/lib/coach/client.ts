import type { Insight } from "@/lib/insights/engine";
import { COACH_LOCALES, MAX_FACTS, type CoachLocale } from "./protocol";

/**
 * Browser side of the optional coach (issue #11, phase 2).
 *
 * Everything here is best-effort and failure-tolerant: the caller already
 * holds deterministic insight text, so an unconfigured, unreachable or
 * guardrail-rejected coach simply means the original wording stays.
 */

export function coachLocaleOf(locale: string): CoachLocale {
  return COACH_LOCALES.includes(locale as CoachLocale) ? (locale as CoachLocale) : "en";
}

/** Whether the operator has configured an endpoint at all. */
export async function isCoachConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/coach", { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { configured?: unknown };
    return body.configured === true;
  } catch {
    return false;
  }
}

/**
 * Rephrase insights. Returns a new array with rewritten `text`, or the input
 * unchanged when the coach is unavailable or its output failed validation.
 */
export async function rephraseInsights(
  insights: Insight[],
  locale: CoachLocale,
): Promise<Insight[]> {
  const subset = insights.slice(0, MAX_FACTS);
  if (subset.length === 0) return insights;
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts: subset.map((i) => i.fact), locale }),
    });
    if (!res.ok) return insights;
    const body = (await res.json()) as { lines?: unknown };
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length !== subset.length) return insights;
    if (!lines.every((l) => typeof l === "string" && l.trim())) return insights;
    return insights.map((insight, i) =>
      i < subset.length ? { ...insight, text: (lines[i] as string).trim() } : insight,
    );
  } catch {
    return insights;
  }
}
