import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { ReactionGame } from "./ReactionGame";

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
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("arms, shows GO after the delay, and reports the round on tap", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    fireEvent.click(surface()); // arm
    expect(screen.getByText("Wait for it…")).toBeTruthy();

    // The seeded delay is bounded; run until GO shows.
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("GO!")).toBeTruthy();

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
