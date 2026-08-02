"use client";

import type { ReactNode } from "react";
import type { AudioEngine } from "@/lib/audio/audio";
import { useT } from "@/lib/i18n/useT";

/**
 * Shared contract between the session runner and individual game components.
 * A game component renders exactly ONE round and reports its result; the
 * runner owns adaptive difficulty, XP and persistence.
 */

export interface RoundResult {
  /** 0..1, fed to the adaptive engine. */
  accuracy: number;
  perfect: boolean;
  /**
   * The round could not be played at all — the stimulus was unavailable
   * (no speech synthesis, sound switched off mid-round). The runner skips
   * the whole block: an unperceivable exercise is missing data, not a
   * failed attempt, and must never touch skill, XP, records or stats.
   */
  unavailable?: boolean;
  /** Representative response time for this round (reaction-style games). */
  responseMs?: number;
  /**
   * How many things the round asked the user to produce — digits, tiles,
   * notes. Answer time grows with this by construction, so comparing raw
   * milliseconds across levels compares task length, not effort.
   */
  responseUnits?: number;
  /** Short human summary, e.g. "Span 5 · reverse". */
  detail?: string;
  /** Numeric extras aggregated into ExerciseResult.details (max is kept). */
  extras?: Record<string, number>;
}

export interface GameProps {
  level: number;
  roundIndex: number;
  seed: number;
  audio: AudioEngine;
  soundOn: boolean;
  onRoundComplete: (result: RoundResult) => void;
}

/** Status line shown above the play area. aria-live so phases are announced. */
export function PhaseHint({ children }: { children: ReactNode }) {
  return (
    <p
      aria-live="polite"
      className="min-h-6 text-center text-sm font-medium text-[var(--color-ink-dim)]"
    >
      {children}
    </p>
  );
}

/** On-screen digit keypad, mirrored by physical keyboard input in the games. */
export function DigitKeypad({
  onDigit,
  onBackspace,
  onSubmit,
  submitLabel,
  disabled = false,
}: {
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div
      className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2"
      role="group"
      aria-label={t("Digit keypad")}
    >
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(k)}
          className="touch-target rounded-2xl border border-white/10 bg-white/5 py-3.5 text-xl font-semibold tabular-nums transition-colors active:bg-white/15 disabled:opacity-40"
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label={t("Delete last digit")}
        className="touch-target rounded-2xl border border-white/10 bg-white/5 py-3.5 text-lg transition-colors active:bg-white/15 disabled:opacity-40"
      >
        ⌫
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigit(0)}
        className="touch-target rounded-2xl border border-white/10 bg-white/5 py-3.5 text-xl font-semibold tabular-nums transition-colors active:bg-white/15 disabled:opacity-40"
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="touch-target rounded-2xl bg-[var(--color-accent)]/80 py-3.5 text-base font-semibold text-white transition-colors active:bg-[var(--color-accent)] disabled:opacity-40"
      >
        {submitLabel ?? t("Done")}
      </button>
    </div>
  );
}

/** Entered digits, shown as filled slots so length is always visible. */
export function DigitSlots({
  expectedLength,
  entered,
}: {
  expectedLength: number;
  entered: number[];
}) {
  const { t } = useT();
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1.5"
      aria-label={t("Entered {n} of {total} digits", {
        n: entered.length,
        total: expectedLength,
      })}
    >
      {Array.from({ length: expectedLength }, (_, i) => (
        <span
          key={i}
          className={`flex h-10 w-8 items-center justify-center rounded-lg border text-lg font-semibold tabular-nums ${
            i < entered.length
              ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-ink)]"
              : "border-white/10 bg-white/4 text-transparent"
          }`}
        >
          {i < entered.length ? entered[i] : "0"}
        </span>
      ))}
    </div>
  );
}

/** Square tile grid used by sequence, pattern and n-back games. */
export function TileGrid({
  size,
  renderTile,
  label,
}: {
  size: number;
  renderTile: (index: number) => ReactNode;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="mx-auto grid w-full max-w-xs gap-2"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: size * size }, (_, i) => renderTile(i))}
    </div>
  );
}
