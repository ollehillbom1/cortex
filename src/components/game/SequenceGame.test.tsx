import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { generateSequence, sequenceParams } from "@/lib/exercises/sequenceMemory";
import type { AudioEngine } from "@/lib/audio/audio";
import { SequenceGame } from "./SequenceGame";

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
const params = sequenceParams(1);
const sequence = generateSequence(createRng(SEED), params);
const cells = params.gridSize * params.gridSize;
/** A cell that is not the expected one at the given step. */
const wrongFor = (step: number) => (sequence[step] + 1) % cells;

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <SequenceGame
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
const tile = (index: number) => screen.getByLabelText(`Tile ${index + 1}`);
const clickTile = (index: number) => fireEvent.click(tile(index));

function watchToRepeat() {
  act(() => vi.advanceTimersByTime(600 + sequence.length * (params.litMs + params.gapMs) + 200));
}

describe("SequenceGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("scores a fully repeated sequence as perfect", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    watchToRepeat();

    for (const cell of sequence) clickTile(cell);
    act(() => vi.advanceTimersByTime(250));

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0]).toMatchObject({
      accuracy: 1,
      perfect: true,
      extras: { maxSequence: sequence.length },
    });
  });

  it("marks a wrong tap visually, reveals the expected tile, and scores the prefix", () => {
    // The error used to be audio-only: with sound off, a wrong tap looked
    // exactly like a right one and the round simply vanished.
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    watchToRepeat();

    clickTile(sequence[0]);
    const wrong = wrongFor(1);
    clickTile(wrong);

    expect(tile(wrong).getAttribute("data-state")).toBe("error");
    expect(tile(sequence[1]).getAttribute("data-state")).toBe("reveal");

    // The hold is long enough to see (650 ms), then the round reports.
    act(() => vi.advanceTimersByTime(600));
    expect(onRoundComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);

    const result = onRoundComplete.mock.calls[0][0] as {
      accuracy: number;
      perfect: boolean;
      responseMs?: number;
      extras: Record<string, number>;
    };
    expect(result.perfect).toBe(false);
    expect(result.accuracy).toBeCloseTo(1 / sequence.length);
    expect(result.extras).toEqual({});
    // The clock stopped at the ending tap: the feedback hold is
    // presentation, not answering time.
    expect(result.responseMs).toBeLessThan(650);
  });

  it("ignores taps during the error hold", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    watchToRepeat();

    clickTile(wrongFor(0));
    clickTile(sequence[0]);
    clickTile(sequence[1]);
    act(() => vi.advanceTimersByTime(1_000));

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    // Only the pre-error tap counts: the prefix is 0 of N.
    expect((onRoundComplete.mock.calls[0][0] as { accuracy: number }).accuracy).toBe(0);
  });

  it("does not report the round when unmounted during the feedback hold", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);
    watchToRepeat();

    clickTile(wrongFor(0));
    unmount(); // quit before the hold ends
    act(() => vi.advanceTimersByTime(2_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
