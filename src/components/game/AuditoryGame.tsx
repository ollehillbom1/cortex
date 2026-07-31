"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng, randInt } from "@/lib/engine/rng";
import {
  expectedAnswer,
  generateDigits,
  numberSpanParams,
  scoreSpanResponse,
} from "@/lib/exercises/numberSpan";
import { AudioEngine, TONE_FREQUENCIES } from "@/lib/audio/audio";
import { Button } from "@/components/ui/Button";
import { SoundIcon } from "@/components/ui/icons";
import { DigitKeypad, DigitSlots, PhaseHint, type GameProps } from "./shared";

/**
 * Auditory memory. Two genuinely auditory modes:
 * - "speech": digits are spoken aloud (SpeechSynthesis), recalled on a keypad.
 * - "tones": a melody on four pads is played and must be replayed by ear.
 * If no audio is possible at all, we say so and let the user skip — the
 * exercise is never silently converted into a visual one.
 */

type Phase = "arm" | "present" | "input" | "unavailable";

export function AuditoryGame({ level, roundIndex, seed, audio, onRoundComplete }: GameProps) {
  const speechMode = AudioEngine.speechSupported();
  const params = numberSpanParams(level, roundIndex, "auditory");
  const [items] = useState(() => {
    const rng = createRng(seed);
    if (speechMode) return generateDigits(rng, params.span);
    // Tone mode: pad indices 0..3, no immediate repeats.
    const seq: number[] = [];
    const len = Math.max(2, params.span - 1);
    for (let i = 0; i < len; i++) {
      let t = randInt(rng, 0, TONE_FREQUENCIES.length - 1);
      while (i > 0 && t === seq[i - 1]) t = randInt(rng, 0, TONE_FREQUENCIES.length - 1);
      seq.push(t);
    }
    return seq;
  });
  const [phase, setPhase] = useState<Phase>("arm");
  const [entered, setEntered] = useState<number[]>([]);
  const [presentIndex, setPresentIndex] = useState(-1);
  const done = useRef(false);
  const cancelled = useRef(false);
  const inputStart = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      cancelled.current = true;
      audio.cancelSpeech();
    };
  }, [audio]);

  useEffect(() => {
    if (phase === "input") inputStart.current = performance.now();
  }, [phase]);

  const start = async () => {
    // Muted sound makes an auditory exercise unplayable — say so instead of
    // silently flashing through an inaudible presentation.
    if (audio.muted || audio.volume === 0) {
      setPhase("unavailable");
      return;
    }
    const unlocked = await audio.unlock();
    if (!unlocked && !speechMode) {
      setPhase("unavailable");
      return;
    }
    setPhase("present");
    for (let i = 0; i < items.length; i++) {
      if (cancelled.current) return;
      setPresentIndex(i);
      if (speechMode) {
        await audio.speakDigit(items[i]);
        await wait(params.gapMs + 150);
      } else {
        await audio.playTone(TONE_FREQUENCIES[items[i]], 420);
        await wait(230);
      }
    }
    if (!cancelled.current) {
      setPresentIndex(-1);
      setPhase("input");
    }
  };

  const submit = useCallback(
    (response: number[]) => {
      if (done.current) return;
      done.current = true;
      const expected = speechMode ? expectedAnswer(items, params.direction) : items;
      const score = scoreSpanResponse(expected, response);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: score.perfect,
        responseMs:
          inputStart.current !== null
            ? Math.round(performance.now() - inputStart.current)
            : undefined,
        detail: speechMode
          ? `${items.length} spoken digits · ${params.direction}`
          : `${items.length}-note melody`,
        extras: score.perfect && speechMode ? { maxSpan: items.length } : {},
      });
    },
    [items, params.direction, speechMode, onRoundComplete],
  );

  const addDigit = useCallback(
    (d: number) => {
      setEntered((cur) => {
        if (cur.length >= items.length) return cur;
        const next = [...cur, d];
        if (next.length === items.length) setTimeout(() => submit(next), 150);
        return next;
      });
    },
    [items.length, submit],
  );

  const tapPad = (pad: number) => {
    void audio.playTone(TONE_FREQUENCIES[pad], 300);
    addDigit(pad);
  };

  if (phase === "unavailable") {
    return (
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        <SoundIcon className="h-10 w-10 text-[var(--color-ink-faint)]" />
        <p className="font-semibold">Audio is not available</p>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {audio.muted || audio.volume === 0
            ? "Sound is turned off for this profile, and Sound Span only works by ear. Enable sound under Profile → Preferences, then try again — or skip this exercise."
            : "This browser could not start sound playback, and Sound Span only works by ear. Check your volume or silent switch and try again, or skip this exercise."}
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setPhase("arm")}>
            Try again
          </Button>
          <Button
            onClick={() =>
              onRoundComplete({ accuracy: 0, perfect: false, detail: "Skipped — no audio" })
            }
          >
            Skip exercise
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "arm" && "Sound on? Tap play when you are ready to listen."}
        {phase === "present" && (speechMode ? "Listen to the digits…" : "Listen to the melody…")}
        {phase === "input" &&
          (speechMode
            ? params.direction === "reverse"
              ? "Enter the digits in REVERSE order"
              : "Enter the digits you heard"
            : "Replay the melody on the pads")}
      </PhaseHint>

      {phase === "arm" && (
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => void start()} aria-label="Play the audio sequence">
            <SoundIcon className="h-5 w-5" /> Play sequence
          </Button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {speechMode
              ? `${items.length} digits will be spoken.`
              : `${items.length} notes will play.`}
          </p>
        </div>
      )}

      {phase === "present" && (
        <div className="flex h-36 items-center justify-center" aria-hidden>
          <div className="flex items-center gap-2">
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full transition-all duration-200 ${
                  i === presentIndex
                    ? "scale-150 bg-[var(--color-accent-2)]"
                    : i < presentIndex
                      ? "bg-[var(--color-accent)]/60"
                      : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {phase === "input" && speechMode && (
        <div className="flex flex-col gap-6">
          {params.direction === "reverse" && (
            <p className="text-center text-sm font-semibold text-[var(--color-warn)]">
              Backwards! Last digit first.
            </p>
          )}
          <DigitSlots expectedLength={items.length} entered={entered} />
          <DigitKeypad
            onDigit={addDigit}
            onBackspace={() => setEntered((c) => c.slice(0, -1))}
            onSubmit={() => submit(entered)}
          />
        </div>
      )}

      {phase === "input" && !speechMode && (
        <div className="flex flex-col gap-5">
          <DigitSlots expectedLength={items.length} entered={entered} />
          <div
            className="mx-auto grid w-full max-w-xs grid-cols-2 gap-3"
            role="group"
            aria-label="Sound pads"
          >
            {TONE_FREQUENCIES.map((_, pad) => (
              <button
                key={pad}
                type="button"
                aria-label={`Sound pad ${pad + 1}`}
                onClick={() => tapPad(pad)}
                className={`touch-target aspect-square rounded-2xl border border-white/10 text-2xl font-bold transition-transform active:scale-95 ${
                  ["bg-violet-500/30", "bg-cyan-500/30", "bg-emerald-500/30", "bg-amber-500/30"][
                    pad
                  ]
                }`}
              >
                {pad + 1}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => submit(entered)} className="mx-auto">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
