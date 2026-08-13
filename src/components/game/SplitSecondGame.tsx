"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateSplitSecondTrials,
  scoreSplitSecond,
  splitSecondParams,
  type SplitSecondAnswer,
} from "@/lib/exercises/splitSecond";
import { useT } from "@/lib/i18n/useT";
import { PhaseHint, type GameProps } from "./shared";

type Stage = "fixation" | "exposure" | "mask" | "answer-centre" | "answer-target";

const RING_RADIUS = 38;
/** Ring position -> SVG coordinates (12 o'clock first, clockwise). */
function ringXY(position: number, positions: number): { x: number; y: number } {
  const angle = (position / positions) * 2 * Math.PI - Math.PI / 2;
  return { x: 50 + RING_RADIUS * Math.cos(angle), y: 50 + RING_RADIUS * Math.sin(angle) };
}

/**
 * One Split Second round: for each trial a fixation cross, a brief exposure
 * (centre symbol + peripheral diamond, look-alikes at higher levels), a
 * mask that overwrites the afterimage, then two self-paced answers. The
 * stimulus timing is scheduled, the answering never is.
 */
export function SplitSecondGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = splitSecondParams(level);
  const [trials] = useState(() =>
    generateSplitSecondTrials(createRng(seed), splitSecondParams(level)),
  );
  const [trialIndex, setTrialIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("fixation");
  const [feedback, setFeedback] = useState<"full" | "half" | "miss" | null>(null);
  const answers = useRef<SplitSecondAnswer[]>([]);
  const centreChoice = useRef<number | null>(null);
  const answerShownAt = useRef(0);
  const answerMs = useRef<number[]>([]);
  // A ring answer schedules nextTrial in 700 ms but leaves `stage` on
  // "answer-target" until it fires, so a second tap in that window passed the
  // stage guard and scheduled a SECOND nextTrial — the functional
  // setTrialIndex then advanced twice, silently skipping a trial (scored a
  // miss). This latches the trial as answered until the next one begins.
  const answered = useRef(false);
  const done = useRef(false);
  useEffect(
    () => () => {
      done.current = true;
    },
    [],
  );

  // Stimulus pipeline for the current trial; answers advance it manually.
  useEffect(() => {
    if (stage === "fixation") {
      const timer = setTimeout(() => setStage("exposure"), 600);
      return () => clearTimeout(timer);
    }
    if (stage === "exposure") {
      const timer = setTimeout(() => setStage("mask"), params.exposureMs);
      return () => clearTimeout(timer);
    }
    if (stage === "mask") {
      const timer = setTimeout(() => {
        answerShownAt.current = performance.now();
        setStage("answer-centre");
      }, params.maskMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [stage, trialIndex, params.exposureMs, params.maskMs]);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreSplitSecond(trials, answers.current);
    const mean =
      answerMs.current.length > 0
        ? Math.round(answerMs.current.reduce((a, b) => a + b, 0) / answerMs.current.length)
        : undefined;
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      responseMs: mean,
      detail: t("{n} of {total} caught whole", { n: score.fullCatches, total: trials.length }),
      extras: {},
    });
  }, [trials, onRoundComplete, t]);

  const nextTrial = useCallback(() => {
    if (done.current) return;
    answered.current = false;
    setFeedback(null);
    if (trialIndex + 1 < trials.length) {
      setTrialIndex((i) => i + 1);
      setStage("fixation");
    } else {
      finish();
    }
  }, [trialIndex, trials.length, finish]);

  const answerCentre = useCallback(
    (symbol: number) => {
      if (stage !== "answer-centre" || done.current) return;
      centreChoice.current = symbol;
      setStage("answer-target");
    },
    [stage],
  );

  const answerTarget = useCallback(
    (position: number) => {
      if (stage !== "answer-target" || done.current || answered.current) return;
      answered.current = true;
      const trial = trials[trialIndex];
      const centre = centreChoice.current;
      answers.current[trialIndex] = { centre, target: position };
      answerMs.current.push(Math.round(performance.now() - answerShownAt.current));
      const rights = (centre === trial.centre ? 1 : 0) + (position === trial.target ? 1 : 0);
      setFeedback(rights === 2 ? "full" : rights === 1 ? "half" : "miss");
      if (soundOn) {
        if (rights === 2) audio.playSuccess();
        else if (rights === 0) audio.playError();
      }
      setTimeout(nextTrial, 700);
    },
    [stage, trialIndex, trials, soundOn, audio, nextTrial],
  );

  // Direct handler reference for the ring (position via data attribute):
  // an inline arrow here trips the React Compiler's ref-escape analysis.
  const onRingTap = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      answerTarget(Number(e.currentTarget.dataset.pos));
    },
    [answerTarget],
  );

  // Number keys: 1/2 pick the symbol, 1-8 pick the ring position.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number.parseInt(e.key, 10);
      if (Number.isNaN(n)) return;
      if (stage === "answer-centre" && n >= 1 && n <= 2) answerCentre(n - 1);
      if (stage === "answer-target" && n >= 1 && n <= params.positions) answerTarget(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, params.positions, answerCentre, answerTarget]);

  const trial = trials[trialIndex];
  const showRing = stage === "answer-target";
  const positions = Array.from({ length: params.positions }, (_, p) => p);

  return (
    <div className="flex flex-col items-center gap-5">
      <PhaseHint>
        {stage === "fixation" &&
          t("Eyes on the cross — {i}/{n}", { i: trialIndex + 1, n: trials.length })}
        {(stage === "exposure" || stage === "mask") && " "}
        {stage === "answer-centre" && t("What was in the middle?")}
        {stage === "answer-target" && t("Where was the diamond?")}
      </PhaseHint>

      <div className="relative mx-auto aspect-square w-full max-w-xs rounded-[2rem] border border-[var(--surface-border)] bg-[var(--fill-subtle)]">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {/* Fixation cross stays up except during the answer ring. */}
          {(stage === "fixation" || stage === "exposure" || stage === "mask") && (
            <path
              d="M 47 50 h 6 M 50 47 v 6"
              stroke="var(--color-ink-faint)"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          )}

          {stage === "exposure" && (
            <>
              {trial.centre === 0 ? (
                <circle cx={50} cy={50} r={6.5} fill="var(--color-accent-2)" />
              ) : (
                <rect x={44} y={44} width={12} height={12} fill="var(--color-accent-2)" />
              )}
              <path d={diamondPath(trial.target, params.positions)} fill="var(--color-warn)" />
              {trial.distractorAt.map((p) => {
                const { x, y } = ringXY(p, params.positions);
                return (
                  <circle
                    key={p}
                    cx={x}
                    cy={y}
                    r={4.4}
                    fill="none"
                    stroke="var(--color-warn)"
                    strokeWidth={1.6}
                  />
                );
              })}
            </>
          )}

          {stage === "mask" && (
            <>
              {[...positions, -1].map((p) => {
                const { x, y } = p === -1 ? { x: 50, y: 50 } : ringXY(p, params.positions);
                return (
                  <g key={p}>
                    <rect
                      x={x - 5}
                      y={y - 5}
                      width={10}
                      height={10}
                      fill="var(--color-ink-faint)"
                      opacity={0.5}
                    />
                    <rect
                      x={x - 3}
                      y={y - 3}
                      width={6}
                      height={6}
                      fill="var(--color-ink-dim)"
                      opacity={0.6}
                      transform={`rotate(45 ${x} ${y})`}
                    />
                  </g>
                );
              })}
            </>
          )}
        </svg>

        {/* Answer ring: one tappable spot per position, numbered for keys. */}
        {showRing &&
          positions.map((p) => {
            const { x, y } = ringXY(p, params.positions);
            return (
              <button
                key={p}
                type="button"
                data-pos={p}
                onClick={onRingTap}
                aria-label={t("Position {n}", { n: p + 1 })}
                className="touch-target absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--surface-border-strong)] bg-[var(--fill-soft)] text-sm font-semibold text-[var(--color-ink-dim)] active:bg-[var(--fill-active)]"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {p + 1}
              </button>
            );
          })}
      </div>

      <p aria-live="polite" className="min-h-5 text-center text-sm font-medium">
        {feedback === "full" && (
          <span className="text-[var(--color-good)]">✓ {t("Both right")}</span>
        )}
        {feedback === "half" && <span className="text-[var(--color-warn)]">{t("Half right")}</span>}
        {feedback === "miss" && (
          <span className="text-[var(--color-bad)]">✗ {t("Both missed")}</span>
        )}
      </p>

      {stage === "answer-centre" && (
        <div className="grid w-full max-w-xs grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => answerCentre(0)}
            className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] py-3 text-lg font-semibold active:bg-[var(--fill-active)]"
          >
            <span
              aria-hidden
              className="inline-block h-4 w-4 rounded-full bg-[var(--color-accent-2)]"
            />
            {t("Circle")}
          </button>
          <button
            type="button"
            onClick={() => answerCentre(1)}
            className="touch-target flex items-center justify-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] py-3 text-lg font-semibold active:bg-[var(--fill-active)]"
          >
            <span aria-hidden className="inline-block h-4 w-4 bg-[var(--color-accent-2)]" />
            {t("Square")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Filled diamond centred on a ring position. */
function diamondPath(position: number, positions: number): string {
  const { x, y } = ringXY(position, positions);
  const r = 5.2;
  return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
}
