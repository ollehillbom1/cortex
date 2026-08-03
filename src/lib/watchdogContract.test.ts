import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The watchdog is the thing that notices production is dead. A monitor
 * nobody exercises is exactly the "safety net that does not execute"
 * pattern this project keeps finding — so its state machine runs in CI on
 * every push, through the script's own `--self-test` (fake probes, fake
 * sender: no network, no SMS, deterministic).
 *
 * What the self-test pins: a single failed probe does NOT page (redeploys
 * blip), two consecutive ones do, a continuing outage does not re-page
 * inside the repeat window but does after it, recovery is announced, and a
 * fresh outage after recovery pages again.
 */

const script = new URL("../../ops/watchdog.sh", import.meta.url).pathname;

describe("watchdog", () => {
  it("exists and is executable", () => {
    expect(existsSync(script)).toBe(true);
    // Cron runs it directly; a lost +x bit turns monitoring off silently.
    expect(statSync(script).mode & 0o111).toBeGreaterThan(0);
  });

  it("passes its own state-machine self-test", () => {
    const out = execFileSync("bash", [script, "--self-test"], { encoding: "utf8" });
    expect(out).toContain("self-test passed");
    expect(out).not.toContain("FAIL");
  });

  it("never hard-codes the alarm target or gateway in the repo", () => {
    // The phone number and gateway URL live in ~/.hermes/.env on the host,
    // never in git — committing either would put a private number in a
    // repository and a webhook in every clone.
    const source = execFileSync("cat", [script], { encoding: "utf8" });
    expect(source).not.toMatch(/\+\d{9,}/);
    expect(source).toMatch(/HERMES_ENV/);
  });
});
