import type { StorageAdapter } from "@/lib/storage/adapter";
import type { Insight } from "@/lib/insights/engine";
import { COACH_LOCALES, type CoachLocale } from "./protocol";

/**
 * Browser side of the optional coach (issue #11, phase 2).
 *
 * Everything here is best-effort and failure-tolerant: the caller already
 * holds deterministic insight text, so an unconfigured, unreachable or
 * guardrail-rejected coach simply means the original wording stays.
 *
 * Results are cached for the local day. Without that, the endpoint would see
 * one dated request per home-screen visit, and streak length plus accuracy
 * percentages arriving several times a day is itself a household activity
 * pattern — precisely the kind of signal this project does not create.
 */

export const META_COACH_CACHE = "coachCache";

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

interface CacheEntry {
  day: string;
  key: string;
  line: string;
}

function cacheKey(insight: Insight, locale: CoachLocale): string {
  return `${locale}|${JSON.stringify(insight.fact)}`;
}

async function readCache(storage: StorageAdapter): Promise<CacheEntry | null> {
  const raw = await storage.getMeta(META_COACH_CACHE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof parsed.day === "string" && typeof parsed.key === "string" && parsed.line) {
      return parsed as CacheEntry;
    }
  } catch {
    /* fall through to a fresh fetch */
  }
  return null;
}

/**
 * Reword one insight, at most once per local day per distinct insight.
 * Returns the input unchanged whenever the coach is unavailable, rate
 * limited, or its output failed validation.
 */
export async function rephraseInsight(
  storage: StorageAdapter,
  insight: Insight,
  locale: CoachLocale,
  today: string,
): Promise<Insight> {
  const key = cacheKey(insight, locale);
  const cached = await readCache(storage);
  if (cached && cached.day === today && cached.key === key) {
    return { ...insight, text: cached.line };
  }

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts: [insight.fact], locale }),
    });
    if (!res.ok) return insight;
    const body = (await res.json()) as { lines?: unknown };
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length !== 1) return insight;
    const line = lines[0];
    if (typeof line !== "string" || !line.trim()) return insight;

    const entry: CacheEntry = { day: today, key, line: line.trim() };
    await storage.setMeta(META_COACH_CACHE, JSON.stringify(entry));
    return { ...insight, text: entry.line };
  } catch {
    return insight;
  }
}
