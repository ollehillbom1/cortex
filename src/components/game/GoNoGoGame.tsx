"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateGoNoGoTrials,
  goNoGoParams,
  scoreGoNoGo,
  type GoNoGoTrialItem,
} from "@/lib/exercises/goNoGo";
import { useT } from "@/lib/i18n/useT";
import { PhaseHint, type GameProps } from "./shared";

/**
 * One go/no-go round = one stimulus stream (~45-60s). Most stimuli are "go"
 * (tap the panel or press space, fast); some are "no-go" (do nothing). Go
 * and no-go differ by shape AND label, never colour alone: a green circle
 * saying GO, a red octagon saying STOP.
 *
 * The response window opens on the painted frame (double-rAF, the same
 * convention ReactionGame earned in #51) and closes at the deadline; a press
 * after that lands in no trial, so "too slow" and "not at all" are the same
 * miss. Presses between trials are ignored — mashing still loses, because
 * no-go windows collect the extra presses as false alarms.
 */
export function GoNoGoGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = goNoGoParams(level);
  const [trials] = useState<GoNoGoTrialItem[]>(() =>
    generateGoNoGoTrials(createRng(seed), goNoGoParams(level)),
  );
  const [current, setCurrent] = useState(-1);
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [feedback, setFeedback] = useState<"hit" | "false" | null>(null);
  const responses = useRef<(number | null)[]>([]);
  const currentRef = useRef(-1);
  const windowOpen = useRef(false);
  const onsetAt = useRef(0);
  const frame = useRef<number | null>(null);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreGoNoGo(trials, responses.current);
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      responseMs: score.meanGoMs ?? undefined,
      detail: t("{hits} of {go} go · {held} of {stop} stop held", {
        hits: score.hits,
        go: score.hits + score.misses,
        held: score.correctRejections,
        stop: score.correctRejections + score.falseAlarms,
      }),
      extras: { falseAlarms: score.falseAlarms },
    });
  }, [trials, onRoundComplete, t]);

  // Schedule the whole stream up front; cleanup covers a quit mid-round.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 900;
    trials.forEach((trial, i) => {
      at += trial.isiMs;
      const onset = at;
      timers.push(
        setTimeout(() => {
          currentRef.current = i;
          windowOpen.current = true;
          onsetAt.current = 0;
          setCurrent(i);
          setStimulusVisible(true);
          setFeedback(null);
        }, onset),
      );
      timers.push(
        setTimeout(() => {
          windowOpen.current = false;
          setStimulusVisible(false);
        }, onset + params.deadlineMs),
      );
      at = onset + params.deadlineMs;
    });
    timers.push(setTimeout(finish, at + 400));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clock starts on the painted frame, not when the timeout ran: React's
  // render and the browser's paint must not live inside a reaction time.
  useEffect(() => {
    if (current < 0 || !stimulusVisible) return;
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => {
        if (!cancelled) onsetAt.current = performance.now();
      });
      frame.current = inner;
    });
    frame.current = outer;
    return () => {
      cancelled = true;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [current, stimulusVisible]);

  const press = useCallback(() => {
    const i = currentRef.current;
    // Outside any window, before the stimulus painted, or twice in one
    // trial: the press belongs to nothing and scores nothing.
    if (i < 0 || done.current || !windowOpen.current || onsetAt.current === 0) return;
    if (responses.current[i] !== null && responses.current[i] !== undefined) return;
    responses.current[i] = Math.round(performance.now() - onsetAt.current);
    windowOpen.current = false;
    setStimulusVisible(false);
    const correct = trials[i].go;
    setFeedback(correct ? "hit" : "false");
    if (soundOn) {
      if (correct) audio.playSuccess();
      else audio.playError();
    }
  }, [trials, soundOn, audio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const progress = Math.max(0, current + 1);
  const showing = stimulusVisible && current >= 0 ? trials[current] : null;

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {progress}/{trials.length} —{" "}
        {t("tap for the green GO circle, do nothing for the red STOP sign")}
      </PhaseHint>
      <button
        type="button"
        // pointerdown, not click: click arrives late on touch and is dropped
        // when the browser suspects a scroll — see ReactionGame.
        onPointerDown={press}
        aria-label={
          showing ? (showing.go ? t("Go — tap now") : t("Stop — do nothing")) : t("Waiting…")
        }
        className="play-surface touch-target mx-auto flex aspect-square w-full max-w-xs select-none items-center justify-center rounded-[2rem] border border-[var(--surface-border)] bg-[var(--fill-subtle)]"
      >
        {showing ? (
          showing.go ? (
            <span className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 text-3xl font-extrabold text-[#04211a]">
              {t("GO")}
            </span>
          ) : (
            <span
              className="flex h-40 w-40 items-center justify-center bg-gradient-to-br from-red-600 to-red-500 text-3xl font-extrabold text-white"
              style={{
                clipPath:
                  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
              }}
            >
              {t("STOP")}
            </span>
          )
        ) : (
          <span className="text-sm font-medium text-[var(--color-ink-faint)]">
            {current < 0 ? t("Get ready…") : ""}
          </span>
        )}
      </button>
      <p aria-live="polite" className="min-h-5 text-center text-sm font-medium">
        {feedback === "hit" && <span className="text-[var(--color-good)]">✓ {t("Caught it")}</span>}
        {feedback === "false" && (
          <span className="text-[var(--color-bad)]">✗ {t("That was a stop — hold back")}</span>
        )}
      </p>
    </div>
  );
}
