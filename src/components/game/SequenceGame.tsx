"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateSequence,
  scoreSequenceResponse,
  sequenceParams,
} from "@/lib/exercises/sequenceMemory";
import { useT } from "@/lib/i18n/useT";
import { XIcon } from "@/components/ui/icons";
import { PhaseHint, TileGrid, type GameProps } from "./shared";

type Phase = "watch" | "repeat";

export function SequenceGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = sequenceParams(level);
  const [sequence] = useState(() => generateSequence(createRng(seed), params));
  const [phase, setPhase] = useState<Phase>("watch");
  const [litTile, setLitTile] = useState<number | null>(null);
  const [tapped, setTapped] = useState<number[]>([]);
  const [flashTile, setFlashTile] = useState<number | null>(null);
  // A wrong tap marks the tapped tile and reveals the one that was next.
  // The error state carries an ✕ glyph, not colour alone.
  const [errorTile, setErrorTile] = useState<number | null>(null);
  const [revealTile, setRevealTile] = useState<number | null>(null);
  const done = useRef(false);
  // The round-ending tap has happened; ignore taps during the feedback hold.
  const finishing = useRef(false);
  const inputStart = useRef<number | null>(null);

  useEffect(() => {
    if (phase === "repeat") inputStart.current = performance.now();
  }, [phase]);

  // The finish timers below outlive a quit: flipping `done` on unmount keeps
  // a dead round from reporting itself into whatever replaced the session
  // (the same guard the other games grew in #30).
  useEffect(
    () => () => {
      done.current = true;
    },
    [],
  );

  // Playback.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    sequence.forEach((cell, i) => {
      const at = 600 + i * (params.litMs + params.gapMs);
      timers.push(
        setTimeout(() => {
          setLitTile(cell);
          if (soundOn) void audio.playTone(392 + (cell % 4) * 98, Math.min(params.litMs, 260));
        }, at),
      );
      timers.push(setTimeout(() => setLitTile(null), at + params.litMs));
    });
    timers.push(
      setTimeout(
        () => setPhase("repeat"),
        600 + sequence.length * (params.litMs + params.gapMs) + 150,
      ),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (taps: number[], responseMs: number | undefined) => {
      if (done.current) return;
      done.current = true;
      const score = scoreSequenceResponse(sequence, taps);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: score.perfect,
        responseUnits: sequence.length,
        responseMs,
        detail: t("{n} of {total} steps", { n: score.correctPrefix, total: sequence.length }),
        extras: score.perfect ? { maxSequence: sequence.length } : {},
      });
    },
    [sequence, onRoundComplete, t],
  );

  const tap = useCallback(
    (cell: number) => {
      if (phase !== "repeat" || done.current || finishing.current) return;
      const next = [...tapped, cell];
      setTapped(next);
      const correctSoFar = sequence[next.length - 1] === cell;
      // The clock stops at the round-ending tap, not when the feedback hold
      // ends: the hold below is presentation, not answering time.
      const elapsed =
        inputStart.current !== null
          ? Math.round(performance.now() - inputStart.current)
          : undefined;
      if (correctSoFar) {
        setFlashTile(cell);
        setTimeout(() => setFlashTile(null), 180);
        if (soundOn) void audio.playTone(392 + (cell % 4) * 98, 140);
        if (next.length === sequence.length) {
          finishing.current = true;
          setTimeout(() => finish(next, elapsed), 250);
        }
      } else {
        // With sound off a wrong tap used to be visually identical to a right
        // one — the error tone was the only signal, and the round just ended.
        // Mark the wrong tile, show which tile was next, and hold long enough
        // for both to register before the feedback screen takes over.
        finishing.current = true;
        setErrorTile(cell);
        setRevealTile(sequence[next.length - 1]);
        if (soundOn) audio.playError();
        setTimeout(() => finish(next, elapsed), 650);
      }
    },
    [phase, tapped, sequence, soundOn, audio, finish],
  );

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "watch"
          ? t("Watch the sequence…")
          : t("Repeat it — {n}/{total}", { n: tapped.length, total: sequence.length })}
      </PhaseHint>
      <TileGrid
        size={params.gridSize}
        label={t("{size} by {size} tile grid", { size: params.gridSize })}
        renderTile={(i) => {
          const lit = litTile === i || flashTile === i || revealTile === i;
          const error = errorTile === i;
          return (
            <button
              key={i}
              type="button"
              aria-label={t("Tile {n}", { n: i + 1 })}
              disabled={phase !== "repeat"}
              onClick={() => tap(i)}
              data-state={error ? "error" : revealTile === i ? "reveal" : undefined}
              className={`touch-target aspect-square rounded-2xl border transition-all duration-150 ${
                error
                  ? "border-[var(--color-bad)] bg-[var(--color-bad)]/20"
                  : lit
                    ? "scale-[1.04] border-[var(--color-accent-2)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_24px_-4px_var(--color-accent)]"
                    : "border-white/10 bg-white/6 active:bg-white/15"
              }`}
            >
              {error && <XIcon className="mx-auto h-8 w-8 text-[var(--color-bad)]" />}
            </button>
          );
        }}
      />
    </div>
  );
}
