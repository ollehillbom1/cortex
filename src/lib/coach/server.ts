import { buildMessages, sourceLines } from "./prompt";
import { parseCoachLines, validateCoachLines } from "./guardrails";
import type { CoachLocale, InsightFact } from "./protocol";

/**
 * Server side of the optional coach (issue #11, phase 2).
 *
 * The operator points COACH_API_BASE at an OpenAI-compatible endpoint they
 * run themselves (Ollama, llama.cpp, LM Studio, vLLM …). Cortex ships no
 * default endpoint and no key: with nothing configured the feature does not
 * exist as far as the browser is concerned, which is what keeps the
 * "no third-party requests" promise true for everyone who does not opt in.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_COMPLETION_TOKENS = 400;

export interface CoachConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

/** Returns null when the operator has not configured a coach endpoint. */
export function coachConfig(): CoachConfig | null {
  const baseUrl = process.env.COACH_API_BASE?.trim();
  const model = process.env.COACH_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    apiKey: process.env.COACH_API_KEY?.trim() || null,
  };
}

export type CoachOutcome =
  | { status: "ok"; lines: string[] }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

/**
 * Ask the configured model to rephrase the facts, then hold the result to
 * the guardrails. Any doubt resolves to a non-"ok" outcome and the caller
 * falls back to the app's own wording.
 */
export async function rephraseFacts(
  config: CoachConfig,
  facts: InsightFact[],
  locale: CoachLocale,
): Promise<CoachOutcome> {
  const sources = sourceLines(facts);
  let raw: string;
  try {
    raw = await callModel(config, buildMessages(facts, locale));
  } catch (err) {
    return { status: "unavailable", reason: err instanceof Error ? err.message : "request failed" };
  }

  const lines = parseCoachLines(raw, sources.length);
  if (!lines) return { status: "rejected", reason: "unparseable" };

  const verdict = validateCoachLines(sources, lines);
  if (!verdict.ok) return { status: "rejected", reason: verdict.reason ?? "invalid" };

  return { status: "ok", lines };
}

async function callModel(
  config: CoachConfig,
  messages: { role: string; content: string }[],
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        // Low temperature: this is rephrasing, not creative writing.
        temperature: 0.3,
        max_tokens: MAX_COMPLETION_TOKENS,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`coach endpoint returned ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("empty completion");
    return content;
  } finally {
    clearTimeout(timer);
  }
}
