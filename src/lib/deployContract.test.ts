import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The hardened runtime used to live in one session's memory and a paragraph
 * of documentation — which is how the live container ended up running for a
 * day with none of the limits the docs claimed. It lives in ops/deploy.sh
 * now, and these tests fail the build if a flag is dropped.
 *
 * `--print-only` renders the exact docker command without touching Docker,
 * so this runs in CI on a machine with no containers at all.
 */

const script = new URL("../../ops/deploy.sh", import.meta.url).pathname;

function command(env: "prod" | "staging"): string {
  return execFileSync("bash", [script, "--tag", "v0.0.0-test", "--env", env, "--print-only"], {
    encoding: "utf8",
  });
}

describe("deploy command", () => {
  const required = [
    "--read-only",
    "--tmpfs /tmp",
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    "--pids-limit 256",
    "--memory 512m",
    "--log-opt max-size=10m",
  ];

  it.each(required)("keeps %s in the production runtime", (flag) => {
    // printf %q quotes each argument separately; compare on the unquoted form.
    const rendered = command("prod").replace(/\\/g, "");
    expect(rendered).toContain(flag);
  });

  it("keeps the same hardening in staging", () => {
    const rendered = command("staging").replace(/\\/g, "");
    for (const flag of required) expect(rendered).toContain(flag);
  });

  it("never lets staging touch the production sync volume or the public port", () => {
    // Staging exists to be broken. Sharing the live volume would make it a
    // second writer against the household's real data, and a public port
    // would make it findable.
    const staging = command("staging");
    expect(staging).toContain("cortex-sync-staging:/app/data");
    expect(staging).not.toMatch(/[^-]cortex-sync:\/app\/data/);
    expect(staging).toContain("127.0.0.1:9923:3000");

    const prod = command("prod");
    expect(prod).toContain("cortex-sync:/app/data");
    expect(prod).toContain("0.0.0.0:9922:3000");
  });

  it("deploys a named tag, never a floating one", () => {
    // "Deploy main" cannot be rolled back to; a tag can.
    expect(command("prod")).toContain("cortex:v0.0.0-test");
    expect(() =>
      execFileSync("bash", [script, "--env", "prod", "--print-only"], { encoding: "utf8" }),
    ).toThrow();
  });
});
