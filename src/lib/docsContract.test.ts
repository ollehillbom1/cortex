import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Docs that make checkable claims get checked (MAINT-01). The review found
 * three kinds of drift — framework versions, test counts, and operational
 * claims — each stated once in prose and then left behind by the code. The
 * fix is not to update the numbers; it is to make the claims either
 * generated, absent, or asserted here so drift turns a gate red.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("docs tell the truth", () => {
  it("architecture.md names the Next.js major the build actually uses", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    const major = pkg.dependencies.next.match(/\d+/)![0];
    const architecture = read("docs/architecture.md");
    const claimed = architecture.match(/Next\.js (\d+)/);
    expect(claimed, "architecture.md no longer names a Next.js version").not.toBeNull();
    expect(claimed![1]).toBe(major);
  });

  it("ADR 0001 carries its version addendum, so its Next.js 15 stays historical", () => {
    // The ADR body is a record of the decision as made and is deliberately
    // not rewritten; the addendum is what keeps a reader from being misled.
    const adr = read("docs/adr/0001-nextjs-app-router.md");
    expect(adr).toMatch(/## Update/);
    expect(adr).toMatch(/Next\.js 16/);
  });

  it("testing.md states no test count that can go stale", () => {
    // "274 tests" was written once and drifted within a week. The suite
    // prints its own count; prose does not get to.
    expect(read("docs/testing.md")).not.toMatch(/\b\d+\s+(unit\s+)?tests?\b/i);
  });

  it("testing.md describes every e2e spec that exists", () => {
    const specs = readdirSync(new URL("../../e2e", import.meta.url)).filter((f) =>
      f.endsWith(".spec.ts"),
    );
    const testing = read("docs/testing.md");
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(testing, `${spec} is not described in docs/testing.md`).toContain(spec);
    }
  });

  it("the 512 MB claim matches compose and carries its own caveat", () => {
    // README cites the limit docker-compose.yml declares; the live container
    // was once started without Compose and had none. The claim must name the
    // limit compose actually sets AND say it only applies through Compose.
    expect(read("docker-compose.yml")).toMatch(/memory: 512M/);
    const readme = read("README.md");
    expect(readme).toMatch(/512 MB/);
    expect(readme).toMatch(/applies only when the container is started through Compose/);
  });
});
