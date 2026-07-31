"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import { generateNBackStream, nBackParams, scoreNBack } from "@/lib/exercises/nback";
import { PhaseHint, TileGrid, type GameProps } from "./shared";

/**
 * One n-back round = one full stimulus stream (~45-60s). The user taps
 * "Match" (or presses space) whenever the position equals the one N steps
 * back. Responses are accepted while a stimulus or its gap is active.
 */
export function NBackGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const params = nBackParams(level);
  const [stream] = useState(() => generateNBackStream(createRng(seed), params));
  const [current, setCurrent] = useState(-1);
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [feedback, setFeedback] = useState<"hit" | "false" | null>(null);
  const responses = useRef<boolean[]>([]);
  const currentRef = useRef(-1);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreNBack(stream, responses.current, params.n);
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      detail: `${score.hits} hits · ${score.misses} missed · ${score.falseAlarms} false alarms`,
      extras: { falseAlarms: score.falseAlarms, hits: score.hits },
    });
  }, [stream, params.n, onRoundComplete]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const stepMs = params.stimulusMs + params.gapMs;
    stream.forEach((_, i) => {
      const at = 900 + i * stepMs;
      timers.push(
        setTimeout(() => {
          currentRef.current = i;
          setCurrent(i);
          setStimulusVisible(true);
          setFeedback(null);
        }, at),
      );
      timers.push(setTimeout(() => setStimulusVisible(false), at + params.stimulusMs));
    });
    timers.push(setTimeout(finish, 900 + stream.length * stepMs + 200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = useCallback(() => {
    const i = currentRef.current;
    if (i < 0 || done.current || responses.current[i]) return;
    responses.current[i] = true;
    const correct = stream[i].isMatch;
    setFeedback(correct ? "hit" : "false");
    if (soundOn) {
      if (correct) audio.playSuccess();
      else audio.playError();
    }
  }, [stream, soundOn, audio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        respond();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [respond]);

  const progress = Math.max(0, current + 1);

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        <span className="font-semibold text-[var(--color-ink)]">{params.n}-back</span>
        {" · "}
        {progress}/{stream.length} — tap Match when the position repeats from {params.n} step
        {params.n > 1 ? "s" : ""} ago
      </PhaseHint>
      <TileGrid
        size={3}
        label="N-back position grid"
        renderTile={(i) => {
          const active = stimulusVisible && current >= 0 && stream[current].position === i;
          return (
            <div
              key={i}
              className={`aspect-square rounded-2xl border transition-all duration-100 ${
                active
                  ? "border-[var(--color-accent-2)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_24px_-4px_var(--color-accent)]"
                  : "border-white/10 bg-white/6"
              }`}
            />
          );
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={respond}
          className="touch-target w-full max-w-xs rounded-2xl bg-[var(--color-accent)]/85 py-4 text-lg font-bold text-white shadow-lg transition-transform active:scale-[0.97]"
        >
          Match
        </button>
        <p aria-live="polite" className="min-h-5 text-sm font-medium">
          {feedback === "hit" && <span className="text-[var(--color-good)]">✓ Correct match</span>}
          {feedback === "false" && (
            <span className="text-[var(--color-bad)]">✗ Not a match — hold steady</span>
          )}
        </p>
      </div>
    </div>
  );
}
