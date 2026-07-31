"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  expectedAnswer,
  generateDigits,
  numberSpanParams,
  scoreSpanResponse,
} from "@/lib/exercises/numberSpan";
import { DigitKeypad, DigitSlots, PhaseHint, type GameProps } from "./shared";

type Phase = "show" | "input";

export function NumberSpanGame({ level, roundIndex, seed, onRoundComplete }: GameProps) {
  const params = numberSpanParams(level, roundIndex);
  const [digits] = useState(() => generateDigits(createRng(seed), params.span));
  const [phase, setPhase] = useState<Phase>("show");
  const [shownIndex, setShownIndex] = useState(-1);
  const [entered, setEntered] = useState<number[]>([]);
  const done = useRef(false);

  // Present digits one at a time, then switch to input.
  useEffect(() => {
    let i = 0;
    setShownIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      i += 1;
      if (i < digits.length) {
        setShownIndex(i);
        timers.push(setTimeout(tick, params.digitMs + params.gapMs));
      } else {
        timers.push(setTimeout(() => setPhase("input"), params.digitMs));
      }
    };
    timers.push(setTimeout(tick, params.digitMs + params.gapMs));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(
    (response: number[]) => {
      if (done.current) return;
      done.current = true;
      const expected = expectedAnswer(digits, params.direction);
      const score = scoreSpanResponse(expected, response);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: score.perfect,
        detail: `Span ${params.span} · ${params.direction === "reverse" ? "reverse" : "forward"}`,
        extras: score.perfect ? { maxSpan: params.span } : {},
      });
    },
    [digits, params.direction, params.span, onRoundComplete],
  );

  const addDigit = useCallback(
    (d: number) => {
      if (phase !== "input") return;
      setEntered((cur) => {
        if (cur.length >= digits.length) return cur;
        const next = [...cur, d];
        if (next.length === digits.length) {
          // Auto-submit on the last digit for one-handed flow.
          setTimeout(() => submit(next), 150);
        }
        return next;
      });
    },
    [phase, digits.length, submit],
  );

  // Physical keyboard support.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "input") return;
      if (/^[0-9]$/.test(e.key)) addDigit(Number(e.key));
      else if (e.key === "Backspace") setEntered((c) => c.slice(0, -1));
      else if (e.key === "Enter") setEntered((c) => (submit(c), c));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, addDigit, submit]);

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "show"
          ? "Memorise the digits…"
          : params.direction === "reverse"
            ? "Enter the digits in REVERSE order"
            : "Enter the digits in order"}
      </PhaseHint>

      {phase === "show" ? (
        <div className="flex h-40 items-center justify-center">
          <span
            aria-hidden
            className="pop-in text-7xl font-bold tabular-nums text-[var(--color-ink)]"
          >
            {shownIndex >= 0 ? digits[shownIndex] : ""}
          </span>
          {/* Announce each digit for screen-reader users. */}
          <span className="sr-only" aria-live="assertive">
            {shownIndex >= 0 ? digits[shownIndex] : ""}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {params.direction === "reverse" && (
            <p className="text-center text-sm font-semibold text-[var(--color-warn)]">
              Backwards! Last digit first.
            </p>
          )}
          <DigitSlots expectedLength={digits.length} entered={entered} />
          <DigitKeypad
            onDigit={addDigit}
            onBackspace={() => setEntered((c) => c.slice(0, -1))}
            onSubmit={() => submit(entered)}
          />
        </div>
      )}
    </div>
  );
}
