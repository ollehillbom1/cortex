import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level contract: a game that lets the user leave a round it could not
 * present must mark the result `unavailable`, so the runner drops the block
 * instead of recording a failure.
 *
 * Four games shipped a "Skip exercise" button that reported `accuracy: 0`
 * through the normal path, which lowered the skill estimate for an exercise
 * the user was never able to attempt. This test fails if a fifth one does the
 * same, or if the flag is dropped from an existing call.
 */

const GAME_DIR = path.join(process.cwd(), "src/components/game");

function gameSources(): { file: string; source: string }[] {
  return readdirSync(GAME_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((file) => ({ file, source: readFileSync(path.join(GAME_DIR, file), "utf8") }));
}

/** Bodies of every `onRoundComplete({ ... })` call, brace-matched. */
function roundCompleteCalls(source: string): string[] {
  const calls: string[] = [];
  const marker = "onRoundComplete({";
  let from = 0;
  for (;;) {
    const start = source.indexOf(marker, from);
    if (start === -1) return calls;
    let depth = 0;
    let i = start + marker.length - 1;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) break;
    }
    calls.push(source.slice(start, i + 1));
    from = i + 1;
  }
}

describe("game -> runner round contract", () => {
  it("marks every skipped-because-unplayable round as unavailable", () => {
    const offenders: string[] = [];
    for (const { file, source } of gameSources()) {
      for (const call of roundCompleteCalls(source)) {
        const isSkip = /Skipped|skip/i.test(call);
        if (isSkip && !call.includes("unavailable: true")) offenders.push(`${file}: ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never marks a played round unavailable", () => {
    const offenders: string[] = [];
    for (const { file, source } of gameSources()) {
      for (const call of roundCompleteCalls(source)) {
        if (call.includes("unavailable: true") && !/Skipped|skip/i.test(call)) {
          offenders.push(`${file}: ${call}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the calls it claims to check", () => {
    // Guards the parser itself: a regression that stopped matching would make
    // both assertions above vacuously true.
    const all = gameSources().flatMap(({ source }) => roundCompleteCalls(source));
    expect(all.length).toBeGreaterThanOrEqual(9);
    expect(all.filter((c) => c.includes("unavailable: true")).length).toBe(4);
  });
});
