"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import { generateDelay, reactionParams, scoreReaction } from "@/lib/exercises/reaction";
import { useT } from "@/lib/i18n/useT";
import { PhaseHint, type GameProps } from "./shared";

type Phase = "ready" | "waiting" | "go" | "false-start" | "result";

/**
 * One reaction round: arm -> random wait -> GO -> tap. Timing uses
 * performance.now() captured locally; no network involved.
 */
export function ReactionGame({
  level,
  seed,
  roundIndex,
  audio,
  soundOn,
  onRoundComplete,
}: GameProps) {
  const { t } = useT();
  const params = reactionParams(level);
  const [delayMs] = useState(() => {
    const rng = createRng(seed + roundIndex * 7919);
    return generateDelay(rng, params);
  });
  const [phase, setPhase] = useState<Phase>("ready");
  const [resultMs, setResultMs] = useState<number | null>(null);
  const goAt = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The 900 ms result interstitials, tracked separately from the GO timer so
  // unmounting mid-interstitial (quitting the session) cannot let a dead
  // round call onRoundComplete into whatever state the session is in by then.
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (finishTimer.current) clearTimeout(finishTimer.current);
    },
    [],
  );

  const finish = useCallback(
    (round: { kind: "ok"; ms: number } | { kind: "false-start" }) => {
      if (done.current) return;
      done.current = true;
      const score = scoreReaction([round]);
      onRoundComplete({
        accuracy: score.accuracy,
        perfect: round.kind === "ok" && round.ms < 250,
        responseMs: round.kind === "ok" ? round.ms : undefined,
        detail: round.kind === "ok" ? `${round.ms} ms` : t("False start"),
        extras: round.kind === "false-start" ? { falseStarts: 1 } : {},
      });
    },
    [onRoundComplete, t],
  );

  const arm = () => {
    setPhase("waiting");
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
      if (soundOn) void audio.playTone(880, 120);
    }, delayMs);
  };

  const press = useCallback(() => {
    if (phase === "ready") {
      arm();
    } else if (phase === "waiting") {
      if (timer.current) clearTimeout(timer.current);
      setPhase("false-start");
      if (soundOn) audio.playError();
      finishTimer.current = setTimeout(() => finish({ kind: "false-start" }), 900);
    } else if (phase === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      setResultMs(ms);
      setPhase("result");
      if (soundOn) audio.playSuccess();
      finishTimer.current = setTimeout(() => finish({ kind: "ok", ms }), 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, soundOn, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const surface: Record<Phase, { text: string; cls: string }> = {
    ready: { text: t("Tap to arm"), cls: "bg-white/6 border-white/10" },
    waiting: { text: t("Wait for it…"), cls: "bg-[#2a1530] border-[var(--color-accent)]/40" },
    go: {
      text: "GO!",
      cls: "bg-gradient-to-br from-emerald-500 to-cyan-400 border-transparent text-[#04211a]",
    },
    "false-start": { text: t("Too early!"), cls: "bg-[#3a1a1a] border-[var(--color-bad)]/60" },
    result: { text: `${resultMs} ms`, cls: "bg-white/8 border-[var(--color-good)]/50" },
  };

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "ready" && t("Tap the panel, then hold steady until it turns green.")}
        {phase === "waiting" && t("Steady… wait for GO.")}
        {phase === "go" && t("Now!")}
        {phase === "false-start" && t("That was before the signal — it will not count.")}
        {phase === "result" && t("Nice. Next round coming up.")}
      </PhaseHint>
      <button
        type="button"
        onClick={press}
        aria-label={surface[phase].text}
        className={`touch-target mx-auto flex aspect-square w-full max-w-xs select-none items-center justify-center rounded-[2rem] border text-4xl font-extrabold transition-colors duration-100 ${surface[phase].cls}`}
      >
        {surface[phase].text}
      </button>
    </div>
  );
}
