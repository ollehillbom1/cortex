import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PUT } from "./[groupId]/route";

/**
 * The body cap and the store budget had no automated coverage at all: no test
 * mentioned 413, 507 or MAX_BODY_BYTES, so deleting the capped reader and
 * going back to `await request.json()` left the whole suite green. The only
 * evidence was a curl in a pull request.
 */

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cortex-route-"));
  dirs.push(dir);
  process.env.SYNC_DATA_DIR = dir;
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.SYNC_DATA_DIR;
  delete process.env.SYNC_MAX_TOTAL_BYTES;
});

const groupId = (n: number) => `f${String(n).padStart(63, "0")}`;

function put(id: string, blob: string, expectedRev = 0) {
  const body = JSON.stringify({ blob, iv: "AAAAAAAAAAAAAAAA", expectedRev });
  const request = new Request(`http://localhost/api/sync/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
  return PUT(request as never, { params: Promise.resolve({ groupId: id }) });
}

describe("sync route limits", () => {
  it("accepts a body inside the cap", async () => {
    tempDir();
    const response = await put(groupId(1), "QUJD");
    expect(response.status).toBe(200);
  });

  it("refuses a body over the cap with 413, before parsing it", async () => {
    tempDir();
    // Well past MAX_BODY_BYTES. A 413 here proves the cap is enforced on the
    // way in; parsing this as JSON first is the cost the cap exists to avoid.
    const response = await put(groupId(2), "A".repeat(9_000_000));
    expect(response.status).toBe(413);
  });

  it("refuses to grow the store past its budget with 507", async () => {
    tempDir();
    process.env.SYNC_MAX_TOTAL_BYTES = "2000";
    expect((await put(groupId(3), "A".repeat(1500))).status).toBe(200);
    expect((await put(groupId(4), "A".repeat(1500))).status).toBe(507);
    // ...and the group already there keeps working.
    expect((await put(groupId(3), "B".repeat(1500), 1)).status).toBe(200);
  });

  it("rejects a malformed payload with 400, not 500", async () => {
    tempDir();
    const request = new Request(`http://localhost/api/sync/${groupId(5)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const response = await PUT(request as never, {
      params: Promise.resolve({ groupId: groupId(5) }),
    });
    expect(response.status).toBe(400);
  });
});
