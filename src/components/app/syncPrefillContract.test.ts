import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every way into the join dialog exists to enter an identity the user already
 * HAS — a sync code from another device, or a legacy passphrase. Pre-filling
 * that field (with anything) is silent data loss waiting to happen: the user
 * taps Join on a value they did not enter and lands in the wrong group. The
 * shipped ancestor of this bug pre-filled a freshly generated passphrase into
 * the rejoin and upgrade flows, orphaning everything already synced.
 *
 * Asserted against the source rather than a rendered component because the
 * defect is in which handler calls what, and mounting this section means
 * standing up the whole storage and sync stack for a one-line invariant.
 */

const SOURCE = readFileSync(new URL("./SyncSection.tsx", import.meta.url), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("join-dialog pre-fill", () => {
  const src = stripComments(SOURCE);

  it("every opener of the join dialog clears the input first", () => {
    const openers = [...src.matchAll(/setShowJoin\(true\)/g)];
    expect(openers.length).toBeGreaterThan(0);
    for (const match of openers) {
      // The clear must sit in the same handler, just before the open.
      const handler = src.slice(Math.max(0, match.index - 200), match.index);
      expect(handler, `opener at ${match.index} does not clear the input`).toContain(
        'setJoinInput("")',
      );
    }
  });

  it("nothing generated is ever written into the join input", () => {
    // The only writes are the clear and the controlled onChange echo.
    const writes = [...src.matchAll(/setJoinInput\(([^)]*)\)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    for (const value of writes) {
      expect(['""', "e.target.value"]).toContain(value);
    }
  });
});
