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

/**
 * Every `onRoundComplete(...)` call, with comments and strings removed first.
 *
 * The earlier version matched the literal `onRoundComplete({`, so a hoisted
 * object, a spread or an extra space made the call invisible — a game added
 * with `const r = {...}; onRoundComplete(r)` passed every assertion. It also
 * matched inside comments and then brace-ran into unrelated code.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Text of each onRoundComplete call, argument expression included. */
function roundCompleteCalls(source: string): string[] {
  const clean = stripCommentsAndStrings(source);
  const calls: string[] = [];
  const marker = /onRoundComplete\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(clean)) !== null) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < clean.length; i++) {
      if (clean[i] === "(") depth++;
      else if (clean[i] === ")" && --depth === 0) break;
    }
    calls.push(clean.slice(match.index, i + 1));
  }
  return calls;
}

/**
 * The object a call reports, whether written inline or hoisted into a local.
 * A hoisted object is the obvious way to sidestep a literal-only matcher, so
 * it is followed rather than ignored.
 */
function reportedObject(call: string, source: string): string {
  const inline = call.indexOf("{");
  if (inline !== -1) return call;
  const name = call.slice(call.indexOf("(") + 1, call.lastIndexOf(")")).trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return call;
  const clean = stripCommentsAndStrings(source);
  const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`).exec(clean);
  if (!decl) return call;
  let depth = 0;
  let i = decl.index + decl[0].length - 1;
  for (; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}" && --depth === 0) break;
  }
  return clean.slice(decl.index, i + 1);
}

describe("game -> runner round contract", () => {
  it("marks every skipped-because-unplayable round as unavailable", () => {
    const offenders: string[] = [];
    for (const { file, source } of gameSources()) {
      for (const call of roundCompleteCalls(source)) {
        const reported = reportedObject(call, source);
        // Keyed on the SHAPE, not on prose: an accuracy-0 report with no
        // response time and no extras is a round that was never played.
        // Matching the word "skip" meant any rewording exempted the call.
        const looksUnplayed = /accuracy:\s*0\b/.test(reported) && !/responseMs/.test(reported);
        if (looksUnplayed && !reported.includes("unavailable: true")) {
          offenders.push(`${file}: ${reported.slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never marks a played round unavailable", () => {
    const offenders: string[] = [];
    for (const { file, source } of gameSources()) {
      for (const call of roundCompleteCalls(source)) {
        const reported = reportedObject(call, source);
        if (reported.includes("unavailable: true") && !/accuracy:\s*0\b/.test(reported)) {
          offenders.push(`${file}: ${reported.slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the calls it claims to check", () => {
    // Guards the parser itself: a regression that stopped matching would make
    // both assertions above vacuously true.
    const all = gameSources().flatMap(({ source }) =>
      roundCompleteCalls(source).map((c) => reportedObject(c, source)),
    );
    expect(all.length).toBeGreaterThanOrEqual(9);
    // At least the four known unplayable paths, not exactly four: pinning the
    // count made adding a CORRECT fifth game fail and an incorrect one pass.
    expect(all.filter((c) => c.includes("unavailable: true")).length).toBeGreaterThanOrEqual(4);
  });
});
