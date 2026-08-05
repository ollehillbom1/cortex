"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/engine/rng";
import {
  MIN_PLAUSIBLE_MS,
  REACTION_DEADLINE_MS,
  generateDelay,
  reactionParams,
  scoreReaction,
} from "@/lib/exercises/reaction";
import { useT } from "@/lib/i18n/useT";
import { PhaseHint, type GameProps } from "./shared";

type Phase = "ready" | "waiting" | "go" | "false-start" | "result" | "timeout";

/**
 * One reaction round: arm -> random wait -> GO -> tap. Timing uses
 * performance.now() captured locally; no network involved.
 */
export function ReactionGame({
  // `level` is deliberately not destructured: this exercise has no difficulty
  // scale, so consuming one would reintroduce the number that never mattered.
  seed,
  roundIndex,
  audio,
  soundOn,
  onRoundComplete,
}: GameProps) {
  const { t } = useT();
  const params = reactionParams();
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
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (finishTimer.current) clearTimeout(finishTimer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
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
    timer.current = setTimeout(() => setPhase("go"), delayMs);
  };

  /**
   * Start the clock once the GO frame has actually been painted.
   *
   * Stamping it inside the timeout put React's render and the browser's paint
   * inside the measured time, and put a slow device's rendering into the
   * user's personal best. Two nested animation frames is the usual
   * approximation of "the frame the user could see".
   *
   * The GO tone is gone on purpose: with sound on, users reacted to the tone
   * (which fires before paint) and with sound off to the panel, so the same
   * record mixed two different stimuli. The exercise is declared visual, so
   * the stimulus is the panel. Success and false-start sounds are unchanged.
   */
  useEffect(() => {
    if (phase !== "go") return;
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => {
        if (!cancelled) goAt.current = performance.now();
      });
      frame.current = inner;
    });
    frame.current = outer;
    return () => {
      cancelled = true;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [phase]);

  // A round with no answer used to hang for ever; the phase existed, nothing
  // ever entered it.
  useEffect(() => {
    if (phase !== "go") return;
    // Nothing is reported: a round nobody answered is missing data, not a
    // failure, and scoring it 0 would punish the user for a phone call or a
    // lock screen. The deadline exists so the round does not hang — the user
    // re-arms it when they are back.
    const deadline = setTimeout(() => setPhase("timeout"), REACTION_DEADLINE_MS);
    return () => clearTimeout(deadline);
  }, [phase, finish]);

  const press = useCallback(() => {
    if (phase === "ready" || phase === "timeout") {
      arm();
    } else if (phase === "waiting") {
      if (timer.current) clearTimeout(timer.current);
      setPhase("false-start");
      if (soundOn) audio.playError();
      finishTimer.current = setTimeout(() => finish({ kind: "false-start" }), 900);
    } else if (phase === "go") {
      // goAt is 0 until the GO frame is painted; a press before that is
      // anticipation, not perception, and so is anything under the floor.
      const ms = goAt.current === 0 ? 0 : Math.round(performance.now() - goAt.current);
      if (ms < MIN_PLAUSIBLE_MS) {
        setPhase("false-start");
        if (soundOn) audio.playError();
        finishTimer.current = setTimeout(() => finish({ kind: "false-start" }), 900);
        return;
      }
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
    timeout: {
      text: t("No answer — tap to try again"),
      cls: "bg-[#3a1a1a] border-[var(--color-warn)]/60",
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <PhaseHint>
        {phase === "ready" && t("Tap the panel, then hold steady until it turns green.")}
        {phase === "waiting" && t("Steady… wait for GO.")}
        {phase === "go" && t("Now!")}
        {phase === "false-start" && t("Too fast to be a reaction — that round does not count.")}
        {phase === "result" && t("Nice. Next round coming up.")}
      </PhaseHint>
      <button
        type="button"
        // pointerdown, not click: on touch, `click` is only dispatched once
        // the browser has decided the gesture was not a scroll — it arrives
        // tens to hundreds of milliseconds late, and is dropped entirely
        // when the browser guesses "scroll". Both outcomes corrupt the one
        // number this exercise exists to produce.
        onPointerDown={press}
        aria-label={surface[phase].text}
        className={`play-surface touch-target mx-auto flex aspect-square w-full max-w-xs select-none items-center justify-center rounded-[2rem] border text-4xl font-extrabold transition-colors duration-100 ${surface[phase].cls}`}
      >
        {surface[phase].text}
      </button>
    </div>
  );
}
