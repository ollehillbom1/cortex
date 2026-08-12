"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateNameRecallRound,
  nameRecallParams,
  namesForLocale,
  scoreNameRecall,
} from "@/lib/exercises/nameRecall";
import { useT } from "@/lib/i18n/useT";
import { FaceSvg } from "./FaceSvg";
import { PhaseHint, type GameProps } from "./shared";

type Phase = "study" | "quiz";

/**
 * One Name Recall round: study each face with its name (timed), then match
 * the faces back to their names in a new order (self-paced, forced choice).
 * A wrong pick shows the right name before moving on — closing the loop is
 * what makes the next encounter learnable.
 */
export function NameRecallGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const { t, locale } = useT();
  const params = nameRecallParams(level);
  const [round] = useState(() =>
    generateNameRecallRound(createRng(seed), nameRecallParams(level), namesForLocale(locale)),
  );
  const [phase, setPhase] = useState<Phase>("study");
  const [studyIndex, setStudyIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; name: string } | null>(null);
  const answers = useRef<(string | null)[]>([]);
  const answerMs = useRef<number[]>([]);
  const questionShownAt = useRef<number>(0);
  const done = useRef(false);
  // Feedback/advance timers outlive a quit without this (the #30 guard).
  useEffect(
    () => () => {
      done.current = true;
    },
    [],
  );

  // Study pacing: one pair per studyMs, then the quiz.
  useEffect(() => {
    if (phase !== "study") return;
    const timer = setTimeout(() => {
      if (studyIndex + 1 < round.pairs.length) setStudyIndex((i) => i + 1);
      else setPhase("quiz");
    }, params.studyMs);
    return () => clearTimeout(timer);
  }, [phase, studyIndex, round.pairs.length, params.studyMs]);

  useEffect(() => {
    if (phase === "quiz") questionShownAt.current = performance.now();
  }, [phase, quizIndex]);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreNameRecall(round, answers.current);
    const mean =
      answerMs.current.length > 0
        ? Math.round(answerMs.current.reduce((a, b) => a + b, 0) / answerMs.current.length)
        : undefined;
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      responseMs: mean,
      responseUnits: round.pairs.length,
      detail: t("{n} of {total} names", { n: score.correct, total: round.pairs.length }),
      extras: score.perfect ? { maxSpan: round.pairs.length } : {},
    });
  }, [round, onRoundComplete, t]);

  const answer = useCallback(
    (name: string) => {
      if (phase !== "quiz" || done.current || feedback) return;
      const item = round.quiz[quizIndex];
      answers.current[quizIndex] = name;
      answerMs.current.push(Math.round(performance.now() - questionShownAt.current));
      const correctName = round.pairs[item.pairIndex].name;
      const correct = name === correctName;
      setFeedback({ correct, name: correctName });
      if (soundOn) {
        if (correct) audio.playSuccess();
        else audio.playError();
      }
      // The wrong-answer beat is longer: reading the right name IS the
      // feedback. Presentation only — the answer clock stopped above.
      setTimeout(
        () => {
          if (done.current) return;
          setFeedback(null);
          if (quizIndex + 1 < round.quiz.length) setQuizIndex((i) => i + 1);
          else finish();
        },
        correct ? 500 : 1100,
      );
    },
    [phase, feedback, round, quizIndex, soundOn, audio, finish],
  );

  // Number keys pick an option.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "quiz") return;
      const n = Number.parseInt(e.key, 10);
      const item = round.quiz[quizIndex];
      if (item && n >= 1 && n <= item.options.length) answer(item.options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, quizIndex, round, answer]);

  if (phase === "study") {
    const pair = round.pairs[studyIndex];
    return (
      <div className="flex flex-col items-center gap-5">
        <PhaseHint>
          {t("Memorise — {i}/{n}. Hang the name on something you see.", {
            i: studyIndex + 1,
            n: round.pairs.length,
          })}
        </PhaseHint>
        {/* Keyed remount so each pair pops in as a new card. */}
        <div key={studyIndex} className="pop-in flex flex-col items-center gap-3">
          <div className="rounded-3xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] p-4">
            <FaceSvg face={pair.face} />
          </div>
          <p className="text-2xl font-bold">{pair.name}</p>
        </div>
      </div>
    );
  }

  const item = round.quiz[quizIndex];
  return (
    <div className="flex flex-col items-center gap-5">
      <PhaseHint>
        {t("Who is this? — {i}/{n}", { i: quizIndex + 1, n: round.quiz.length })}
      </PhaseHint>
      <div
        key={quizIndex}
        className="pop-in rounded-3xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] p-4"
      >
        <FaceSvg face={round.pairs[item.pairIndex].face} />
      </div>
      <p aria-live="polite" className="min-h-5 text-sm font-medium">
        {feedback &&
          (feedback.correct ? (
            <span className="text-[var(--color-good)]">✓ {feedback.name}</span>
          ) : (
            <span className="text-[var(--color-bad)]">
              ✗ {t("It was {name}", { name: feedback.name })}
            </span>
          ))}
      </p>
      <div className="grid w-full max-w-xs grid-cols-1 gap-2">
        {item.options.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => answer(name)}
            disabled={feedback !== null}
            className="touch-target rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] py-3 text-lg font-semibold transition-colors active:bg-[var(--fill-active)] disabled:opacity-60"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
