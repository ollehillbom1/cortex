import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The text tokens' contrast against the app background, pinned (issue #6).
 *
 * The axe scans in e2e catch contrast failures on the pages they visit, but
 * a token is used in hundreds of places the scans never render. One tweak
 * to --color-ink-faint "because it looked too loud" and every caption in
 * the app quietly drops below WCAG AA. The CSS already carries the intent
 * as a comment ("keep >=4.5:1"); this makes the comment enforceable.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return match[1];
}

function luminance(hex: string): number {
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("text contrast against the night background", () => {
  const background = token("night");

  it.each([
    // WCAG AA for normal text is 4.5:1. The margin above it is deliberate:
    // text often sits on the translucent white/5 card surface rather than
    // the raw background, which costs a little contrast.
    ["ink", 7],
    ["ink-dim", 5.5],
    ["ink-faint", 4.5],
    ["bad", 4.5],
    ["warn", 4.5],
  ] as const)("--color-%s stays readable (>= %s:1)", (name, minimum) => {
    const ratio = contrast(token(name), background);
    expect(
      ratio,
      `--color-${name} is ${ratio.toFixed(2)}:1 against --color-night; ` +
        `below ${minimum}:1 it stops being readable text and starts being decoration`,
    ).toBeGreaterThanOrEqual(minimum);
  });
});
