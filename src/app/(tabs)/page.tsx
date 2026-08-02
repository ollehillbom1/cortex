"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EXERCISES, MODALITY_LABELS, type SessionRecord } from "@/lib/domain/types";
import { getStorage } from "@/lib/storage/db";
import {
  dailyPlanSeed,
  planSession,
  PLAN_HISTORY_WINDOW,
  sessionTargetMinutes,
} from "@/lib/session/planner";
import { levelProgress } from "@/lib/progression/xp";
import { dayKey, displayedStreak, streakAtRisk } from "@/lib/progression/streak";
import { strengthsAndFocus } from "@/lib/stats/aggregate";
import {
  META_BACKUP_REMINDER_DISMISSED_AT,
  META_LAST_EXPORT_AT,
  shouldRemindBackup,
} from "@/lib/storage/backupReminder";
import { deriveInsights, META_INSIGHTS_DISMISSED_DAY, type Insight } from "@/lib/insights/engine";
import { coachLocaleOf, rephraseInsight } from "@/lib/coach/client";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BoltIcon, ChevronRightIcon, ClockIcon, FlameIcon } from "@/components/ui/icons";

export default function HomePage() {
  const router = useRouter();
  const { ready, profile } = useProfiles();
  const { t, locale } = useT();
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [backupHint, setBackupHint] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);

  useEffect(() => {
    if (ready && !profile) router.replace("/welcome");
  }, [ready, profile, router]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const storage = getStorage();
      const list = await storage.listSessions(profile.id, 30);
      if (cancelled) return;
      setSessions(list);
      const [lastExportAt, dismissedAt, insightsDismissedDay] = await Promise.all([
        storage.getMeta(META_LAST_EXPORT_AT),
        storage.getMeta(META_BACKUP_REMINDER_DISMISSED_AT),
        storage.getMeta(META_INSIGHTS_DISMISSED_DAY),
      ]);
      if (!cancelled) {
        setBackupHint(
          shouldRemindBackup({
            lastExportAt: lastExportAt ?? null,
            dismissedAt: dismissedAt ?? null,
            sessionCount: list.length,
            now: new Date(),
          }),
        );
        const todayKey = dayKey(new Date());
        if (insightsDismissedDay !== todayKey) {
          const insights = deriveInsights({ profile, sessions: list, today: todayKey }, t);
          setInsight(insights[0] ?? null);
          // Opt-in phrasing pass: structured facts only, cached for the day,
          // and the original wording stays whenever the coach is off,
          // unreachable or its output failed validation.
          if (insights[0] && profile.preferences.aiCoach) {
            const reworded = await rephraseInsight(
              storage,
              insights[0],
              coachLocaleOf(locale),
              todayKey,
            );
            if (!cancelled) setInsight(reworded);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, t, locale]);

  const dismissBackupHint = async () => {
    setBackupHint(false);
    await getStorage().setMeta(META_BACKUP_REMINDER_DISMISSED_AT, new Date().toISOString());
  };

  const dismissInsight = async () => {
    setInsight(null);
    await getStorage().setMeta(META_INSIGHTS_DISMISSED_DAY, dayKey(new Date()));
  };

  const today = dayKey(new Date());

  const plan = useMemo(() => {
    if (!profile || sessions === null) return null;
    // Same seed, history window and target as the runner, so this preview is
    // the session that actually starts.
    const minutesDone = sessions
      .filter((s) => dayKey(new Date(s.startedAt)) === today)
      .reduce((a, s) => a + s.durationMs / 60_000, 0);
    return planSession({
      profile,
      recentSessions: sessions.slice(0, PLAN_HISTORY_WINDOW),
      seed: dailyPlanSeed(today),
      targetMinutes: sessionTargetMinutes(profile.preferences.dailyGoalMinutes, minutesDone),
    });
  }, [profile, sessions, today]);

  // A plan may repeat an exercise across blocks to fill the time budget;
  // name each exercise once in the preview.
  const planExercises = plan ? [...new Set(plan.items.map((i) => i.exerciseId))] : [];

  if (!ready || !profile) return null;

  const progress = levelProgress(profile.xp);
  const streak = displayedStreak(profile.streak, today);
  const atRisk = streakAtRisk(profile.streak, today) && profile.streak.lastActiveDay !== today;

  const todaysSessions = (sessions ?? []).filter((s) => dayKey(new Date(s.startedAt)) === today);
  const minutesToday = todaysSessions.reduce((a, s) => a + s.durationMs / 60_000, 0);
  const goal = profile.preferences.dailyGoalMinutes;
  const goalDone = minutesToday >= goal;

  const { strengths, focus } = strengthsAndFocus(profile);
  const recent = (sessions ?? []).slice(0, 3);

  const hello = t(
    new Date().getHours() < 5
      ? "Night owl"
      : new Date().getHours() < 12
        ? "Good morning"
        : new Date().getHours() < 18
          ? "Good afternoon"
          : "Good evening",
  );

  return (
    <div className="flex flex-col gap-5 pt-2">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--color-ink-dim)]">
            {hello}, {profile.name}
          </p>
          <h1 className="text-2xl font-bold">
            <span className="text-gradient">Cortex</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
              atRisk
                ? "bg-[var(--color-warn)]/15 text-[var(--color-warn)]"
                : "bg-white/8 text-[var(--color-ink-dim)]"
            }`}
            title={atRisk ? t("Train today to keep your streak") : t("Daily streak")}
          >
            <FlameIcon className="h-4 w-4" />
            {streak}
          </span>
          <Link
            href="/profile"
            aria-label={t("Profile: {name}", { name: profile.name })}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-xl"
            style={{ background: `hsl(${profile.avatarHue} 60% 25% / 0.6)` }}
          >
            <span aria-hidden>{profile.avatar}</span>
          </Link>
        </div>
      </header>

      {/* Backup reminder (calm, dismissible, snoozes for 14 days) */}
      {backupHint && (
        <section
          className="card flex items-start gap-3 border-[var(--color-warn)]/25 p-4"
          aria-label={t("Backup reminder")}
        >
          <span aria-hidden className="text-lg">
            💾
          </span>
          <div className="flex-1 text-sm">
            <p className="font-semibold">{t("Back up your progress?")}</p>
            <p className="mt-0.5 text-[var(--color-ink-dim)]">
              {t("Your training lives only in this browser. A quick JSON export keeps it safe.")}
            </p>
            <div className="mt-2 flex gap-4">
              <Link href="/profile" className="font-semibold text-[var(--color-accent-2)]">
                {t("Export now")}
              </Link>
              <button
                type="button"
                onClick={() => void dismissBackupHint()}
                className="text-[var(--color-ink-faint)] underline"
              >
                {t("Remind me later")}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Insight of the day (rule-based, from the user's own data) */}
      {insight && (
        <section className="card flex items-start gap-3 p-4" aria-label={t("Training insight")}>
          <span aria-hidden className="text-lg">
            💡
          </span>
          <p className="flex-1 text-sm leading-snug text-[var(--color-ink-dim)]">{insight.text}</p>
          <button
            type="button"
            onClick={() => void dismissInsight()}
            aria-label={t("Dismiss insight for today")}
            className="touch-target -m-2 flex items-center justify-center p-2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </section>
      )}

      {/* Level */}
      <section className="card p-4" aria-label={t("Level progress")}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">{t("Level {n}", { n: progress.level })}</p>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {progress.inLevel}/{progress.needed} XP
          </p>
        </div>
        <ProgressBar fraction={progress.fraction} label={t("Level progress")} className="mt-2" />
      </section>

      {/* Today's training */}
      <section className="card relative overflow-hidden p-5" aria-label={t("Today's training")}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-accent)]/20 blur-3xl"
        />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("Today's training")}</h2>
          {goalDone && (
            <span className="rounded-full bg-[var(--color-good)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-good)]">
              {t("Goal reached ✓")}
            </span>
          )}
        </div>
        {plan && plan.items.length === 0 ? (
          // Sound off plus "leave out exercises that need sight" removes every
          // exercise. Say so instead of offering a session of blocks that
          // cannot be played.
          <div className="mt-3">
            <p className="text-sm text-[var(--color-ink-dim)]">
              {t(
                "No exercises can be played with your current settings: sound is off and exercises that need sight are left out. Turn sound on, or allow exercises that need sight, in Profile.",
              )}
            </p>
            <Link href="/profile" className="contents">
              <Button variant="ghost" className="mt-3 w-full">
                {t("Open Profile")}
              </Button>
            </Link>
          </div>
        ) : plan ? (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-ink-dim)]">
              <ClockIcon className="h-4 w-4" />
              {t("about {min} min · {count} exercises", {
                min: plan.estimatedMinutes,
                count: planExercises.length,
              })}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.modalities.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[var(--color-ink-dim)]"
                >
                  {t(MODALITY_LABELS[m])}
                </span>
              ))}
            </div>
            <div className="mt-3 text-sm text-[var(--color-ink-dim)]">
              {planExercises.map((id, idx) => (
                <span key={id}>
                  {idx > 0 && " · "}
                  {t(EXERCISES[id].name)}
                </span>
              ))}
            </div>
            <Link href="/session" className="contents">
              <Button className="mt-4 w-full">
                <BoltIcon className="h-5 w-5" />
                {todaysSessions.length > 0 ? t("Train again") : t("Start session")}
              </Button>
            </Link>
          </>
        ) : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/5" />
        )}
        {goal > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[var(--color-ink-faint)]">
              <span>{t("Daily goal")}</span>
              <span>
                {Math.min(goal, Math.round(minutesToday))}/{goal} min
              </span>
            </div>
            <ProgressBar
              fraction={minutesToday / goal}
              label={t("Daily goal progress")}
              className="mt-1.5"
            />
          </div>
        )}
      </section>

      {/* Strengths / focus */}
      {(strengths.length > 0 || focus.length > 0) && (
        <section className="grid grid-cols-2 gap-3" aria-label={t("Strengths and focus areas")}>
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {t("Strengths")}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {strengths.map((s) => (
                <li key={s.exerciseId} className="text-sm">
                  <span className="font-medium">{t(s.name)}</span>{" "}
                  <span className="text-[var(--color-ink-faint)]">Lv {s.level}</span>
                </li>
              ))}
              {strengths.length === 0 && (
                <li className="text-sm text-[var(--color-ink-faint)]">{t("Train to find out")}</li>
              )}
            </ul>
          </div>
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {t("Worth training")}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {focus.map((s) => (
                <li key={s.exerciseId} className="text-sm">
                  <span className="font-medium">{t(s.name)}</span>{" "}
                  <span className="text-[var(--color-ink-faint)]">Lv {s.level}</span>
                </li>
              ))}
              {focus.length === 0 && (
                <li className="text-sm text-[var(--color-ink-faint)]">{t("Train to find out")}</li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Recent sessions */}
      <section aria-label={t("Recent sessions")}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            {t("Recent")}
          </h2>
          <Link href="/stats" className="flex items-center text-sm text-[var(--color-accent-2)]">
            {t("All stats")} <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="card p-4 text-sm text-[var(--color-ink-dim)]">
            {t("No sessions yet. Your first session takes about {goal} minutes.", { goal })}
          </p>
        ) : (
          <ul className="card divide-y divide-white/6 px-4">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    {s.exercises.map((e) => t(EXERCISES[e.exerciseId].name)).join(" · ") ||
                      t("Session")}
                  </p>
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    {formatWhen(s.startedAt)} · {Math.max(1, Math.round(s.durationMs / 60_000))} min
                  </p>
                </div>
                <span className="text-sm font-semibold text-gradient">+{s.xpEarned} XP</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = dayKey(new Date());
  const day = dayKey(d);
  if (day === today) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
