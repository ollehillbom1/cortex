import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { createRng } from "@/lib/engine/rng";
import { generateSplitSecondTrials, splitSecondParams } from "@/lib/exercises/splitSecond";
import { SplitSecondGame } from "./SplitSecondGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({
    t: (s: string, params?: Record<string, unknown>) =>
      params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s,
    locale: "en",
  }),
}));

const SEED = 33;
const params = splitSecondParams(1);
const trials = generateSplitSecondTrials(createRng(SEED), params);

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <SplitSecondGame
      level={1}
      roundIndex={0}
      seed={SEED}
      audio={{} as AudioEngine}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

/** Walk fixation -> exposure -> mask into the answer stage. */
function stimulusToAnswer() {
  act(() => vi.advanceTimersByTime(600 + 5)); // fixation
  act(() => vi.advanceTimersByTime(params.exposureMs + 5));
  act(() => vi.advanceTimersByTime(params.maskMs + 5));
}

function answerTrial(i: number, opts: { centreRight: boolean; targetRight: boolean }) {
  const trial = trials[i];
  const pickCircle = (trial.centre === 0) === opts.centreRight;
  fireEvent.click(screen.getByRole("button", { name: pickCircle ? "Circle" : "Square" }));
  const target = opts.targetRight ? trial.target : (trial.target + 1) % params.positions;
  fireEvent.click(screen.getByRole("button", { name: `Position ${target + 1}` }));
  act(() => vi.advanceTimersByTime(750)); // feedback beat -> next trial
}

describe("SplitSecondGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("runs the stimulus pipeline and scores a perfect round", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    for (let i = 0; i < trials.length; i++) {
      stimulusToAnswer();
      expect(screen.getByText("What was in the middle?")).toBeTruthy();
      answerTrial(i, { centreRight: true, targetRight: true });
    }

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0]).toMatchObject({ accuracy: 1, perfect: true });
  });

  it("gives half credit when only one half is right", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    for (let i = 0; i < trials.length; i++) {
      stimulusToAnswer();
      // Right centre, wrong position, every trial.
      answerTrial(i, { centreRight: true, targetRight: false });
    }

    const result = onRoundComplete.mock.calls[0][0] as { accuracy: number; perfect: boolean };
    expect(result.perfect).toBe(false);
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it("does not accept ring answers before the symbol answer", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    stimulusToAnswer();

    // The ring is not rendered during the centre question.
    expect(screen.queryByRole("button", { name: /Position/ })).toBeNull();
  });

  it("does not report the round after unmount (quit mid-answer)", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);
    stimulusToAnswer();

    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
