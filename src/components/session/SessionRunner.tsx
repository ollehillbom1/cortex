"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  MODALITY_LABELS,
  type ExerciseId,
  type ExerciseResult,
  type SessionRecord,
  type SkillState,
} from "@/lib/domain/types";
import { effectiveLevel, initialSkill, updateSkill } from "@/lib/adaptive/engine";
import { xpForRound } from "@/lib/progression/xp";
import { planSession, type PlannedItem } from "@/lib/session/planner";
import { applySession } from "@/lib/session/apply";
import { timeSeed } from "@/lib/engine/rng";
import { getStorage } from "@/lib/storage/db";
import { newId } from "@/lib/storage/profileFactory";
import { getAudioEngine } from "@/lib/audio/audio";
import { INSTRUCTIONS } from "@/lib/exercises/instructions";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { CheckIcon, ClockIcon, XIcon } from "@/components/ui/icons";
import type { GameProps, RoundResult } from "@/components/game/shared";
import { NumberSpanGame } from "@/components/game/NumberSpanGame";
import { SequenceGame } from "@/components/game/SequenceGame";
import { PatternGame } from "@/components/game/PatternGame";
import { NBackGame } from "@/components/game/NBackGame";
import { AuditoryGame } from "@/components/game/AuditoryGame";
import { ReactionGame } from "@/components/game/ReactionGame";
import { SessionSummary } from "./SessionSummary";

const GAMES: Record<ExerciseId, React.ComponentType<GameProps>> = {
  "number-span": NumberSpanGame,
  "sequence-memory": SequenceGame,
  "visual-pattern": PatternGame,
  "n-back": NBackGame,
  "auditory-digits": AuditoryGame,
  "reaction-time": ReactionGame,
};

/** Mounts the right game as a real component so its hooks stay isolated. */
function CurrentGame({ exerciseId, ...props }: GameProps & { exerciseId: ExerciseId }) {
  const Game = GAMES[exerciseId];
  return <Game {...props} />;
}

type Phase = "loading" | "overview" | "instructions" | "playing" | "feedback" | "summary";

