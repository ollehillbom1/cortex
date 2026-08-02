import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { ReactionGame } from "./ReactionGame";
import { REACTION_DEADLINE_MS } from "@/lib/exercises/reaction";

// The games translate through the profile context; identity-translate so the
// component renders standalone. i18n has its own tests.
vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({ t: (s: string) => s, locale: "en" }),
}));

/** soundOn is false in every test, so no method should ever be reached. */
const silentAudio = {} as AudioEngine;

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <ReactionGame
      level={1}
      roundIndex={0}
      seed={42}
      audio={silentAudio}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

const surface = () => screen.getByRole("button");

describe("ReactionGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The clock starts on the painted frame, so the test has to be able to
    // advance frames. Vitest's fake timers do not drive jsdom's rAF, so it is
    // modelled as what it is: a callback on the next frame boundary.
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

  it("scores a press before the GO frame is painted as a false start", () => {
    // The clock used to start inside the timeout, so React's render and the
    // browser's paint were inside the measured time — and a press timed to
    // the delay could land in the personal-best record.
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    fireEvent.click(surface());
    for (let i = 0; i < 60 && !screen.queryByText("GO!"); i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    // No frame advance: react in the same tick the phase changed.
    fireEvent.click(surface());
    act(() => vi.advanceTimersByTime(900));

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0]).toMatchObject({ extras: { falseStarts: 1 } });
  });

  it("ends a round nobody answers instead of waiting for ever", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    fireEvent.click(surface());
    for (let i = 0; i < 60 && !screen.queryByText("GO!"); i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    act(() => vi.advanceTimersByTime(REACTION_DEADLINE_MS + 1000));

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0].accuracy).toBe(0);
  });

  it("arms, shows GO after the delay, and reports the round on tap", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    fireEvent.click(surface()); // arm
    expect(screen.getByText("Wait for it…")).toBeTruthy();

    // Step to GO rather than jumping past it: the round now has a deadline,
    // and a single long jump would run it out before the tap.
    for (let i = 0; i < 60 && !screen.queryByText("GO!"); i++) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(screen.getByText("GO!")).toBeTruthy();

    // Two animation frames to paint, then a human-plausible pause. Reacting
    // in the same tick as the paint would land under the plausibility floor
    // and be scored as anticipation — which is the point of the floor.
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(300));

    fireEvent.click(surface()); // react
    act(() => vi.advanceTimersByTime(900)); // result interstitial
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    const result = onRoundComplete.mock.calls[0][0];
    expect(result.accuracy).toBeGreaterThan(0);
  });

  it("scores a false start and still completes the round", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    fireEvent.click(surface()); // arm
    fireEvent.click(surface()); // too early
    expect(screen.getByText("Too early!")).toBeTruthy();

    act(() => vi.advanceTimersByTime(900));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0].extras).toEqual({ falseStarts: 1 });
  });

  it("does not fire onRoundComplete after unmount (quit during the interstitial)", () => {
    // The 900 ms finish timers were created outside the cleanup's reach, so
    // quitting a session inside that window let a dead round report itself
    // into whatever state the session was in by then.
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);

    fireEvent.click(surface()); // arm
    fireEvent.click(surface()); // false start -> finish scheduled in 900 ms

    unmount(); // user quits before the timer fires
    act(() => vi.advanceTimersByTime(2_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });

  it("does not fire onRoundComplete after unmount from the GO phase either", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);

    fireEvent.click(surface()); // arm
    act(() => vi.advanceTimersByTime(10_000)); // -> GO
    fireEvent.click(surface()); // react -> finish scheduled in 900 ms

    unmount();
    act(() => vi.advanceTimersByTime(2_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
