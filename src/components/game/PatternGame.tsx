"use client";

import { useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generatePattern,
  patternParams,
  scorePatternResponse,
} from "@/lib/exercises/visualPattern";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/useT";
import { PhaseHint, TileGrid, type GameProps } from "./shared";

type Phase = "show" | "recall";

export function PatternGame({ level, seed, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = patternParams(level);
  const [pattern] = useState(() => generatePattern(createRng(seed), params));
  const [phase, setPhase] = useState<Phase>("show");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const done = useRef(false);
  const cancelled = useRef(false);
  // Auto-confirm grace timer; cancelled whenever the selection changes again.
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputStart = useRef<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setPhase("recall"), 500 + params.showMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      cancelled.current = true;
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (phase === "recall") inputStart.current = performance.now();
  }, [phase]);

  const toggle = (cell: number) => {
    if (phase !== "recall" || done.current) return;
    const next = new Set(selected);
    if (next.has(cell)) next.delete(cell);
    else next.add(cell);
    setSelected(next);
    // Every other game confirms itself once the answer is complete; requiring
    // an extra "Confirm" tap here was the odd one out. A short grace keeps
    // change-of-mind possible — any further toggle cancels and re-arms it.
    // The button stays for deliberately partial answers.
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (next.size === pattern.length) {
      const answer = [...next];
      confirmTimer.current = setTimeout(() => submit(answer), 650);
    }
  };

  const submit = (answer?: number[]) => {
    // cancelled: the auto-confirm timer may fire after unmount (user quit
    // during the grace); a dead round must not report itself.
    if (done.current || cancelled.current) return;
    done.current = true;
    const score = scorePatternResponse(pattern, answer ?? [...selected]);
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      responseUnits: pattern.length,
      responseMs:
        inputStart.current !== null
          ? Math.round(performance.now() - inputStart.current)
          : undefined,
      detail:
        t("{n} of {total} tiles", { n: score.hits, total: pattern.length }) +
        (score.extras ? `, ${t("{n} wrong", { n: score.extras })}` : ""),
    });
  };

  const patternSet = new Set(pattern);

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "show"
          ? t("Memorise the {n} lit tiles…", { n: pattern.length })
          : t("Rebuild the pattern — {n}/{total} selected", {
              n: selected.size,
              total: pattern.length,
            })}
      </PhaseHint>
      <TileGrid
        size={params.gridSize}
        label={t("{size} by {size} pattern grid", { size: params.gridSize })}
        renderTile={(i) => {
          const showLit = phase === "show" && patternSet.has(i);
          const picked = phase === "recall" && selected.has(i);
          return (
            <button
              key={i}
              type="button"
              aria-label={t("Tile {n}", { n: i + 1 })}
              aria-pressed={phase === "recall" ? selected.has(i) : undefined}
              disabled={phase !== "recall"}
              onClick={() => toggle(i)}
              className={`touch-target aspect-square rounded-2xl border transition-all duration-150 ${
                showLit
                  ? "border-[var(--color-accent-2)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]"
                  : picked
                    ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/40"
                    : "border-white/10 bg-white/6 active:bg-white/15"
              }`}
            />
          );
        }}
      />
      {phase === "recall" && (
        <Button
          onClick={() => submit()}
          disabled={selected.size === 0}
          className="mx-auto w-full max-w-xs"
        >
          {t("Confirm pattern")}
        </Button>
      )}
    </div>
  );
}