export function SessionRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, profile, saveProfile } = useProfiles();
  const audio = getAudioEngine();

  const singleParam = searchParams.get("exercise");
  const single: ExerciseId | null = ALL_EXERCISE_IDS.includes(singleParam as ExerciseId)
    ? (singleParam as ExerciseId)
    : null;

  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<PlannedItem[]>([]);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [roundIndex, setRoundIndex] = useState(0);
  const [skills, setSkills] = useState<Record<string, SkillState>>({});
  const [lastRound, setLastRound] = useState<RoundResult | null>(null);
  const [completed, setCompleted] = useState<ExerciseResult[]>([]);
  const [summaryData, setSummaryData] = useState<ReturnType<typeof applySession> | null>(null);
  const [quitPrompt, setQuitPrompt] = useState(false);

  const blockRounds = useRef<{ result: RoundResult; level: number; xp: number }[]>([]);
  const seedBase = useRef(timeSeed());
  const startedAt = useRef<string>("");
  const persisted = useRef(false);
  // Guards against the feedback auto-advance timer and the Continue button
  // both firing advance() for the same round.
  const advancing = useRef(false);

  // Volume/mute follow the profile.
  useEffect(() => {
    if (profile) {
      audio.volume = profile.preferences.volume;
      audio.muted = !profile.preferences.audioEnabled;
    }
  }, [profile, audio]);

  // Build the plan once the profile is available.
  useEffect(() => {
    if (!ready) return;
    if (!profile) {
      router.replace("/welcome");
      return;
    }
    if (items.length > 0) return;
    let cancelled = false;
    (async () => {
      if (single) {
        const def = EXERCISES[single];
        if (!cancelled) {
          setItems([{ exerciseId: single, rounds: def.defaultRounds }]);
          setEstimatedMinutes(
            Math.max(1, Math.round((def.secondsPerRound * def.defaultRounds) / 60)),
          );
          setPhase("instructions");
        }
      } else {
        const recent = await getStorage().listSessions(profile.id, 10);
        if (cancelled) return;
        const plan = planSession({ profile, recentSessions: recent, seed: seedBase.current });
        setItems(plan.items);
        setEstimatedMinutes(plan.estimatedMinutes);
        setPhase("overview");
      }
      const initial: Record<string, SkillState> = {};
      for (const id of ALL_EXERCISE_IDS) {
        initial[id] = profile.skills[id] ?? initialSkill();
      }
      setSkills(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, profile, single, router, items.length]);

  const currentItem = items[itemIndex];
  const currentDef = currentItem ? EXERCISES[currentItem.exerciseId] : null;
  const soundOn = profile?.preferences.audioEnabled ?? true;

  const beginSession = async () => {
    // User gesture: unlock audio for the whole session.
    if (soundOn) await audio.unlock();
    if (!startedAt.current) startedAt.current = new Date().toISOString();
    setPhase("instructions");
  };

  const beginExercise = async () => {
    if (soundOn) await audio.unlock();
    if (!startedAt.current) startedAt.current = new Date().toISOString();
    blockRounds.current = [];
    setRoundIndex(0);
    setPhase("playing");
  };

  const handleRoundComplete = useCallback(
    (result: RoundResult) => {
      if (!currentItem) return;
      const id = currentItem.exerciseId;
      const skill = skills[id] ?? initialSkill();
      const level = effectiveLevel(skill);
      const elapsedMin = startedAt.current
        ? (Date.now() - new Date(startedAt.current).getTime()) / 60_000
        : 0;
      const fatigue = Math.min(1, elapsedMin / 15);
      const nextSkill = updateSkill(skill, { accuracy: result.accuracy, fatigue });
      const xp = xpForRound({ accuracy: result.accuracy, level, perfect: result.perfect });
      blockRounds.current.push({ result, level, xp });
      setSkills((s) => ({ ...s, [id]: nextSkill }));
      setLastRound(result);
      advancing.current = false;
      setPhase("feedback");
    },
    [currentItem, skills],
  );

  const finalizeBlock = useCallback((): ExerciseResult | null => {
    if (!currentItem || blockRounds.current.length === 0) return null;
    const id = currentItem.exerciseId;
    const rounds = blockRounds.current;
    const accuracy = rounds.reduce((a, r) => a + r.result.accuracy, 0) / rounds.length;
    const responseTimes = rounds
      .map((r) => r.result.responseMs)
      .filter((v): v is number => v !== undefined);
    const details: Record<string, number> = {};
    for (const r of rounds) {
      for (const [k, v] of Object.entries(r.result.extras ?? {})) {
        if (k === "falseAlarms" || k === "falseStarts") details[k] = (details[k] ?? 0) + v;
        else details[k] = Math.max(details[k] ?? 0, v);
      }
    }
    return {
      exerciseId: id,
      rounds: rounds.length,
      accuracy,
      levelBefore: rounds[0].level,
      levelAfter: effectiveLevel(skills[id] ?? initialSkill()),
      xp: rounds.reduce((a, r) => a + r.xp, 0),
      avgResponseMs:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : undefined,
      bestResponseMs: responseTimes.length > 0 ? Math.min(...responseTimes) : undefined,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }, [currentItem, skills]);

  const persistSession = useCallback(
    async (exercises: ExerciseResult[]) => {
      if (!profile || persisted.current || exercises.length === 0) return null;
      persisted.current = true;
      const now = new Date();
      const started = startedAt.current || now.toISOString();
      const xpEarned = exercises.reduce((a, e) => a + e.xp, 0);
      const record: SessionRecord = {
        id: newId(),
        profileId: profile.id,
        type: single ? "single" : "recommended",
        startedAt: started,
        endedAt: now.toISOString(),
        durationMs: now.getTime() - new Date(started).getTime(),
        exercises,
        xpEarned,
        unlocked: [],
      };
      const priorSessions = await getStorage().listSessions(profile.id);
      const playedSkills = { ...profile.skills };
      for (const e of exercises) playedSkills[e.exerciseId] = skills[e.exerciseId];
      const applied = applySession({
        profile: { ...profile, skills: playedSkills },
        session: record,
        priorSessionCount: priorSessions.length,
        now,
      });
      await getStorage().addSession(applied.session);
      await saveProfile(applied.profile);
      return applied;
    },
    [profile, single, skills, saveProfile],
  );

  const advance = useCallback(async () => {
    if (!currentItem || advancing.current) return;
    advancing.current = true;
    if (roundIndex + 1 < currentItem.rounds) {
      setRoundIndex((r) => r + 1);
      setPhase("playing");
      return;
    }
    const block = finalizeBlock();
    const allCompleted = block ? [...completed, block] : completed;
    setCompleted(allCompleted);
    if (itemIndex + 1 < items.length) {
      setItemIndex((i) => i + 1);
      setPhase("instructions");
    } else {
      const applied = await persistSession(allCompleted);
      setSummaryData(applied);
      setPhase("summary");
    }
  }, [currentItem, roundIndex, finalizeBlock, completed, itemIndex, items.length, persistSession]);

  // Auto-advance the feedback interstitial (a Continue button remains).
  useEffect(() => {
    if (phase !== "feedback") return;
    const t = setTimeout(() => void advance(), 1800);
    return () => clearTimeout(t);
  }, [phase, advance]);

  const quit = async (save: boolean) => {
    if (save && completed.length > 0) await persistSession(completed);
    router.push("/");
  };

  const seed = seedBase.current + itemIndex * 1009 + roundIndex * 37;
  const totalRounds = useMemo(() => items.reduce((a, i) => a + i.rounds, 0), [items]);
  const doneRounds =
    items.slice(0, itemIndex).reduce((a, i) => a + i.rounds, 0) +
    roundIndex +
    (phase === "feedback" ? 1 : 0);

  if (!ready || phase === "loading" || !profile) {
    return <div className="min-h-dvh" />;
  }

  if (phase === "summary") {
    return <SessionSummary applied={summaryData} completed={completed} skills={skills} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-safe pt-safe">
      {/* Header: progress + quit */}
      <header className="mb-4 flex items-center gap-3 py-2">
        <div
          className="flex h-2 flex-1 gap-1"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={totalRounds}
          aria-valuenow={doneRounds}
        >
          {items.map((item, i) => (
            <div key={i} className="flex flex-1 gap-0.5">
              {Array.from({ length: item.rounds }, (_, r) => {
                const passed =
                  i < itemIndex ||
                  (i === itemIndex &&
                    (r < roundIndex || (r === roundIndex && phase === "feedback")));
                return (
                  <div
                    key={r}
                    className={`h-full flex-1 rounded-full ${
                      passed
                        ? "bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)]"
                        : "bg-white/12"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="End session"
          onClick={() => setQuitPrompt(true)}
          className="touch-target flex items-center justify-center rounded-full text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center pb-10">
        {phase === "overview" && (
          <div className="rise-in flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Today&apos;s session</h1>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[var(--color-ink-dim)]">
                <ClockIcon className="h-4 w-4" /> about {estimatedMinutes} min · {items.length}{" "}
                exercises
              </p>
            </div>
            <ol className="card divide-y divide-white/6 px-5">
              {items.map((item) => {
                const def = EXERCISES[item.exerciseId];
                const level = effectiveLevel(skills[item.exerciseId] ?? initialSkill());
                return (
                  <li key={item.exerciseId} className="flex items-center justify-between py-3.5">
                    <div>
                      <p className="font-semibold">{def.name}</p>
                      <p className="text-xs text-[var(--color-ink-dim)]">
                        {def.modalities.map((m) => MODALITY_LABELS[m]).join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-dim)]">
                      Lv {level}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Button onClick={() => void beginSession()} className="w-full">
              Start training
            </Button>
          </div>
        )}

        {phase === "instructions" && currentDef && (
          <div className="rise-in flex flex-col gap-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
                Exercise {itemIndex + 1} of {items.length}
              </p>
              <h1 className="mt-1 text-3xl font-bold">{currentDef.name}</h1>
              <p className="mt-1 text-sm text-[var(--color-ink-dim)]">{currentDef.tagline}</p>
              <p className="mt-2 inline-block rounded-full bg-white/8 px-3 py-1 text-xs font-semibold">
                Level {effectiveLevel(skills[currentDef.id] ?? initialSkill())} ·{" "}
                {currentItem?.rounds} round{(currentItem?.rounds ?? 0) > 1 ? "s" : ""}
              </p>
            </div>
            <div className="card p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
                How it works
              </h2>
              <ul className="space-y-2 text-[15px] leading-snug">
                {INSTRUCTIONS[currentDef.id].how.map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-2)]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-white/8 pt-3 text-sm text-[var(--color-ink-dim)]">
                <span className="font-semibold text-[var(--color-ink)]">Scoring: </span>
                {INSTRUCTIONS[currentDef.id].scoring}
              </p>
              {INSTRUCTIONS[currentDef.id].accessibility && (
                <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
                  {INSTRUCTIONS[currentDef.id].accessibility}
                </p>
              )}
            </div>
            <Button onClick={() => void beginExercise()} className="w-full">
              Start {currentDef.name}
            </Button>
          </div>
        )}

        {phase === "playing" && currentItem && currentDef && (
          <div key={`${itemIndex}-${roundIndex}`}>
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
              {currentDef.name} · round {roundIndex + 1}/{currentItem.rounds}
            </p>
            <CurrentGame
              exerciseId={currentItem.exerciseId}
              level={effectiveLevel(skills[currentItem.exerciseId] ?? initialSkill())}
              roundIndex={roundIndex}
              seed={seed}
              audio={audio}
              soundOn={soundOn}
              onRoundComplete={handleRoundComplete}
            />
          </div>
        )}

        {phase === "feedback" && lastRound && (
          <div className="pop-in flex flex-col items-center gap-4 text-center">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full border-2 ${
                lastRound.accuracy >= 0.7
                  ? "border-[var(--color-good)] text-[var(--color-good)]"
                  : "border-[var(--color-warn)] text-[var(--color-warn)]"
              }`}
            >
              {lastRound.accuracy >= 0.7 ? (
                <CheckIcon className="h-10 w-10" />
              ) : (
                <span className="text-2xl font-bold">{Math.round(lastRound.accuracy * 100)}%</span>
              )}
            </div>
            <div>
              <p className="text-xl font-bold">
                {lastRound.perfect
                  ? "Perfect!"
                  : lastRound.accuracy >= 0.7
                    ? "Well done"
                    : "Keep at it"}
              </p>
              {lastRound.detail && (
                <p className="mt-1 text-sm text-[var(--color-ink-dim)]">{lastRound.detail}</p>
              )}
            </div>
            <Button variant="ghost" onClick={() => void advance()}>
              Continue
            </Button>
          </div>
        )}
      </div>

      {/* Quit confirmation */}
      {quitPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="End session?"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="card w-full max-w-md p-5 pb-safe">
            <p className="text-lg font-bold">End this session?</p>
            <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
              {completed.length > 0
                ? `${completed.length} completed exercise${completed.length > 1 ? "s" : ""} will be saved. The current exercise is discarded.`
                : "Nothing has been completed yet, so nothing will be saved."}
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="ghost" onClick={() => setQuitPrompt(false)} className="flex-1">
                Keep training
              </Button>
              <Button variant="danger" onClick={() => void quit(true)} className="flex-1">
                End session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
