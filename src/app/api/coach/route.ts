import { NextResponse, type NextRequest } from "next/server";
import { parseCoachRequest } from "@/lib/coach/protocol";
import { coachConfig, rephraseFacts } from "@/lib/coach/server";

/**
 * Optional coach endpoint (issue #11, phase 2).
 *
 * Off unless the operator sets COACH_API_BASE and COACH_MODEL. The browser
 * only ever talks to this same-origin route — the strict CSP
 * (connect-src 'self') stays intact and the external endpoint is reached from
 * the server. See docs/adr/0008-optional-coach.md.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the UI hide the feature entirely when no endpoint is configured. */
export async function GET() {
  return NextResponse.json({ configured: coachConfig() !== null });
}

export async function POST(request: NextRequest) {
  const config = coachConfig();
  if (!config) return NextResponse.json({ error: "not configured" }, { status: 503 });

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
  // means it keeps using it. The reason is returned for the status display.
  return NextResponse.json(
    { error: outcome.status, reason: outcome.reason },
    { status: outcome.status === "rejected" ? 422 : 502 },
  );
}
