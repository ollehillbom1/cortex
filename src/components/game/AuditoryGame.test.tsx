import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { AuditoryGame } from "./AuditoryGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({ t: (s: string) => s, locale: "en" }),
}));

/** A muted engine: the exercise cannot be presented at all. */
function mutedAudio() {
  return {
    muted: true,
    volume: 0,
    unlock: vi.fn(async () => false),
    cancelSpeech: vi.fn(),
    speakDigit: vi.fn(async () => {}),
    playTone: vi.fn(async () => {}),
  } as unknown as AudioEngine;
}

describe("AuditoryGame with no audio", () => {
  afterEach(cleanup);

  it("reports the round as unavailable rather than a zero score", async () => {
    // A round the user could not perceive is missing data, not a failed
    // attempt: scoring it 0 lowered their skill estimate and (before the XP
    // fix) still paid a level bonus. The runner keys on `unavailable` to drop
    // the whole block, so this flag is the contract between game and runner.
    const onRoundComplete = vi.fn();
    render(
      <AuditoryGame
        level={1}
        roundIndex={0}
        seed={7}
        audio={mutedAudio()}
        soundOn={false}
        onRoundComplete={onRoundComplete}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play the audio sequence/i }));
    });
    fireEvent.click(screen.getByRole("button", { name: /skip exercise/i }));

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0]).toMatchObject({
      accuracy: 0,
      unavailable: true,
    });
  });
});
