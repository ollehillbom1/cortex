import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { generatePattern, patternParams } from "@/lib/exercises/visualPattern";
import type { AudioEngine } from "@/lib/audio/audio";
import { PatternGame } from "./PatternGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({
    // Identity translation with placeholder interpolation, so labels like
    // "Tile {n}" resolve the same way they do through the real translator.
    t: (s: string, params?: Record<string, unknown>) =>
      params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s,
    locale: "en",
  }),
}));

const SEED = 7;
const params = patternParams(1);
const pattern = generatePattern(createRng(SEED), params);

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <PatternGame
      level={1}
      roundIndex={0}
      seed={SEED}
      audio={{} as AudioEngine}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

/** Tiles are labelled "Tile {n}" with n = index + 1 (t() is identity here). */
function clickTile(index: number) {
  fireEvent.click(screen.getByLabelText(`Tile ${index + 1}`));
}

function showToRecall() {
  act(() => vi.advanceTimersByTime(500 + params.showMs + 100));
}

describe("PatternGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("auto-confirms once the full count is selected — no Confirm tap needed", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    showToRecall();

    for (const cell of pattern) clickTile(cell);
    expect(onRoundComplete).not.toHaveBeenCalled(); // grace still running

    act(() => vi.advanceTimersByTime(700));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0].perfect).toBe(true);
  });

  it("a change of mind during the grace cancels the auto-confirm", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    showToRecall();

    for (const cell of pattern) clickTile(cell);
    // Deselect one mid-grace: count drops below target, nothing must fire.
    act(() => vi.advanceTimersByTime(300));
    clickTile(pattern[0]);
    act(() => vi.advanceTimersByTime(2_000));
    expect(onRoundComplete).not.toHaveBeenCalled();

    // Reselecting re-arms the grace and the corrected answer is submitted.
    clickTile(pattern[0]);
    act(() => vi.advanceTimersByTime(700));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0].perfect).toBe(true);
  });

  it("the Confirm button still submits a deliberately partial answer", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    showToRecall();

    clickTile(pattern[0]); // remember only one tile
    fireEvent.click(screen.getByRole("button", { name: "Confirm pattern" }));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    const result = onRoundComplete.mock.calls[0][0];
    expect(result.perfect).toBe(false);
    expect(result.accuracy).toBeLessThan(1);
  });

  it("does not report the round when unmounted during the grace", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);
    showToRecall();

    for (const cell of pattern) clickTile(cell);
    unmount(); // quit before the auto-confirm fires
    act(() => vi.advanceTimersByTime(2_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
