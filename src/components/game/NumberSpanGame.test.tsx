import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { generateDigits, numberSpanParams } from "@/lib/exercises/numberSpan";
import type { AudioEngine } from "@/lib/audio/audio";
import { NumberSpanGame } from "./NumberSpanGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({ t: (s: string) => s, locale: "en" }),
}));

const SEED = 42;
const params = numberSpanParams(1, 0);
const digits = generateDigits(createRng(SEED), params.span);

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <NumberSpanGame
      level={1}
      roundIndex={0}
      seed={SEED}
      audio={{} as AudioEngine}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

/** Play the presentation out, then type every digit via the keyboard. */
function presentAndType() {
  // Presentation: one timer per digit plus the switch to input.
  act(() => vi.advanceTimersByTime(digits.length * (params.digitMs + params.gapMs) + 1_000));
  expect(screen.getByText(/enter the digits/i)).toBeTruthy();
  for (const d of digits) {
    fireEvent.keyDown(window, { key: String(d) });
  }
}

describe("NumberSpanGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("auto-submits after the last digit and reports a perfect round", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    presentAndType();
    act(() => vi.advanceTimersByTime(200)); // 150 ms auto-submit grace
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    const result = onRoundComplete.mock.calls[0][0];
    expect(result.perfect).toBe(true);
    expect(result.accuracy).toBe(1);
  });

  it("does not report the round when unmounted during the auto-submit grace", () => {
    // The 150 ms timer lives outside any cleanup; without the cancelled
    // guard, quitting in that window reports a round from a dead component.
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);

    presentAndType();
    unmount(); // quit before the auto-submit fires
    act(() => vi.advanceTimersByTime(1_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
