"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateMelody,
  scoreMelodyResponse,
  tonePatternParams,
} from "@/lib/exercises/tonePattern";
import { TONE_SCALE } from "@/lib/audio/audio";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/Button";
import { SoundIcon } from "@/components/ui/icons";
import { DigitSlots, PhaseHint, type GameProps } from "./shared";

type Phase = "arm" | "present" | "input" | "unavailable";

const PAD_COLORS = [
  "bg-violet-500/30",
  "bg-cyan-500/30",
  "bg-emerald-500/30",
  "bg-amber-500/30",
  "bg-rose-500/30",
  "bg-sky-500/30",
];

/** Tone Pattern: replay a melody by ear on labelled sound pads. */
export function TonePatternGame({ level, seed, audio, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = tonePatternParams(level);
  const [melody] = useState(() => generateMelody(createRng(seed), params));
  const [phase, setPhase] = useState<Phase>("arm");
  const [entered, setEntered] = useState<number[]>([]);
  const [presentIndex, setPresentIndex] = useState(-1);
  const [litPad, setLitPad] = useState<number | null>(null);
  const done = useRef(false);
  const cancelled = useRef(false);
  const inputStart = useRef<number | null>(null);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  useEffect(() => {
    if (phase === "input") inputStart.current = performance.now();
  }, [phase]);

  const start = async () => {
    if (audio.muted || audio.volume === 0 || !(await audio.unlock())) {
      setPhase("unavailable");
      return;
    }
    setPhase("present");
    for (let i = 0; i < melody.length; i++) {
      if (cancelled.current) return;
      setPresentIndex(i);
      setLitPad(melody[i]);
      await audio.playTone(TONE_SCALE[melody[i]], params.noteMs);
      setLitPad(null);
      await wait(params.gapMs);
    }
    if (!cancelled.current) {
      setPresentIndex(-1);
      setPhase("input");
    }
  };

  const submit = useCallback(
    (response: number[]) => {
      // cancelled: the auto-submit timer may fire after unmount (user quit
      // during the 150-200 ms grace); a dead round must not report itself.
      if (done.current || cancelled.current) return;
      done.current = true;
      const score = scoreMelodyResponse(melody, response);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: score.perfect,
        responseUnits: melody.length,
        responseMs:
          inputStart.current !== null
            ? Math.round(performance.now() - inputStart.current)
            : undefined,
        detail: t("{n} of {total} notes", { n: score.correctPrefix, total: melody.length }),
        extras: score.perfect ? { maxMelody: melody.length } : {},
      });
    },
    [melody, onRoundComplete, t],
  );

  const tapPad = (pad: number) => {
    if (phase !== "input" || done.current) return;
    void audio.playTone(TONE_SCALE[pad], 260);
    setEntered((cur) => {
      if (cur.length >= melody.length) return cur;
      const next = [...cur, pad];
      if (next.length === melody.length) setTimeout(() => submit(next), 200);
      return next;
    });
  };

  if (phase === "unavailable") {
    return (
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        <SoundIcon className="h-10 w-10 text-[var(--color-ink-faint)]" />
        <p className="font-semibold">{t("Audio is not available")}</p>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {t(
            "Tone Pattern only works by ear. Enable sound and check your volume, then try again — or skip this exercise.",
          )}
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setPhase("arm")}>
            {t("Try again")}
          </Button>
          <Button
            onClick={() =>
              onRoundComplete({
                accuracy: 0,
                perfect: false,
                unavailable: true,
                detail: t("Skipped — no audio"),
              })
            }
          >
            {t("Skip exercise")}
          </Button>
        </div>
      </div>
    );
  }

  const cols = params.pads <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "arm" && t("Sound on? Tap play when you are ready to listen.")}
        {phase === "present" && t("Listen to the melody…")}
        {phase === "input" && t("Replay the melody on the pads")}
      </PhaseHint>

      {phase === "arm" && (
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => void start()} aria-label={t("Play the audio sequence")}>
            <SoundIcon className="h-5 w-5" /> {t("Play sequence")}
          </Button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {t("{n} notes will play.", { n: melody.length })}
          </p>
        </div>
      )}

      {phase === "present" && (
        <div className="flex h-24 items-center justify-center" aria-hidden>
          <div className="flex items-center gap-2">
            {melody.map((_, i) => (
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

      {(phase === "present" || phase === "input") && (
        <div className="flex flex-col gap-5">
          {phase === "input" && <DigitSlots expectedLength={melody.length} entered={entered} />}
          <div
            className={`mx-auto grid w-full max-w-xs gap-3 ${cols}`}
            role="group"
            aria-label={t("Sound pads")}
          >
            {Array.from({ length: params.pads }, (_, pad) => (
              <button
                key={pad}
                type="button"
                aria-label={t("Sound pad {n}", { n: pad + 1 })}
                disabled={phase !== "input"}
                onClick={() => tapPad(pad)}
                className={`touch-target aspect-square rounded-2xl border text-2xl font-bold transition-all duration-100 ${
                  litPad === pad
                    ? "scale-[1.05] border-[var(--color-accent-2)] shadow-[0_0_20px_-4px_var(--color-accent)]"
                    : "border-white/10"
                } ${PAD_COLORS[pad]} ${phase === "input" ? "active:scale-95" : ""}`}
              >
                {pad + 1}
              </button>
            ))}
          </div>
          {phase === "input" && (
            <Button variant="ghost" onClick={() => submit(entered)} className="mx-auto">
              {t("Done")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
