"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateSequence,
  scoreSequenceResponse,
  sequenceParams,
} from "@/lib/exercises/sequenceMemory";
import { PhaseHint, TileGrid, type GameProps } from "./shared";

type Phase = "watch" | "repeat";

export function SequenceGame({ level, seed, audio, soundOn, onRoundComplete }: GameProps) {
  const params = sequenceParams(level);
  const [sequence] = useState(() => generateSequence(createRng(seed), params));
  const [phase, setPhase] = useState<Phase>("watch");
  const [litTile, setLitTile] = useState<number | null>(null);
  const [tapped, setTapped] = useState<number[]>([]);
  const [flashTile, setFlashTile] = useState<number | null>(null);
  const done = useRef(false);
  const inputStart = useRef<number | null>(null);

  useEffect(() => {
    if (phase === "repeat") inputStart.current = performance.now();
  }, [phase]);

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
    (taps: number[]) => {
      if (done.current) return;
      done.current = true;
      const score = scoreSequenceResponse(sequence, taps);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: score.perfect,
        responseMs:
          inputStart.current !== null
            ? Math.round(performance.now() - inputStart.current)
            : undefined,
        detail: `${score.correctPrefix} of ${sequence.length} steps`,
        extras: score.perfect ? { maxSequence: sequence.length } : {},
      });
    },
    [sequence, onRoundComplete],
  );

  const tap = (cell: number) => {
    if (phase !== "repeat" || done.current) return;
    setFlashTile(cell);
    setTimeout(() => setFlashTile(null), 180);
    const next = [...tapped, cell];
    setTapped(next);
    const correctSoFar = sequence[next.length - 1] === cell;
    if (soundOn) {
      if (correctSoFar) void audio.playTone(392 + (cell % 4) * 98, 140);
      else audio.playError();
    }
    if (!correctSoFar || next.length === sequence.length) {
      setTimeout(() => finish(next), 250);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "watch"
          ? "Watch the sequence…"
          : `Repeat it — ${tapped.length}/${sequence.length}`}
      </PhaseHint>
      <TileGrid
        size={params.gridSize}
        label={`${params.gridSize} by ${params.gridSize} tile grid`}
        renderTile={(i) => {
          const lit = litTile === i || flashTile === i;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Tile ${i + 1}`}
              disabled={phase !== "repeat"}
              onClick={() => tap(i)}
              className={`touch-target aspect-square rounded-2xl border transition-all duration-150 ${
                lit
                  ? "scale-[1.04] border-[var(--color-accent-2)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_24px_-4px_var(--color-accent)]"
                  : "border-white/10 bg-white/6 active:bg-white/15"
              }`}
            />
          );
        }}
      />
    </div>
  );
}
