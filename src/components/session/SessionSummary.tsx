"use client";

import Link from "next/link";
import { EXERCISES, type ExerciseResult, type SkillState } from "@/lib/domain/types";
import type { applySession } from "@/lib/session/apply";
import { levelProgress } from "@/lib/progression/xp";
import { achievementById } from "@/lib/progression/achievements";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { FlameIcon, TrophyIcon } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/useT";

const RECORD_LABELS: Record<string, string> = {
  "reaction-time:bestMs": "Best reaction time",
  "number-span:maxSpan": "Longest number span",
  "auditory-digits:maxSpan": "Longest sound span",
  "sequence-memory:maxSequence": "Longest sequence",
};

export function SessionSummary({
  applied,
  completed,
  practice = false,
}: {
  applied: ReturnType<typeof applySession> | null;
  completed: ExerciseResult[];
  skills: Record<string, SkillState>;
  practice?: boolean;
}) {
  const { t } = useT();
  const xpEarned = completed.reduce((a, e) => a + e.xp, 0);
  const meanAccuracy =
    completed.length > 0 ? completed.reduce((a, e) => a + e.accuracy, 0) / completed.length : 0;
  const progress = applied ? levelProgress(applied.profile.xp) : null;
  const unlocked = applied?.unlocked ?? [];
  const newRecords = applied?.newRecords ?? [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-safe pt-safe">
      <div className="flex flex-1 flex-col justify-center gap-5 py-8">
        <div className="rise-in text-center">
          <div className="celebrate mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-4xl shadow-[0_0_50px_-10px_var(--color-accent)]">
            ✓
          </div>
          <h1 className="mt-4 text-3xl font-bold">{t("Session complete")}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t(completed.length !== 1 ? "{n} exercises" : "{n} exercise", {
              n: completed.length,
            })}{" "}
            · {t("{pct}% average accuracy", { pct: Math.round(meanAccuracy * 100) })}
            {!practice && (
              <>
                {" "}
                · <span className="font-semibold text-gradient">+{xpEarned} XP</span>
              </>
            )}
          </p>
          {practice && (
            <p className="mt-1 text-xs font-semibold text-[var(--color-accent-2)]">
              {t("Practice — does not affect XP, streak or level")}
            </p>
          )}
        </div>

        {applied && progress && (
          <div className="card rise-in p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{t("Level {n}", { n: progress.level })}</p>
              <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-dim)]">
                <FlameIcon className="h-4 w-4 text-[var(--color-warn)]" />
                {t("{n}-day streak", { n: applied.profile.streak.current })}
                {applied.freezeUsed && ` ${t("(freeze used)")}`}
              </p>
            </div>
            <ProgressBar
              fraction={progress.fraction}
              label={t("Level {n} progress", { n: progress.level })}
              className="mt-2.5"
            />
            <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
              {t("{xp} XP to level {next}", {
                xp: progress.needed - progress.inLevel,
                next: progress.level + 1,
              })}
            </p>
          </div>
        )}

        <ul className="card rise-in divide-y divide-white/6 px-5">
          {completed.map((e) => {
            const def = EXERCISES[e.exerciseId];
            const levelChanged = e.levelAfter !== e.levelBefore;
            return (
              <li key={e.exerciseId} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold">{t(def.name)}</p>
                  <p className="text-xs text-[var(--color-ink-dim)]">
                    {t("{pct}% accuracy", { pct: Math.round(e.accuracy * 100) })}
                    {e.avgResponseMs !== undefined &&
                      ` · ${t("avg {ms} ms", { ms: e.avgResponseMs })}`}
                    {!practice && ` · +${e.xp} XP`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    levelChanged
                      ? e.levelAfter > e.levelBefore
                        ? "bg-[var(--color-good)]/15 text-[var(--color-good)]"
                        : "bg-[var(--color-warn)]/15 text-[var(--color-warn)]"
                      : "bg-white/8 text-[var(--color-ink-dim)]"
                  }`}
                >
                  {levelChanged ? `Lv ${e.levelBefore} → ${e.levelAfter}` : `Lv ${e.levelAfter}`}
                </span>
              </li>
            );
          })}
        </ul>

        {(newRecords.length > 0 || unlocked.length > 0) && (
          <div className="card rise-in space-y-2.5 p-5">
            {newRecords.map((key) => (
              <p key={key} className="flex items-center gap-2 text-sm">
                <TrophyIcon className="h-4.5 w-4.5 shrink-0 text-[var(--color-warn)]" />
                <span>
                  {t("New personal best — {what}", {
                    what: t(RECORD_LABELS[key] ?? key.replace(/:/g, " ")),
                  })}
                </span>
              </p>
            ))}
            {unlocked.map((id) => {
              const a = achievementById(id);
              if (!a) return null;
              return (
                <p key={id} className="flex items-center gap-2 text-sm">
                  <TrophyIcon className="h-4.5 w-4.5 shrink-0 text-[var(--color-accent-2)]" />
                  <span>
                    {t("Achievement unlocked —")}{" "}
                    <span className="font-semibold">{t(a.title)}</span>: {t(a.description)}
                  </span>
                </p>
              );
            })}
          </div>
        )}

        <p className="rise-in text-center text-sm text-[var(--color-ink-dim)]">
          {t(
            meanAccuracy >= 0.85
              ? "Strong block — difficulty will nudge upwards next time."
              : meanAccuracy >= 0.7
                ? "Right in the training zone. That effortful feeling is the point."
                : "Tough one today — levels adjust so the next session lands closer to your range.",
          )}
        </p>

        <div className="rise-in flex flex-col gap-2.5">
          <Link href="/" className="contents">
            <Button className="w-full">{t("Done")}</Button>
          </Link>
          <Link href="/stats" className="contents">
            <Button variant="ghost" className="w-full">
              {t("View statistics")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
