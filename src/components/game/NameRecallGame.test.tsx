import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audio";
import { createRng } from "@/lib/engine/rng";
import {
  generateNameRecallRound,
  nameRecallParams,
  namesForLocale,
} from "@/lib/exercises/nameRecall";
import { NameRecallGame } from "./NameRecallGame";

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => ({
    t: (s: string, params?: Record<string, unknown>) =>
      params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s,
    locale: "en",
  }),
}));

const SEED = 17;
const params = nameRecallParams(1); // 2 pairs, 3 options
const round = generateNameRecallRound(createRng(SEED), params, namesForLocale("en"));

function renderGame(onRoundComplete: (r: unknown) => void) {
  return render(
    <NameRecallGame
      level={1}
      roundIndex={0}
      seed={SEED}
      audio={{} as AudioEngine}
      soundOn={false}
      onRoundComplete={onRoundComplete}
    />,
  );
}

function studyToQuiz() {
  // One studyMs per pair moves the round into the quiz.
  for (let i = 0; i < round.pairs.length; i++) {
    act(() => vi.advanceTimersByTime(params.studyMs + 10));
  }
}

const rightAnswer = (quizIndex: number) => round.pairs[round.quiz[quizIndex].pairIndex].name;

describe("NameRecallGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("studies each pair, then quizzes and scores a perfect round", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);

    // Study phase shows the first name as text.
    expect(screen.getByText(round.pairs[0].name)).toBeTruthy();
    studyToQuiz();

    for (let i = 0; i < round.quiz.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: rightAnswer(i) }));
      act(() => vi.advanceTimersByTime(600)); // correct-answer beat
    }

    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete.mock.calls[0][0]).toMatchObject({
      accuracy: 1,
      perfect: true,
      extras: { maxSpan: round.pairs.length },
    });
  });

  it("reveals the right name on a wrong pick, and scores the miss", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    studyToQuiz();

    const correct = rightAnswer(0);
    const wrong = round.quiz[0].options.find((o) => o !== correct)!;
    fireEvent.click(screen.getByRole("button", { name: wrong }));
    expect(screen.getByText(new RegExp(`It was ${correct}`))).toBeTruthy();
    act(() => vi.advanceTimersByTime(1200)); // wrong-answer beat is longer

    for (let i = 1; i < round.quiz.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: rightAnswer(i) }));
      act(() => vi.advanceTimersByTime(600));
    }

    const result = onRoundComplete.mock.calls[0][0] as {
      accuracy: number;
      perfect: boolean;
      extras: Record<string, number>;
    };
    expect(result.perfect).toBe(false);
    expect(result.accuracy).toBeCloseTo((round.pairs.length - 1) / round.pairs.length);
    expect(result.extras).toEqual({});
  });

  it("ignores double answers during the feedback beat", () => {
    const onRoundComplete = vi.fn();
    renderGame(onRoundComplete);
    studyToQuiz();

    fireEvent.click(screen.getByRole("button", { name: rightAnswer(0) }));
    // Buttons are disabled during feedback; a second activation must not
    // answer the NEXT question early.
    fireEvent.click(screen.getByRole("button", { name: rightAnswer(0) }));
    act(() => vi.advanceTimersByTime(600));

    fireEvent.click(screen.getByRole("button", { name: rightAnswer(1) }));
    act(() => vi.advanceTimersByTime(600));
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect((onRoundComplete.mock.calls[0][0] as { accuracy: number }).accuracy).toBe(1);
  });

  it("does not report the round after unmount (quit mid-quiz)", () => {
    const onRoundComplete = vi.fn();
    const { unmount } = renderGame(onRoundComplete);
    studyToQuiz();

    fireEvent.click(screen.getByRole("button", { name: rightAnswer(0) }));
    unmount();
    act(() => vi.advanceTimersByTime(5_000));
    expect(onRoundComplete).not.toHaveBeenCalled();
  });
});
