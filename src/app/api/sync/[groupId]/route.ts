import { NextResponse, type NextRequest } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/security/rateLimit";
import { isValidGroupId } from "@/lib/sync/crypto";
import {
  MAX_BLOB_CHARS,
  QuotaExceededError,
  readRecord,
  RevConflictError,
  syncDataDir,
  writeRecord,
} from "@/lib/sync/serverStore";

/**
 * Sync endpoint (issue #2). Stores one opaque, end-to-end-encrypted blob per
 * sync group; the group id is derived client-side from the passphrase. The
 * server can neither read nor validate the training data — see
 * docs/adr/0007-sync-backend.md and SECURITY.md for the threat model.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ groupId: string }> };

// Real clients sync on app start and on explicit "Sync now" taps, so a
// handful of requests per minute per address is generous. Writes get the
// tighter budget: an unauthenticated PUT is what can create files, and at up
// to ~11 MB of JSON per request the write path is the disk-exhaustion vector.
const readLimiter = createRateLimiter({ capacity: 60, refillPerMinute: 60 });
const writeLimiter = createRateLimiter({ capacity: 20, refillPerMinute: 10 });

/**
 * Ceiling on the request body, enforced BEFORE the JSON is parsed.
 *
 * `request.json()` buffers the whole body first, so validating the blob
 * length afterwards is too late: the memory is already spent. Base64 blob at
 * its cap plus the JSON envelope needs ~8.1 MB; 12 MB leaves room without
 * inviting a 100 MB POST.
 */
const MAX_BODY_BYTES = 12_000_000;

/**
 * Read the body with a hard cap, aborting as soon as it is passed.
 *
 * Content-Length is a claim, not a fact, and a chunked request has none at
 * all — so the cap has to hold while the bytes arrive, not just before.
 */
async function readBodyCapped(request: NextRequest, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

function rateLimited(retryAfterSeconds: number | undefined): NextResponse {
  return NextResponse.json(
    { error: "rate limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } },
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  const verdict = readLimiter.check(clientKey(request.headers));
  if (!verdict.allowed) return rateLimited(verdict.retryAfterSeconds);
  const { groupId } = await params;
  if (!isValidGroupId(groupId)) {
    return NextResponse.json({ error: "invalid group id" }, { status: 400 });
  }
  const record = await readRecord(syncDataDir(), groupId);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const verdict = writeLimiter.check(clientKey(request.headers));
  if (!verdict.allowed) return rateLimited(verdict.retryAfterSeconds);
  const { groupId } = await params;
  if (!isValidGroupId(groupId)) {
    return NextResponse.json({ error: "invalid group id" }, { status: 400 });
  }

  const raw = await readBodyCapped(request, MAX_BODY_BYTES);
  if (raw === null) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let body: { blob?: unknown; iv?: unknown; expectedRev?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { blob, iv, expectedRev } = body;
  if (
    typeof blob !== "string" ||
    blob.length === 0 ||
    blob.length > MAX_BLOB_CHARS ||
    !/^[A-Za-z0-9+/=]+$/.test(blob) ||
    typeof iv !== "string" ||
    iv.length === 0 ||
    iv.length > 64 ||
    !/^[A-Za-z0-9+/=]+$/.test(iv) ||
    typeof expectedRev !== "number" ||
    !Number.isInteger(expectedRev) ||
    expectedRev < 0
  ) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    const record = await writeRecord(syncDataDir(), groupId, { blob, iv, expectedRev });
    return NextResponse.json({ rev: record.rev });
  } catch (err) {
    if (err instanceof RevConflictError) {
      return NextResponse.json(
        { error: "revision conflict", rev: err.currentRev },
        { status: 409 },
      );
    }
    if (err instanceof QuotaExceededError) {
      // 507: the request is well-formed, the store simply has no room.
      return NextResponse.json({ error: "sync storage full" }, { status: 507 });
    }
    return NextResponse.json({ error: "storage unavailable" }, { status: 500 });
  }
}
