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

/**
 * Plaintext HTTP is only acceptable to a machine on your own network — the
 * derived statistics would otherwise cross the public internet in the clear.
 */
export function isLocalOrPrivateUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  // Unique-local and link-local IPv6.
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return true;
  // Container/compose conveniences that resolve inside the host's network.
  if (host === "host.docker.internal" || host === "cortex" || !host.includes(".")) return true;
  return false;
}

export class CoachConfigError extends Error {}

/**
 * Returns null when the operator has not configured a coach endpoint.
 * Throws CoachConfigError when they configured one unsafely, so the mistake
 * surfaces instead of silently sending statistics over plaintext internet.
 */
export function coachConfig(): CoachConfig | null {
  const baseUrl = process.env.COACH_API_BASE?.trim();
  const model = process.env.COACH_MODEL?.trim();
  if (!baseUrl || !model) return null;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new CoachConfigError("COACH_API_BASE is not a valid URL");
  }
  if (parsed.protocol !== "https:" && !isLocalOrPrivateUrl(baseUrl)) {
    throw new CoachConfigError(
      "COACH_API_BASE must use https:// unless it points at a local or private-network address",
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    apiKey: process.env.COACH_API_KEY?.trim() || null,
  };
}

/** Fixed reasons; upstream error text never reaches the client. */
export type CoachFailure = "timeout" | "upstream-error" | "unparseable" | "rejected";

export type CoachOutcome =
  { status: "ok"; lines: string[] } | { status: "failed"; failure: CoachFailure; detail: string };

/**
 * Ask the configured model to rephrase the facts, then hold the result to
 * the guardrails. Any doubt resolves to a failure and the caller falls back
 * to the app's own wording.
 *
 * `fetchImpl` is injectable so the outbound request can be asserted in tests
 * without a live model.
 */
export async function rephraseFacts(
  config: CoachConfig,
  facts: InsightFact[],
  locale: CoachLocale,
  fetchImpl: typeof fetch = fetch,
): Promise<CoachOutcome> {
  const sources = sourceLines(facts, locale);
  let raw: string;
  try {
    raw = await callModel(config, buildMessages(facts, locale), fetchImpl);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: "failed",
      failure: aborted ? "timeout" : "upstream-error",
      detail: err instanceof Error ? err.message : "request failed",
    };
  }

  const lines = parseCoachLines(raw, sources.length);
  if (!lines) return { status: "failed", failure: "unparseable", detail: "line count" };

  const verdict = validateCoachLines(sources, lines);
  if (!verdict.ok) {
    return { status: "failed", failure: "rejected", detail: verdict.reason ?? "invalid" };
  }
  return { status: "ok", lines };
}

async function callModel(
  config: CoachConfig,
  messages: { role: string; content: string }[],
  fetchImpl: typeof fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
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
