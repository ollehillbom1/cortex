"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  MODALITY_LABELS,
  type ExerciseId,
  type ExerciseResult,
  type Profile,
  type SessionRecord,
  type SkillState,
} from "@/lib/domain/types";
import {
  FATIGUE_FULL_MS,
  MIN_LEVEL,
  effectiveLevel,
  initialSkill,
  updateSkill,
} from "@/lib/adaptive/engine";
import { xpForRound } from "@/lib/progression/xp";
import {
  dailyPlanSeed,
  isRepeatBlock,
  planSession,
  PLAN_HISTORY_WINDOW,
  sessionTargetMinutes,
  type PlannedItem,
} from "@/lib/session/planner";
import { MEASUREMENT_VERSION } from "@/lib/measurement/version";
import { dayKey } from "@/lib/progression/streak";
import { parsePracticeParams } from "@/lib/session/practice";
import { applySession } from "@/lib/session/apply";
import { trackPersonalBest } from "@/lib/session/roundRecords";
import { timeSeed } from "@/lib/engine/rng";
import { getStorage } from "@/lib/storage/db";
import { newId } from "@/lib/storage/profileFactory";
import { getAudioEngine } from "@/lib/audio/audio";
import { INSTRUCTIONS } from "@/lib/exercises/instructions";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CheckIcon, ClockIcon, XIcon } from "@/components/ui/icons";
import type { GameProps, RoundResult } from "@/components/game/shared";
import { NumberSpanGame } from "@/components/game/NumberSpanGame";
import { SequenceGame } from "@/components/game/SequenceGame";
import { PatternGame } from "@/components/game/PatternGame";
import { NBackGame } from "@/components/game/NBackGame";
import { DualNBackGame } from "@/components/game/DualNBackGame";
import { AuditoryGame } from "@/components/game/AuditoryGame";
import { TonePatternGame } from "@/components/game/TonePatternGame";
import { RhythmGame } from "@/components/game/RhythmGame";
import { ReactionGame } from "@/components/game/ReactionGame";
import { GoNoGoGame } from "@/components/game/GoNoGoGame";
import { SessionSummary } from "./SessionSummary";

const GAMES: Record<ExerciseId, React.ComponentType<GameProps>> = {
  "number-span": NumberSpanGame,
  "sequence-memory": SequenceGame,
  "visual-pattern": PatternGame,
  "n-back": NBackGame,
  "dual-n-back": DualNBackGame,
  "auditory-digits": AuditoryGame,
  "tone-pattern": TonePatternGame,
  "rhythm-recall": RhythmGame,
  "reaction-time": ReactionGame,
  "go-no-go": GoNoGoGame,
};

/**
 * Exercises whose accuracy is already speed-derived: reaction IS a response
 * time, and go/no-go misses on the deadline. Feeding their latency into the
 * engine's input-time modulation would count speed twice, and their reported
 * responseMs (~a fraction of a second against a ~50 s round) says nothing
 * about the effort fatigue is meant to track.
 */
const SPEED_DERIVED: ReadonlySet<ExerciseId> = new Set(["reaction-time", "go-no-go"]);

/** Mounts the right game as a real component so its hooks stay isolated. */
function CurrentGame({ exerciseId, ...props }: GameProps & { exerciseId: ExerciseId }) {
  const Game = GAMES[exerciseId];
  return <Game {...props} />;
}

type Phase = "loading" | "overview" | "instructions" | "playing" | "feedback" | "summary";

