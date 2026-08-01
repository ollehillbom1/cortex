import { NextResponse, type NextRequest } from "next/server";
import { isValidGroupId } from "@/lib/sync/crypto";
import {
  MAX_BLOB_CHARS,
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

export async function GET(_request: NextRequest, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGroupId(groupId)) {
    return NextResponse.json({ error: "invalid group id" }, { status: 400 });
  }
  const record = await readRecord(syncDataDir(), groupId);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { groupId } = await params;
  if (!isValidGroupId(groupId)) {
    return NextResponse.json({ error: "invalid group id" }, { status: 400 });
  }

  let body: { blob?: unknown; iv?: unknown; expectedRev?: unknown };
  try {
    body = await request.json();
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
    return NextResponse.json({ error: "storage unavailable" }, { status: 500 });
  }
}
