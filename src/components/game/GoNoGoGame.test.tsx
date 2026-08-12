import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { createRng } from "@/lib/engine/rng";
import { generateGoNoGoTrials, goNoGoParams } from "@/lib/exercises/goNoGo";
import { GoNoGoGame } from "./GoNoGoGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({
    t: (s: string, params?: Record<string, unknown>) =>
      params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s,
    locale: "en",
  }),
}));

const SEED = 21;
const params = goNoGoParams(1);
const trials = generateGoNoGoTrials(createRng(SEED), params);
/** Stimulus onset time for trial i, mirroring the component's scheduler. */
const onsetOf = (i: number) =>
  900 + trials.slice(0, i + 1).reduce((a, t) => a + t.isiMs, 0) + i * params.deadlineMs;
const totalMs = onsetOf(trials.length - 1) + params.deadlineMs + 400 + 100;

let elapsed = 0;
function advanceTo(target: number) {
  act(() => vi.advanceTimersByTime(target - elapsed));
  elapsed = target;
}

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <GoNoGoGame
      level={1}
      roundIndex={0}
      seed={SEED}
      audio={{} as AudioEngine}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

const surface = () => screen.getByRole("button");

describe("GoNoGoGame", () => {
  beforeEach(() => {
    elapsed = 0;
    vi.useFakeTimers();
    // rAF is modelled as a next-frame callback so the painted-frame clock
    // can be advanced — same convention as ReactionGame's tests.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("scores an untouched round at chance, not in the adaptive band", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    advanceTo(totalMs);
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    const result = onRoundComplete.mock.calls[0][0] as { accuracy: number; extras: object };
    // All gos missed, all stops held: balanced accuracy is exactly chance.
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it("scores a press in a GO window as a hit, with feedback", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    // Trial 0 is always go (the generator never opens with a no-go). Two
    // steps: the first lets the onset effect flush and schedule its frame
    // callbacks, the second runs them so the painted-frame clock is set.
    advanceTo(onsetOf(0) + 1);
    advanceTo(onsetOf(0) + 60);
    fireEvent.pointerDown(surface());
    expect(screen.getByText(/Caught it/)).toBeTruthy();

    advanceTo(totalMs);
    const result = onRoundComplete.mock.calls[0][0] as {
      responseMs?: number;
      detail?: string;
    };
    expect(result.responseMs).toBeGreaterThan(0);
    expect(result.detail).toContain("1 of");
  });

  it("scores a press in a STOP window as a false alarm", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    const firstNoGo = trials.findIndex((t) => !t.go);
    advanceTo(onsetOf(firstNoGo) + 1);
    advanceTo(onsetOf(firstNoGo) + 60);
    fireEvent.pointerDown(surface());
    expect(screen.getByText(/That was a stop/)).toBeTruthy();

    advanceTo(totalMs);
    const result = onRoundComplete.mock.calls[0][0] as { extras: { falseAlarms: number } };
    expect(result.extras.falseAlarms).toBe(1);
  });

  it("ignores presses before the stimulus has painted", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    // Same tick as the onset: the double-rAF stamp has not run, so the
    // window is not open yet — anticipation must not score.
    advanceTo(onsetOf(0));
    fireEvent.pointerDown(surface());
    expect(screen.queryByText(/Caught it/)).toBeNull();

    advanceTo(totalMs);
    const result = onRoundComplete.mock.calls[0][0] as { accuracy: number };
    expect(result.accuracy).toBeCloseTo(0.5); // that go counted as a miss
  });

  it("does not report the round after unmount (quit mid-stream)", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);

    advanceTo(onsetOf(0) + 1);
    advanceTo(onsetOf(0) + 60);
    unmount();
    act(() => vi.advanceTimersByTime(totalMs));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
