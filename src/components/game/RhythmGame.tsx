"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  generateRhythm,
  onsetsFromIntervals,
  rhythmParams,
  scoreRhythm,
} from "@/lib/exercises/rhythm";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/Button";
import { SoundIcon } from "@/components/ui/icons";
import { PhaseHint, type GameProps } from "./shared";

type Phase = "arm" | "listen" | "tap" | "unavailable";

const RHYTHM_FREQ = 660;

/**
 * Rhythm Recall: playback is scheduled on the Web Audio clock (sub-ms
 * jitter); the response is timestamped with performance.now() per tap.
 */
export function RhythmGame({ level, seed, audio, onRoundComplete }: GameProps) {
  const { t } = useT();
  const params = rhythmParams(level);
  const [intervals] = useState(() => generateRhythm(createRng(seed), params));
  const onsets = onsetsFromIntervals(intervals);
  const [phase, setPhase] = useState<Phase>("arm");
  const [pulse, setPulse] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const taps = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const submit = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreRhythm(intervals, taps.current, params.tolerance);
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      detail: t("{n} of {total} intervals in time", {
        n: score.matchedIntervals,
        total: intervals.length,
      }),
      extras: score.perfect ? { maxBeats: onsets.length } : {},
    });
  }, [intervals, params.tolerance, onRoundComplete, t, onsets.length]);

  const start = async () => {
    if (audio.muted || audio.volume === 0 || !(await audio.unlock())) {
      setPhase("unavailable");
      return;
    }
    setPhase("listen");
    const lead = 500;
    for (const onset of onsets) {
      audio.scheduleTone(lead + onset, RHYTHM_FREQ, 130);
      timers.current.push(
        setTimeout(() => {
          setPulse(true);
          timers.current.push(setTimeout(() => setPulse(false), 110));
        }, lead + onset),
      );
    }
    const total = lead + onsets[onsets.length - 1] + 400;
    timers.current.push(setTimeout(() => setPhase("tap"), total));
  };

  const tap = () => {
    if (phase !== "tap" || done.current) return;
    void audio.playTone(RHYTHM_FREQ, 110);
    taps.current.push(performance.now());
    const count = taps.current.length;
    setTapCount(count);
    if (count === onsets.length) {
      timers.current.push(setTimeout(submit, 350));
    }
  };

  if (phase === "unavailable") {
    return (
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        <SoundIcon className="h-10 w-10 text-[var(--color-ink-faint)]" />
        <p className="font-semibold">{t("Audio is not available")}</p>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {t(
            "Rhythm Recall only works by ear. Enable sound and check your volume, then try again — or skip this exercise.",
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

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "arm" && t("Sound on? Tap play when you are ready to listen.")}
        {phase === "listen" && t("Listen to the rhythm…")}
        {phase === "tap" &&
          t("Now tap it back — {n}/{total}", { n: tapCount, total: onsets.length })}
      </PhaseHint>

      {phase === "arm" && (
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => void start()} aria-label={t("Play the audio sequence")}>
            <SoundIcon className="h-5 w-5" /> {t("Play sequence")}
          </Button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {t("A rhythm with {n} beats will play.", { n: onsets.length })}
          </p>
        </div>
      )}

      {(phase === "listen" || phase === "tap") && (
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2" aria-hidden>
            {onsets.map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full transition-colors ${
                  phase === "tap" && i < tapCount ? "bg-[var(--color-accent)]" : "bg-white/15"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={tap}
            disabled={phase !== "tap"}
            aria-label={phase === "tap" ? t("Tap the rhythm here") : t("Listen to the rhythm…")}
            className={`touch-target flex aspect-square w-full max-w-[240px] select-none items-center justify-center rounded-full border text-lg font-bold transition-all duration-100 ${
              pulse
                ? "scale-[1.06] border-[var(--color-accent-2)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_40px_-8px_var(--color-accent)]"
                : phase === "tap"
                  ? "border-[var(--color-accent)]/50 bg-white/6 active:scale-95 active:bg-white/12"
                  : "border-white/10 bg-white/5"
            }`}
          >
            {phase === "tap" ? t("Tap here") : ""}
          </button>
        </div>
      )}
    </div>
  );
}
