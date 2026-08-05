import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEASUREMENT_VERSION } from "@/lib/measurement/version";

/**
 * Exercises whose SCORE is a timestamp must read the finger, not the click.
 *
 * On touch, `click` is dispatched only after the browser has ruled out a
 * scroll or drag: it arrives tens to hundreds of milliseconds late, and is
 * dropped entirely when the browser rules a scroll IN — which is how a
 * reaction test ends up recording the user's second attempt. Reported from
 * real use on a phone, and invisible in a desktop browser, so a test is the
 * only thing that will keep it fixed.
 */

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

describe("timing-critical input", () => {
  it.each(["ReactionGame.tsx", "RhythmGame.tsx"])("%s answers on pointerdown", (file) => {
    const source = read(file);
    expect(source).toMatch(/onPointerDown=\{/);
    // The handler must not ALSO be on click: the two would double-fire on
    // mouse, and the late one would overwrite an honest measurement.
    expect(source).not.toMatch(/onClick=\{(press|tap)\}/);
  });

  it.each(["ReactionGame.tsx", "RhythmGame.tsx"])(
    "%s takes its play surface out of gesture arbitration",
    (file) => {
      // touch-action: none via .play-surface — without it the browser still
      // waits to see whether the touch becomes a scroll.
      expect(read(file)).toContain("play-surface");
    },
  );

  it("the play surface really disables touch gestures", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.play-surface\s*\{[^}]*touch-action:\s*none/);
    // And the document itself must not scroll, or the arbitration returns
    // through the back door.
    expect(css).toMatch(/html\s*\{[^}]*overflow:\s*hidden/);
  });

  it("the era was bumped, because what these numbers mean changed", () => {
    // A measurement change without a version bump silently mixes two
    // different quantities in one chart — the whole point of the ledger.
    expect(MEASUREMENT_VERSION["reaction-time"]).toBeGreaterThanOrEqual(2);
    expect(MEASUREMENT_VERSION["rhythm-recall"]).toBeGreaterThanOrEqual(2);
  });
});
