import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Never read the host's real deploy.env from a test; addresses come from the
// test itself (documentation ranges, RFC 5737 / RFC 3849).
function command(env: "prod" | "staging", proxyAddrs = "192.0.2.10"): string {
  return execFileSync("bash", [script, "--tag", "v0.0.0-test", "--env", env, "--print-only"], {
    encoding: "utf8",
    env: { ...process.env, CORTEX_DEPLOY_ENV_FILE: "/nonexistent", CORTEX_PROD_PROXY_ADDRS: proxyAddrs },
  });
}

// A refusal is exit 2 with the script's own message — not just "it threw",
// which an unrelated script error would also satisfy.
function refusal(proxyAddrs: string): string | null {
  const r = spawnSync("bash", [script, "--tag", "v0.0.0-test", "--env", "prod", "--print-only"], {
    encoding: "utf8",
    env: { ...process.env, CORTEX_DEPLOY_ENV_FILE: "/nonexistent", CORTEX_PROD_PROXY_ADDRS: proxyAddrs },
  });
  return r.status === 2 && r.stderr.includes("CORTEX_PROD_PROXY_ADDRS:") ? r.stderr : null;
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
  });

  it("publishes production on loopback plus the proxy's address, never on every interface", () => {
    // 0.0.0.0 put the app on the LAN and past the host firewall (Docker-
    // published ports bypass it). The proxy is the only off-host consumer.
    const prod = command("prod", "192.0.2.10,2001:db8::10").replace(/\\/g, "");
    expect(prod).toContain("-p 127.0.0.1:9922:3000");
    expect(prod).toContain("-p 192.0.2.10:9922:3000");
    expect(prod).toContain("-p [2001:db8::10]:9922:3000");
    expect(prod).not.toContain("0.0.0.0");
    // An empty host IP ("-p :9922:3000") is Docker's spelling of 0.0.0.0.
    expect(prod).not.toMatch(/-p :/);
    expect(command("prod", "none")).not.toMatch(/192\.0\.2|0\.0\.0\.0|-p :/);
    // Duplicates collapse instead of producing two identical -p flags.
    expect(command("prod", "192.0.2.10, 192.0.2.10").match(/192\.0\.2\.10:9922/g)).toHaveLength(1);
  });

  it("refuses to guess where the proxy is", () => {
    // Loopback alone deploys "healthy" and takes the public app down, so an
    // unset or blank value is refused; only the literal "none" means that.
    for (const unset of ["", " ", "\t"]) expect(refusal(unset)).toMatch(/not set/);
    expect(refusal(" none ")).toBeNull();
  });

  it("reads only its own key from the host file, and the environment wins", () => {
    const dir = mkdtempSync(join(tmpdir(), "cortex-deploy-"));
    const file = join(dir, "deploy.env");
    const run = (env: Record<string, string>) =>
      execFileSync("bash", [script, "--tag", "v0.0.0-test", "--env", "prod", "--print-only"], {
        encoding: "utf8",
        env: { ...process.env, CORTEX_DEPLOY_ENV_FILE: file, ...env },
      });
    try {
      writeFileSync(file, '  export CORTEX_PROD_PROXY_ADDRS="192.0.2.20"  # proxy\r\nTAG=evil\n');
      const fromFile = run({ CORTEX_PROD_PROXY_ADDRS: "" });
      expect(fromFile).toContain("192.0.2.20:9922:3000");
      expect(fromFile).toContain("cortex:v0.0.0-test"); // TAG in the file is ignored
      expect(run({ CORTEX_PROD_PROXY_ADDRS: "192.0.2.30" })).not.toContain("192.0.2.20");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ",", "a,,b", ",192.0.2.10", // empty field: Docker reads it as all interfaces
    "0.0.0.0", "000.0.0.0", "::", "::0", "0:0:0:0:0:0:0:0", "[::]", "[0.0.0.0]", "::ffff:0.0.0.0",
    "*", "0", "0.0.0.0/0", "256.1.1.1", "host.example", "None", "192.0.2.10,0.0.0.0",
    "127.0.0.1", "::1", // loopback is always published; it is not a proxy address
    "::ffff:0:0", "0::ffff:0:0", // IPv4-mapped 0.0.0.0 in hex form
    "fe80::1", // link-local: unbindable without a zone
    "1::2::3", "192.0.2.10,", "192.0.2.10\n0.0.0.0",
  ])("refuses %j as a proxy address", (value) => {
    expect(refusal(value)).not.toBeNull();
  });

  it("names the proxy chain's own hops so rate limiting keys on the client", () => {
    // Behind Cloudflare → tunnel → Apache, the rightmost X-Forwarded-For
    // entry is the chain's internal 127.0.0.1 for every request. Without
    // TRUSTED_PROXIES the whole internet shares one rate-limit bucket —
    // which is how production actually ran for a day in 2026-08.
    const rendered = command("prod").replace(/\\/g, "");
    expect(rendered).toContain("-e TRUSTED_PROXIES=127.0.0.1");
  });

  it("deploys a named tag, never a floating one", () => {
    // "Deploy main" cannot be rolled back to; a tag can.
    expect(command("prod")).toContain("cortex:v0.0.0-test");
    expect(() =>
      execFileSync("bash", [script, "--env", "prod", "--print-only"], { encoding: "utf8" }),
    ).toThrow();
  });
});
