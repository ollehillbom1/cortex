"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EXERCISES, type ExerciseResult, type SkillState } from "@/lib/domain/types";
import type { applySession } from "@/lib/session/apply";
import { levelForXp, levelProgress } from "@/lib/progression/xp";
import { achievementById } from "@/lib/progression/achievements";
import {
  dailyPlanSeed,
  planSession,
  PLAN_HISTORY_WINDOW,
  sessionTargetMinutes,
  type PlannedSession,
} from "@/lib/session/planner";
import { shiftDay } from "@/lib/stats/aggregate";
import { dayKey } from "@/lib/progression/streak";
import { getStorage } from "@/lib/storage/db";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { BoltIcon, ClockIcon, FlameIcon, SnowflakeIcon, TrophyIcon } from "@/components/ui/icons";
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
  // Tomorrow's plan is knowable tonight: the daily seed is a pure function
  // of the day key, so this preview IS the session the home screen will
  // offer tomorrow (given today's history). A concrete reason to come back
  // beats a bare "Done" — and it is a fact, not a nudge.
  const [tomorrow, setTomorrow] = useState<PlannedSession | null>(null);
  useEffect(() => {
    if (!applied || practice) return;
    let cancelled = false;
    (async () => {
      const profile = applied.profile;
      const recent = await getStorage().listSessions(profile.id, PLAN_HISTORY_WINDOW);
      if (cancelled) return;
      const tomorrowKey = shiftDay(dayKey(new Date()), 1);
      setTomorrow(
        planSession({
          profile,
          recentSessions: recent,
          seed: dailyPlanSeed(tomorrowKey),
          targetMinutes: sessionTargetMinutes(profile.preferences.dailyGoalMinutes, 0),
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [applied, practice]);

  const xpEarned = completed.reduce((a, e) => a + e.xp, 0);
  const meanAccuracy =
    completed.length > 0 ? completed.reduce((a, e) => a + e.accuracy, 0) / completed.length : 0;
  const progress = applied ? levelProgress(applied.profile.xp) : null;
  const unlocked = applied?.unlocked ?? [];
  // `:level` records are the same fact as the green "Lv N → M" badge below;
  // announcing them again as "New personal best — number-span level" said it
  // twice, the second time in raw key language. Stats filters them the same
  // way.
  const newRecords = (applied?.newRecords ?? []).filter((k) => !k.endsWith(":level"));
  // A profile level-up is detectable only here: applied.profile.xp already
  // contains this session's XP, so subtracting it gives the level walked in
  // with. Nothing else compares before to after.
  const leveledUp =
    applied !== null &&
    progress !== null &&
    progress.level > levelForXp(applied.profile.xp - applied.session.xpEarned);
  const celebrating = newRecords.length > 0 || unlocked.length > 0 || leveledUp;

  // Nothing was recorded: every block was skipped as unplayable. Celebrating
  // "0% average accuracy" told the user they scored nothing and that their
  // level would be adjusted — the opposite of "this was missing data, not a
  // failed attempt", which is the whole point of skipping the block.
  if (completed.length === 0) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-4 overflow-y-auto px-6 text-center">
        <h1 className="text-2xl font-bold">{t("Nothing was recorded")}</h1>
        <p className="text-sm text-[var(--color-ink-dim)]">
          {t(
            "This session had nothing that could be played, so no result was saved and your levels are unchanged.",
          )}
        </p>
        <Link href="/" className="contents">
          <Button>{t("Back to Today")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto px-4 pb-safe pt-safe">
      <div className="flex flex-1 flex-col justify-center gap-5 py-8">
        <div className="rise-in text-center">
          {/* No pulse here: finishing a session is the routine outcome. The
              pulse lives on the records/level-up card, where it is rare. */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-4xl shadow-[0_0_50px_-10px_var(--color-accent)]">
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
            {applied.freezeEarned && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent-2)]">
                <SnowflakeIcon className="h-3.5 w-3.5 shrink-0" />
                {t("{n} days in a row — you earned a streak freeze. It protects one missed day.", {
                  n: applied.profile.streak.current,
                })}
              </p>
            )}
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

        {celebrating && (
          <div className="card rise-in celebrate space-y-2.5 p-5">
            {leveledUp && progress && (
              <p className="flex items-center gap-2 text-sm">
                <BoltIcon className="h-4.5 w-4.5 shrink-0 text-[var(--color-accent)]" />
                <span>
                  {t("Level up —")}{" "}
                  <span className="font-semibold">{t("Level {n}", { n: progress.level })}</span>
                </span>
              </p>
            )}
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

        {tomorrow && tomorrow.items.length > 0 && (
          <p className="rise-in flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-ink-faint)]">
            <ClockIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("Tomorrow:")}{" "}
              {[...new Set(tomorrow.items.map((i) => i.exerciseId))]
                .map((id) => t(EXERCISES[id].name))
                .join(" · ")}{" "}
              — {t("about {min} min", { min: tomorrow.estimatedMinutes })}
            </span>
          </p>
        )}

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
