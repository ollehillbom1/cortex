"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  exerciseColor,
  MODALITY_LABELS,
  type ExerciseId,
} from "@/lib/domain/types";
import { effectiveLevel, MIN_LEVEL, recentAccuracy } from "@/lib/adaptive/engine";
import { availableExerciseIds } from "@/lib/exercises/availability";
import { PRACTICE_ROUND_CHOICES } from "@/lib/session/practice";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChevronRightIcon } from "@/components/ui/icons";

export default function ExercisesPage() {
  const { ready, profile } = useProfiles();
  const { t } = useT();
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  // Practice picker state; non-null exercise id means the dialog is open.
  const [practiceFor, setPracticeFor] = useState<ExerciseId | null>(null);
  const [practiceLevel, setPracticeLevel] = useState(1);
  const [practiceRounds, setPracticeRounds] = useState<number | null>(null);
  if (!ready) return null;

  const openPractice = (id: ExerciseId) => {
    const skill = profile?.skills[id];
    setPracticeLevel(skill ? effectiveLevel(skill, EXERCISES[id].maxLevel) : 1);
    setPracticeRounds(null);
    setPracticeFor(id);
  };

  const startPractice = () => {
    if (!practiceFor) return;
    const rounds = practiceRounds !== null ? `&rounds=${practiceRounds}` : "";
    router.push(`/session?exercise=${practiceFor}&level=${practiceLevel}${rounds}`);
  };

  // With "leave out vision-only exercises" on, the library shows the playable
  // ones first; the rest stay reachable behind an explicit toggle.
  const visible = profile && !showAll ? availableExerciseIds(profile) : [...ALL_EXERCISE_IDS];
  const hiddenCount = ALL_EXERCISE_IDS.length - visible.length;

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header>
        <h1 className="text-2xl font-bold">{t("Training library")}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
          {t("Play any exercise on its own — results still count towards your progress.")}
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {visible.map((id) => {
          const def = EXERCISES[id];
          const skill = profile?.skills[id];
          const level = skill ? effectiveLevel(skill, EXERCISES[id].maxLevel) : 1;
          const acc = skill ? recentAccuracy(skill) : null;
          return (
            <li key={id} className="card flex items-center gap-2 p-4">
              <Link
                href={`/session?exercise=${id}`}
                className="flex min-w-0 flex-1 items-center gap-4 transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* Identity dot: the primary modality's colour, so the
                        library, session list and stats read as one system. */}
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: exerciseColor(id) }}
                    />
                    <h2 className="font-bold">{t(def.name)}</h2>
                    {def.maxLevel > MIN_LEVEL && (
                      <span className="rounded-full bg-[var(--fill-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink-dim)]">
                        Lv {level}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[var(--color-ink-dim)]">
                    {t(def.tagline)}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
                    {def.modalities.map((m) => t(MODALITY_LABELS[m])).join(" · ")}
                    {acc !== null && ` · ${t("recent")} ${Math.round(acc * 100)}%`}
                  </p>
                  {(def.requiresVision || def.requiresAudio) && (
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                      {def.requiresVision && def.requiresAudio
                        ? t("Needs sight and sound")
                        : def.requiresVision
                          ? t("Needs sight")
                          : t("Needs sound")}
                    </p>
                  )}
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--color-ink-faint)]" />
              </Link>
              <button
                type="button"
                onClick={() => openPractice(id)}
                aria-label={t("Practice {name} at a level you choose", { name: t(def.name) })}
                className="touch-target shrink-0 rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-dim)] transition-colors active:bg-[var(--fill-active)]"
              >
                {t("Practice")}
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <Button variant="subtle" onClick={() => setShowAll(true)}>
          {t("Show {n} hidden exercises", { n: hiddenCount })}
        </Button>
      )}
      <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">
        {t(
          "Levels adapt to keep each exercise challenging but doable. Scores reflect in-app performance only.",
        )}
      </p>

      {practiceFor && (
        <Dialog label={t("Practice settings")} onClose={() => setPracticeFor(null)}>
          <p className="text-lg font-bold">{t(EXERCISES[practiceFor].name)}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t("Pick a fixed difficulty and go. Practice does not affect XP, streak or level.")}
          </p>

          {EXERCISES[practiceFor].maxLevel > MIN_LEVEL ? (
            <>
              <p className="mt-4 mb-1.5 text-sm text-[var(--color-ink-dim)]">{t("Level")}</p>
              <div
                className="flex items-center justify-center gap-4"
                role="group"
                aria-label={t("Level")}
              >
                <button
                  type="button"
                  onClick={() => setPracticeLevel((l) => Math.max(MIN_LEVEL, l - 1))}
                  disabled={practiceLevel <= MIN_LEVEL}
                  aria-label={t("Lower level")}
                  className="touch-target rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] px-5 py-2.5 text-xl font-bold transition-colors active:bg-[var(--fill-active)] disabled:opacity-40"
                >
                  −
                </button>
                <span
                  className="w-14 text-center text-3xl font-bold tabular-nums"
                  aria-live="polite"
                >
                  {practiceLevel}
                </span>
                <button
                  type="button"
                  // The exercise's own ceiling, not the shared scale: the
                  // stepper ran to 40 everywhere, so practice could be set
                  // to a level whose parameters are identical to the top
                  // real one — the exact false progress the per-exercise
                  // ceiling exists to remove.
                  onClick={() =>
                    setPracticeLevel((l) => Math.min(EXERCISES[practiceFor].maxLevel, l + 1))
                  }
                  disabled={practiceLevel >= EXERCISES[practiceFor].maxLevel}
                  aria-label={t("Raise level")}
                  className="touch-target rounded-2xl border border-[var(--surface-border)] bg-[var(--fill-subtle)] px-5 py-2.5 text-xl font-bold transition-colors active:bg-[var(--fill-active)] disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--color-ink-dim)]">
              {t("This exercise has no difficulty levels — the task is the same every time.")}
            </p>
          )}

          <p className="mt-4 mb-1.5 text-sm text-[var(--color-ink-dim)]">{t("Rounds")}</p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("Rounds")}>
            <button
              type="button"
              onClick={() => setPracticeRounds(null)}
              aria-pressed={practiceRounds === null}
              className={`touch-target rounded-2xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                practiceRounds === null
                  ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/25"
                  : "border-[var(--surface-border)] bg-[var(--fill-subtle)] active:bg-[var(--fill-active)]"
              }`}
            >
              {t("Default")}
            </button>
            {PRACTICE_ROUND_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPracticeRounds(n)}
                aria-pressed={practiceRounds === n}
                className={`touch-target rounded-2xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                  practiceRounds === n
                    ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/25"
                    : "border-[var(--surface-border)] bg-[var(--fill-subtle)] active:bg-[var(--fill-active)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="mt-5 flex gap-3">
            <Button variant="ghost" onClick={() => setPracticeFor(null)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button onClick={startPractice} className="flex-1">
              {t("Start practice")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
