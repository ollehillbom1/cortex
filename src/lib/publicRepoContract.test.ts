import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * This repository is public. A personal host name committed here does not
 * merely leak an address — the address is discoverable anyway — it hands a
 * reader a live target sitting next to a complete map of the app's
 * endpoints, rate limits and security history. Deployment details belong in
 * the operator's environment, never in git.
 *
 * Checked against tracked files via git, so it also catches a file added
 * outside src/.
 */

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
}

/**
 * Read the WORKING TREE, not HEAD: a check against the last commit only
 * notices a leak after it has already been committed and pushed.
 */
function contents(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("public repository hygiene", () => {
  // The review document records history and names the era it belongs to;
  // the changelog quotes commit subjects verbatim. Neither is code.
  const EXEMPT = new Set(["CHANGELOG.md", "docs/cortex-review-2026-08-02.md"]);

  it("commits no deployment host or tailnet address", () => {
    // Deliberately not the real host name: writing it here would be the
    // very leak this test exists to prevent. These patterns match any
    // personal deployment: a bare .se/.com host with an explicit port, and
    // Tailscale's 100.64/10 range.
    const host = /https?:\/\/[a-z0-9-]+\.(se|com|net|org|dev)(:\d+)/i;
    const tailnet = /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/;

    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      if (EXEMPT.has(file)) continue;
      if (!/\.(ts|tsx|js|mjs|sh|yml|yaml|json|md|Dockerfile)$/i.test(file) && file !== "Dockerfile")
        continue;
      const text = contents(file);
      // example.com and friends are documentation, not a deployment.
      const cleaned = text.replace(/https?:\/\/[a-z0-9-]*example\.(com|org)(:\d+)?/gi, "");
      if (host.test(cleaned) || tailnet.test(cleaned)) offenders.push(file);
    }
    expect(offenders, `deployment details committed in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the watchdog has no baked-in default target", () => {
    const script = contents("ops/watchdog.sh");
    expect(script).toContain('PROBE_URL="${CORTEX_PROBE_URL:-}"');
  });
});