export function SessionRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, profile, refresh: refreshProfiles } = useProfiles();
  const { t } = useT();
  const audio = getAudioEngine();

  const singleParam = searchParams.get("exercise");
  const single: ExerciseId | null = ALL_EXERCISE_IDS.includes(singleParam as ExerciseId)
    ? (singleParam as ExerciseId)
    : null;
  // Practice: a single exercise at a chosen, fixed level, outside progression.
  const practiceLevelRaw = searchParams.get("level");
  const practiceRoundsRaw = searchParams.get("rounds");
  const practice = useMemo(
    () => (single ? parsePracticeParams(practiceLevelRaw, practiceRoundsRaw) : null),
    [single, practiceLevelRaw, practiceRoundsRaw],
  );

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
  // The round in progress when the app went to the background. A hidden tab
  // freezes timers, so the time away counts as reaction time and as fatigue:
  // the round is discarded and replayed rather than scored.
  const [interrupted, setInterrupted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const blockRounds = useRef<{ result: RoundResult; level: number; xp: number }[]>([]);
  // Records as they stand DURING the session: the profile's records at start,
  // updated as rounds beat them, so the per-round personal-best XP bonus sees
  // a best set two rounds ago instead of paying twice for the same value.
  const sessionRecords = useRef<Profile["records"] | null>(null);
  // State, not a ref: the per-round seed below is derived during render, and
  // refs may not be read there. Lazy init keeps it stable for the session.
  const [seedBase] = useState(timeSeed);
  const startedAt = useRef<string>("");
  const persisted = useRef(false);
  // Milliseconds actually spent answering, which is what fatigue should mean.
  const activePlayMs = useRef(0);
  const sessionId = useRef<string>("");
  // A commit is in flight. Distinct from `persisted`, which means one succeeded.
  const saving = useRef(false);
  // Guards against the feedback auto-advance timer and the Continue button
  // both firing advance() for the same round.
  const advancing = useRef(false);

  // Volume/mute follow the profile. The engine is a module-level singleton, so
  // it is re-fetched here rather than mutated through the render-scope `audio`
  // binding, which React treats as a local variable escaping render.
  useEffect(() => {
    if (!profile) return;
    const engine = getAudioEngine();
    engine.volume = profile.preferences.volume;
    engine.muted = !profile.preferences.audioEnabled;
  }, [profile]);

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
        const rounds = practice?.rounds ?? def.defaultRounds;
        if (!cancelled) {
          setItems([{ exerciseId: single, rounds }]);
          setEstimatedMinutes(Math.max(1, Math.round((def.secondsPerRound * rounds) / 60)));
          setPhase("instructions");
        }
      } else {
        const all = await getStorage().listSessions(profile.id);
        if (cancelled) return;
        // The daily seed, not the session seed: this must rebuild exactly the
        // plan the home screen previewed. Round seeds below stay time-based so
        // two sessions on the same day do not repeat the same digits.
        const today = dayKey(new Date());
        const minutesDone = all
          .filter((s) => dayKey(new Date(s.startedAt)) === today)
          .reduce((a, s) => a + s.durationMs / 60_000, 0);
        const plan = planSession({
          profile,
          recentSessions: all.slice(0, PLAN_HISTORY_WINDOW),
          seed: dailyPlanSeed(today),
          targetMinutes: sessionTargetMinutes(profile.preferences.dailyGoalMinutes, minutesDone),
        });
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
  }, [ready, profile, single, practice, router, items.length, seedBase]);

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
      levelAfter: practice
        ? practice.level
        : effectiveLevel(skills[id] ?? initialSkill(), EXERCISES[id].maxLevel),
      xp: rounds.reduce((a, r) => a + r.xp, 0),
      avgResponseMs:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : undefined,
      bestResponseMs: responseTimes.length > 0 ? Math.min(...responseTimes) : undefined,
      details: Object.keys(details).length > 0 ? details : undefined,
      // Stamp what "level N" meant when this was played, so a later ramp
      // change cannot be plotted as if it were the same task.
      measurementVersion: MEASUREMENT_VERSION[id],
    };
  }, [currentItem, skills, practice]);

  const persistSession = useCallback(
    async (exercises: ExerciseResult[]) => {
      // Two facts, two flags: `saving` is "a commit is in flight" and is set
      // SYNCHRONOUSLY, `persisted` is "a commit succeeded". Moving the second
      // one after the write (so a failure stays retryable) removed the mutual
      // exclusion the single flag used to provide, and both the auto-advance
      // timer and the quit button can enter here at once.
      if (!profile || persisted.current || saving.current || exercises.length === 0) return null;
      saving.current = true;
      const now = new Date();
      const started = startedAt.current || now.toISOString();
      const xpEarned = exercises.reduce((a, e) => a + e.xp, 0);
      // Stable across retries: a second attempt must overwrite the same
      // record, not add a duplicate session.
      if (!sessionId.current) sessionId.current = newId();
      const record: SessionRecord = {
        id: sessionId.current,
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
        // Exclude this session: on a retry after a partial write it is
        // already in storage, and counting it would shift achievements.
        priorSessionCount: priorSessions.filter((s) => s.id !== record.id).length,
        now,
      });
      // One transaction: the session and the progression it produced are a
      // single fact. Written separately, a failure between them left history
      // without XP (or XP without history) and nothing could tell which.
      try {
        await getStorage().commitSession(applied.session, {
          ...applied.profile,
          updatedAt: now.toISOString(),
        });
      } catch (err) {
        // The guard stays down so the user can try again; the summary shows
        // the failure instead of silently claiming the session was saved.
        setSaveError(err instanceof Error ? err.message : "Could not save this session.");
        return null;
      } finally {
        saving.current = false;
      }
      persisted.current = true;
      setSaveError(null);
      await refreshProfiles();
      // Fire-and-forget: push the finished session to synced devices.
      void import("@/lib/sync/engine").then(({ syncNow }) => syncNow(getStorage()));
      return applied;
    },
    [profile, single, skills, refreshProfiles],
  );

  const retrySave = useCallback(async () => {
    setRetrying(true);
    const applied = await persistSession(completed);
    setRetrying(false);
    if (applied) setSummaryData(applied);
  }, [persistSession, completed]);
  /**
   * Leave the current exercise without recording it. Used when the stimulus
   * turned out to be unavailable: there is nothing to score, so the block is
   * dropped rather than saved as a failed one.
   */
  const skipBlock = useCallback(async () => {
    advancing.current = true;
    blockRounds.current = [];
    if (itemIndex + 1 < items.length) {
      setItemIndex((i) => i + 1);
      setPhase("instructions");
    } else {
      const applied = practice ? null : await persistSession(completed);
      setSummaryData(applied);
      setPhase("summary");
    }
  }, [itemIndex, items.length, practice, persistSession, completed]);

  const handleRoundComplete = useCallback(
    (result: RoundResult) => {
      if (!currentItem) return;
      // An unperceivable exercise is missing data, not a failed attempt:
      // no skill update, no XP, no session record, no streak.
      if (result.unavailable) {
        void skipBlock();
        return;
      }
      const id = currentItem.exerciseId;
      const skill = skills[id] ?? initialSkill();
      const maxLevel = EXERCISES[id].maxLevel;
      const level = practice ? practice.level : effectiveLevel(skill, maxLevel);
      // Active play time, not wall clock: the old measure counted instruction
      // screens, interruptions and time spent away as fatigue, so a session
      // read as exhausting because the user paused to read.
      // Speed-derived rounds are excluded for the same reason their latency
      // is: the response IS the measurement, a fraction of a second against
      // seconds of round, so counting it would understate the real effort.
      if (!SPEED_DERIVED.has(id)) activePlayMs.current += result.responseMs ?? 0;
      // Calibrated to answering time, not wall clock. The 15-minute constant
      // belonged to the old wall-clock measure; a whole session is at most
      // ~7 minutes of it, so keeping 15 left fatigue near zero and silently
      // removed the late-session softening it exists to provide.
      const fatigue = Math.min(1, activePlayMs.current / FATIGUE_FULL_MS);
      const nextSkill = updateSkill(
        skill,
        {
          accuracy: result.accuracy,
          fatigue,
          // Speed-derived accuracy must not count speed twice.
          inputMs: SPEED_DERIVED.has(id) ? undefined : result.responseMs,
          responseUnits: SPEED_DERIVED.has(id) ? undefined : result.responseUnits,
        },
        new Date(),
        { gentle: profile?.preferences.kidMode ?? false, maxLevel },
      );
      // Practice stays outside progression: the skill estimate is not fed and
      // no XP accrues — a chosen difficulty must not farm or wreck either.
      let personalBest = false;
      if (!practice && profile) {
        const tracked = trackPersonalBest(
          sessionRecords.current ?? profile.records,
          id,
          result,
          new Date(),
        );
        personalBest = tracked.personalBest;
        sessionRecords.current = tracked.records;
      }
      const xp = practice
        ? 0
        : xpForRound({ accuracy: result.accuracy, level, perfect: result.perfect, personalBest });
      blockRounds.current.push({ result, level, xp });
      if (!practice) setSkills((s) => ({ ...s, [id]: nextSkill }));
      setLastRound(result);
      advancing.current = false;
      setPhase("feedback");
    },
    [currentItem, skills, practice, profile, skipBlock],
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
      // Practice: nothing to persist — no record, no XP, no streak, no sync.
      const applied = practice ? null : await persistSession(allCompleted);
      setSummaryData(applied);
      setPhase("summary");
    }
  }, [
    currentItem,
    roundIndex,
    finalizeBlock,
    completed,
    itemIndex,
    items.length,
    persistSession,
    practice,
  ]);

  // One policy for every exercise: leaving the app abandons the current round
  // instead of scoring whatever the frozen timers produced, and stops any
  // audio that was scheduled. Restarting takes a deliberate tap, which also
  // re-unlocks audio.
  useEffect(() => {
    // Feedback counts: the interstitial auto-advances after 1.8 s whether the
    // page is visible or not, so a phone locked between rounds came back to a
    // round already running whose stimulus was never seen — and it scored.
    // Guarding only the in-round window left one such gap per round.
    if (phase !== "playing" && phase !== "feedback") return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      getAudioEngine().stopAll();
      setInterrupted(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  // Auto-advance the feedback interstitial (a Continue button remains).
  useEffect(() => {
    if (phase !== "feedback" || interrupted) return;
    const t = setTimeout(() => void advance(), 1800);
    return () => clearTimeout(t);
  }, [phase, advance, interrupted]);

  const quit = async (save: boolean) => {
    if (save && !practice && completed.length > 0) {
      const applied = await persistSession(completed);
      if (!applied) {
        // Navigating away here threw the session on the floor: the error and
        // its retry button only exist on the summary screen, and the session
        // id lives in a ref that dies with the component. Show the summary
        // instead, where the failure is visible and retryable.
        setQuitPrompt(false);
        setSummaryData(null);
        setPhase("summary");
        return;
      }
    }
    router.push("/");
  };

  // `attempt` is part of the seed, not just the remount key: without it a
  // replayed round presented the SAME digits, so backgrounding the app while
  // the stimulus was on screen and tapping replay was a one-tap route to a
  // perfect score — in the change whose whole purpose is protecting the
  // measurement.
  const seed = seedBase + itemIndex * 1009 + roundIndex * 37 + attempt * 7919;
  const totalRounds = useMemo(() => items.reduce((a, i) => a + i.rounds, 0), [items]);

  // The plan may repeat an exercise as several blocks to fill the time
  // budget; the overview shows one row per exercise with its total rounds,
  // rather than the same name three times (and duplicate React keys).
  const overview = useMemo(() => {
    const byId = new Map<ExerciseId, number>();
    for (const item of items) {
      byId.set(item.exerciseId, (byId.get(item.exerciseId) ?? 0) + item.rounds);
    }
    return [...byId.entries()].map(([exerciseId, rounds]) => ({ exerciseId, rounds }));
  }, [items]);
  const doneRounds =
    items.slice(0, itemIndex).reduce((a, i) => a + i.rounds, 0) +
    roundIndex +
    (phase === "feedback" ? 1 : 0);

  if (!ready || phase === "loading" || !profile) {
    return <div className="min-h-dvh" />;
  }

  // An empty plan is reachable by URL, bookmark or PWA shortcut when the
  // preferences leave nothing playable. Without this the overview offered a
  // live "Start training" button leading to a blank screen — the same defect
  // as planning a session of exercises the user cannot perceive, one layer
  // down.
  if (items.length === 0) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-4 overflow-y-auto px-6 text-center">
        <h1 className="text-xl font-bold">{t("Nothing to play right now")}</h1>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {t(
            "No exercises can be played with your current settings: sound is off and exercises that need sight are left out. Turn sound on, or allow exercises that need sight, in Profile.",
          )}
        </p>
        <Button onClick={() => router.push("/profile")}>{t("Open Profile")}</Button>
        <Button variant="ghost" onClick={() => router.push("/")}>
          {t("Back")}
        </Button>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <>
        {saveError && (
          <div className="mx-auto w-full max-w-md px-4 pt-safe">
            <p
              role="alert"
              className="card mt-4 border-[var(--color-warn)]/40 p-4 text-sm text-[var(--color-ink)]"
            >
              {t("This session could not be saved.")} {saveError}
            </p>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => void retrySave()}
              disabled={retrying}
            >
              {retrying ? t("Saving…") : t("Try saving again")}
            </Button>
          </div>
        )}
        <SessionSummary applied={summaryData} completed={completed} practice={!!practice} />
      </>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto px-4 pb-safe pt-safe">
      {/* Header: progress + quit */}
      <header className="mb-4 flex items-center gap-3 py-2">
        <div
          className="flex h-2 flex-1 gap-1"
          role="progressbar"
          aria-label={t("Session progress")}
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
          aria-label={t("End session")}
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
              <h1 className="text-2xl font-bold">{t("Today's session")}</h1>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[var(--color-ink-dim)]">
                <ClockIcon className="h-4 w-4" />{" "}
                {t("about {min} min · {count} exercises", {
                  min: estimatedMinutes,
                  count: overview.length,
                })}
              </p>
            </div>
            <ol className="card divide-y divide-white/6 px-5">
              {overview.map((item) => {
                const def = EXERCISES[item.exerciseId];
                const level = effectiveLevel(
                  skills[item.exerciseId] ?? initialSkill(),
                  EXERCISES[item.exerciseId].maxLevel,
                );
                return (
                  <li key={item.exerciseId} className="flex items-center justify-between py-3.5">
                    <div>
                      <p className="font-semibold">{t(def.name)}</p>
                      <p className="text-xs text-[var(--color-ink-dim)]">
                        {def.modalities.map((m) => t(MODALITY_LABELS[m])).join(" · ")} ·{" "}
                        {t("{n} rounds", { n: item.rounds })}
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
              {t("Start training")}
            </Button>
          </div>
        )}

        {phase === "instructions" && currentDef && (
          <div className="rise-in flex flex-col gap-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
                {t("Block {i} of {total}", { i: itemIndex + 1, total: items.length })}
              </p>
              <h1 className="mt-1 text-3xl font-bold">{t(currentDef.name)}</h1>
              <p className="mt-1 text-sm text-[var(--color-ink-dim)]">{t(currentDef.tagline)}</p>
              {practice && (
                <p className="mt-2 text-xs font-semibold text-[var(--color-accent-2)]">
                  {t("Practice — does not affect XP, streak or level")}
                </p>
              )}
              <p className="mt-2 inline-block rounded-full bg-white/8 px-3 py-1 text-xs font-semibold">
                {/* An exercise with no difficulty scale shows rounds only —
                    "Level 1" there is a number that never moves and never
                    meant anything. */}
                {currentDef.maxLevel > MIN_LEVEL && (
                  <>
                    {t("Level {n}", {
                      n: practice
                        ? practice.level
                        : effectiveLevel(
                            skills[currentDef.id] ?? initialSkill(),
                            currentDef.maxLevel,
                          ),
                    })}{" "}
                    ·{" "}
                  </>
                )}
                {t((currentItem?.rounds ?? 0) > 1 ? "{n} rounds" : "{n} round", {
                  n: currentItem?.rounds ?? 0,
                })}
              </p>
            </div>
            {/* A repeat block skips the wall of text the user read minutes
                ago — the plan interleaves repeats on purpose, and up to
                eight full instruction screens per session was dead time. */}
            {isRepeatBlock(items, itemIndex) ? (
              <p className="text-center text-sm text-[var(--color-ink-dim)]">
                {t("Same task as earlier in this session — start when ready.")}
              </p>
            ) : (
              <div className="card p-5">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
                  {t("How it works")}
                </h2>
                <ul className="space-y-2 text-[15px] leading-snug">
                  {INSTRUCTIONS[currentDef.id].how.map((line, i) => (
                    <li key={i} className="flex gap-2.5">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-2)]" />
                      <span>{t(line)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-white/8 pt-3 text-sm text-[var(--color-ink-dim)]">
                  <span className="font-semibold text-[var(--color-ink)]">{t("Scoring:")} </span>
                  {t(INSTRUCTIONS[currentDef.id].scoring)}
                </p>
                {INSTRUCTIONS[currentDef.id].accessibility && (
                  <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
                    {t(INSTRUCTIONS[currentDef.id].accessibility!)}
                  </p>
                )}
              </div>
            )}
            <Button onClick={() => void beginExercise()} className="w-full">
              {t("Start {name}", { name: t(currentDef.name) })}
            </Button>
          </div>
        )}

        {phase === "playing" && interrupted && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-lg font-semibold">{t("Round paused")}</p>
            <p className="max-w-xs text-sm text-[var(--color-ink-dim)]">
              {t(
                "The app was in the background, so this round was not scored — timings there are not comparable. Play it again when you are ready.",
              )}
            </p>
            <Button
              onClick={async () => {
                if (soundOn) await audio.unlock();
                setAttempt((n) => n + 1);
                setInterrupted(false);
              }}
            >
              {t("Play this round again")}
            </Button>
          </div>
        )}

        {phase === "playing" && !interrupted && currentItem && currentDef && (
          <div key={`${itemIndex}-${roundIndex}-${attempt}`}>
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
              {t(currentDef.name)} ·{" "}
              {t("round {i}/{total}", { i: roundIndex + 1, total: currentItem.rounds })}
            </p>
            <CurrentGame
              exerciseId={currentItem.exerciseId}
              level={
                practice
                  ? practice.level
                  : effectiveLevel(
                      skills[currentItem.exerciseId] ?? initialSkill(),
                      EXERCISES[currentItem.exerciseId].maxLevel,
                    )
              }
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
                  ? t("Perfect!")
                  : lastRound.accuracy >= 0.7
                    ? t("Well done")
                    : t("Keep at it")}
              </p>
              {lastRound.detail && (
                <p className="mt-1 text-sm text-[var(--color-ink-dim)]">{lastRound.detail}</p>
              )}
            </div>
            <Button variant="ghost" onClick={() => void advance()}>
              {t("Continue")}
            </Button>
          </div>
        )}
      </div>

      {/* Quit confirmation */}
      {quitPrompt && (
        <Dialog label={t("End session?")} onClose={() => setQuitPrompt(false)}>
          <p className="text-lg font-bold">{t("End this session?")}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {completed.length > 0
              ? t(
                  completed.length > 1
                    ? "{n} completed exercises will be saved. The current exercise is discarded."
                    : "{n} completed exercise will be saved. The current exercise is discarded.",
                  { n: completed.length },
                )
              : t("Nothing has been completed yet, so nothing will be saved.")}
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => setQuitPrompt(false)} className="flex-1">
              {t("Keep training")}
            </Button>
            <Button variant="danger" onClick={() => void quit(true)} className="flex-1">
              {t("End session")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
