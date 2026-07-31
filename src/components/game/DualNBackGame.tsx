"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  DUAL_NBACK_LETTERS,
  dualNBackParams,
  generateDualNBackStream,
  scoreDualNBack,
} from "@/lib/exercises/dualNBack";
import { AudioEngine, TONE_SCALE } from "@/lib/audio/audio";
import { speechLang } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/Button";
import { SoundIcon } from "@/components/ui/icons";
import { PhaseHint, TileGrid, type GameProps } from "./shared";

type Phase = "arm" | "playing" | "unavailable";

/**
 * Dual N-Back: position + sound streams run simultaneously. Sounds are
 * spoken letters (SpeechSynthesis) or, without speech, distinct tones —
 * always genuinely auditory, never silently visual.
 */
export function DualNBackGame({ level, seed, audio, onRoundComplete }: GameProps) {
  const { t, locale } = useT();
  const speechMode = AudioEngine.speechSupported();
  const [params] = useState(() => {
    const base = dualNBackParams(level);
    // Tone fallback has only TONE_SCALE.length distinct sounds.
    return speechMode ? base : { ...base, sounds: TONE_SCALE.length };
  });
  const [stream] = useState(() => generateDualNBackStream(createRng(seed), params));
  const [phase, setPhase] = useState<Phase>("arm");
  const [current, setCurrent] = useState(-1);
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [posFeedback, setPosFeedback] = useState<"hit" | "false" | null>(null);
  const [sndFeedback, setSndFeedback] = useState<"hit" | "false" | null>(null);
  const posResponses = useRef<boolean[]>([]);
  const sndResponses = useRef<boolean[]>([]);
  const currentRef = useRef(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelled = useRef(false);
  const done = useRef(false);

  useEffect(
    () => () => {
      cancelled.current = true;
      timers.current.forEach(clearTimeout);
      audio.cancelSpeech();
    },
    [audio],
  );

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const score = scoreDualNBack(stream, posResponses.current, sndResponses.current, params.n);
    onRoundComplete({
      accuracy: score.accuracy,
      perfect: score.perfect,
      detail: t("Position {p}% · Sound {s}%", {
        p: Math.round(score.position.accuracy * 100),
        s: Math.round(score.sound.accuracy * 100),
      }),
      extras: {
        falseAlarms: score.position.falseAlarms + score.sound.falseAlarms,
        hits: score.position.hits + score.sound.hits,
      },
    });
  }, [stream, params.n, onRoundComplete, t]);

  const start = async () => {
    const unlocked = await audio.unlock();
    if (audio.muted || audio.volume === 0 || (!unlocked && !speechMode)) {
      setPhase("unavailable");
      return;
    }
    setPhase("playing");
    const stepMs = params.stimulusMs + params.gapMs;
    stream.position.forEach((_, i) => {
      const at = 900 + i * stepMs;
      timers.current.push(
        setTimeout(() => {
          if (cancelled.current) return;
          currentRef.current = i;
          setCurrent(i);
          setStimulusVisible(true);
          setPosFeedback(null);
          setSndFeedback(null);
          const soundIndex = stream.sound[i].position;
          if (speechMode) {
            void audio.speakText(DUAL_NBACK_LETTERS[soundIndex], speechLang(locale), 1.1);
          } else {
            void audio.playTone(TONE_SCALE[soundIndex], 320);
          }
        }, at),
      );
      timers.current.push(setTimeout(() => setStimulusVisible(false), at + params.stimulusMs));
    });
    timers.current.push(setTimeout(finish, 900 + stream.position.length * stepMs + 200));
  };

  const respond = useCallback(
    (channel: "position" | "sound") => {
      const i = currentRef.current;
      if (i < 0 || done.current) return;
      const responses = channel === "position" ? posResponses : sndResponses;
      if (responses.current[i]) return;
      responses.current[i] = true;
      const item = channel === "position" ? stream.position[i] : stream.sound[i];
      const setFeedback = channel === "position" ? setPosFeedback : setSndFeedback;
      setFeedback(item.isMatch ? "hit" : "false");
    },
    [stream],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        respond("position");
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        respond("sound");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, respond]);

  if (phase === "unavailable") {
    return (
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        <SoundIcon className="h-10 w-10 text-[var(--color-ink-faint)]" />
        <p className="font-semibold">{t("Audio is not available")}</p>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {t(
            "Dual N-Back needs sound for its second stream. Enable sound and check your volume, then try again — or skip this exercise.",
          )}
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setPhase("arm")}>
            {t("Try again")}
          </Button>
          <Button
            onClick={() =>
              onRoundComplete({ accuracy: 0, perfect: false, detail: t("Skipped — no audio") })
            }
          >
            {t("Skip exercise")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "arm") {
    return (
      <div className="flex flex-col items-center gap-4">
        <PhaseHint>{t("Sound on? The letters are spoken aloud.")}</PhaseHint>
        <Button onClick={() => void start()}>
          <SoundIcon className="h-5 w-5" /> {t("Start the stream")}
        </Button>
        <p className="max-w-xs text-center text-xs text-[var(--color-ink-faint)]">
          {t("Position match: left button or the A key. Sound match: right button or the L key.")}
        </p>
      </div>
    );
  }

  const progress = Math.max(0, current + 1);

  return (
    <div className="flex flex-col gap-5">
      <PhaseHint>
        <span className="font-semibold text-[var(--color-ink)]">
          {t("Dual {n}-back", { n: params.n })}
        </span>
        {" · "}
        {progress}/{stream.position.length}
      </PhaseHint>
      <TileGrid
        size={3}
        label={t("N-back position grid")}
        renderTile={(i) => {
          const active = stimulusVisible && current >= 0 && stream.position[current].position === i;
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
      <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-3">
        {(
          [
            { channel: "position", label: t("Position"), feedback: posFeedback },
            { channel: "sound", label: t("Sound"), feedback: sndFeedback },
          ] as const
        ).map(({ channel, label, feedback }) => (
          <div key={channel} className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => respond(channel)}
              className="touch-target w-full rounded-2xl bg-[var(--color-accent)]/85 py-4 text-base font-bold text-white shadow-lg transition-transform active:scale-[0.97]"
            >
              {label}
            </button>
            <p aria-live="polite" className="min-h-5 text-xs font-medium">
              {feedback === "hit" && <span className="text-[var(--color-good)]">✓</span>}
              {feedback === "false" && <span className="text-[var(--color-bad)]">✗</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
