import { NextResponse, type NextRequest } from "next/server";
import { parseCoachRequest } from "@/lib/coach/protocol";
import { CoachConfigError, coachConfig, rephraseFacts } from "@/lib/coach/server";
import { checkRateLimit } from "@/lib/coach/rateLimit";

/**
 * Optional coach endpoint (issue #11, phase 2).
 *
 * Off unless the operator sets COACH_API_BASE and COACH_MODEL. The browser
 * only ever talks to this same-origin route — the strict CSP
 * (connect-src 'self') stays intact and the external endpoint is reached from
 * the server. See docs/adr/0008-optional-coach.md.
 *
 * Responses never carry upstream error text: a failure tells the client which
 * *kind* of failure it was, so it can fall back, and nothing about the
 * operator's network. Details are logged server-side only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(): { ok: true; config: ReturnType<typeof coachConfig> } | { ok: false } {
  try {
    return { ok: true, config: coachConfig() };
  } catch (err) {
    if (err instanceof CoachConfigError) {
      console.error(`[coach] misconfigured: ${err.message}`);
      return { ok: false };
    }
    throw err;
  }
}

/** Lets the UI hide the feature entirely when no endpoint is configured. */
export async function GET() {
  const result = configured();
  return NextResponse.json({ configured: result.ok && result.config !== null });
}

export async function POST(request: NextRequest) {
  const result = configured();
  if (!result.ok || !result.config) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const config = result.config;

  // Spend limiter: this route consumes the operator's compute or credit.
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-client";
  const limit = checkRateLimit(clientKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseCoachRequest(body);
  if (!parsed) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const outcome = await rephraseFacts(config, parsed.facts, parsed.locale);
  if (outcome.status === "ok") return NextResponse.json({ lines: outcome.lines });

  // The client already holds the deterministic wording; a failure here just
  // means it keeps using it.
  console.warn(`[coach] ${outcome.failure}: ${outcome.detail}`);
  return NextResponse.json(
    { error: outcome.failure },
    { status: outcome.failure === "rejected" || outcome.failure === "unparseable" ? 422 : 502 },
  );
}
