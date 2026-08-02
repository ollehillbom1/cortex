import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Supply-chain pins are policy, not one-time cleanup (SEC-08). A tag like
 * `@v4` or `node:22-alpine` is a moving target: whoever controls the tag
 * controls what runs in CI or ships in the image. Everything third-party is
 * pinned to a content hash, and Dependabot exists precisely so the pins can
 * move without a human chasing digests — pinning without an updater is how
 * pins rot into staleness.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("supply-chain pins", () => {
  it("every workflow action is pinned to a full commit SHA", () => {
    const dir = new URL("../../.github/workflows", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const uses = read(`.github/workflows/${file}`).match(/uses:\s*\S+/g) ?? [];
      expect(uses.length).toBeGreaterThan(0);
      for (const line of uses) {
        expect(line, `${file}: "${line}" is not SHA-pinned`).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it("the Docker base image is pinned by digest", () => {
    const dockerfile = read("Dockerfile");
    const base = dockerfile.match(/ARG NODE_IMAGE=(\S+)/);
    expect(base, "Dockerfile no longer declares NODE_IMAGE").not.toBeNull();
    expect(base![1], "base image is a floating tag").toMatch(/@sha256:[0-9a-f]{64}$/);
    // No stage may sidestep the ARG with its own floating reference.
    for (const from of dockerfile.match(/^FROM .*/gm) ?? []) {
      expect(from, `"${from}" does not go through NODE_IMAGE`).toContain("${NODE_IMAGE}");
    }
  });

  it("dependabot covers every ecosystem the pins live in", () => {
    const config = read(".github/dependabot.yml");
    for (const ecosystem of ["npm", "github-actions", "docker"]) {
      expect(config, `dependabot does not update ${ecosystem}`).toContain(
        `package-ecosystem: ${ecosystem}`,
      );
    }
  });
});
