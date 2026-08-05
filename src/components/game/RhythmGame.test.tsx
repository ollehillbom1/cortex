import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { RhythmGame, RHYTHM_IDLE_SUBMIT_MS, RHYTHM_NO_ANSWER_MS } from "./RhythmGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({ t: (s: string) => s, locale: "en" }),
}));

function workingAudio() {
  return {
    muted: false,
    volume: 1,
    unlock: vi.fn(async () => true),
    scheduleTone: vi.fn(),
    playTone: vi.fn(async () => {}),
    stopAll: vi.fn(),
  } as unknown as AudioEngine;
}

/** Start the round and run the clock past playback into the tap phase. */
async function reachTapPhase() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /play the audio sequence/i }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(screen.getByRole("button", { name: /tap the rhythm here/i })).toBeTruthy();
}

describe("RhythmGame deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("submits a started answer after tap silence instead of hanging for ever", async () => {
    // The round used to complete only at the exact tap count, so tapping too
    // few and stopping left it waiting indefinitely — nothing scored, no way
    // forward but quitting the session.
    const onRoundComplete = vi.fn();
    render(
      <RhythmGame
        level={5}
        roundIndex={0}
        seed={11}
        audio={workingAudio()}
        soundOn
        onRoundComplete={onRoundComplete}
      />,
    );
    await reachTapPhase();

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: /tap the rhythm here/i }));
    });
    expect(onRoundComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RHYTHM_IDLE_SUBMIT_MS + 100);
    });
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    // A partial answer is a scored attempt, not a skip: missing taps already
    // subtract, and the runner must treat the round as completed.
    expect(onRoundComplete.mock.calls[0][0].unavailable).toBeUndefined();
  });

  it("re-offers the sequence when nothing was tapped, and scores nothing", async () => {
    const onRoundComplete = vi.fn();
    render(
      <RhythmGame
        level={5}
        roundIndex={0}
        seed={11}
        audio={workingAudio()}
        soundOn
        onRoundComplete={onRoundComplete}
      />,
    );
    await reachTapPhase();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RHYTHM_NO_ANSWER_MS + 100);
    });
    // Back on the play button: the likeliest story is a distracted listener
    // who needs to hear the rhythm again — silence is missing data, not a 0.
    expect(screen.getByRole("button", { name: /play the audio sequence/i })).toBeTruthy();
    expect(onRoundComplete).not.toHaveBeenCalled();
  });

  it("a resumed answer resets the silence window", async () => {
    const onRoundComplete = vi.fn();
    render(
      <RhythmGame
        level={5}
        roundIndex={0}
        seed={11}
        audio={workingAudio()}
        soundOn
        onRoundComplete={onRoundComplete}
      />,
    );
    await reachTapPhase();

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: /tap the rhythm here/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RHYTHM_IDLE_SUBMIT_MS - 500);
    });
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: /tap the rhythm here/i }));
    });
    // The second tap re-armed the window: the original deadline passing
    // must not have submitted.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onRoundComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RHYTHM_IDLE_SUBMIT_MS);
    });
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
  });
});
