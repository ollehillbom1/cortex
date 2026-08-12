"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_EXERCISE_IDS,
  EXERCISES,
  MODALITY_LABELS,
  type ExerciseId,
  type Modality,
  type SessionRecord,
} from "@/lib/domain/types";
import { getStorage } from "@/lib/storage/db";
import { dayKey } from "@/lib/progression/streak";
import {
  accuracyTrend,
  activityByDay,
  DAY_PART_LABELS,
  exerciseLevels,
  levelTrend,
  modalityBalance,
  responseTimeTrend,
  timeOfDayPerformance,
} from "@/lib/stats/aggregate";
import { MEASUREMENT_VERSION, spansMeasurementBreak } from "@/lib/measurement/version";
import { ACHIEVEMENTS } from "@/lib/progression/achievements";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { BalanceBars, DayBars, Sparkline } from "@/components/ui/charts";
import { TrophyIcon } from "@/components/ui/icons";

const RECORD_LABELS: Record<string, { label: string; unit: string; lower?: boolean }> = {
  "reaction-time:bestMs": { label: "Best reaction", unit: "ms", lower: true },
  "number-span:maxSpan": { label: "Number span", unit: "digits" },
  "auditory-digits:maxSpan": { label: "Sound span", unit: "digits" },
  "sequence-memory:maxSequence": { label: "Longest sequence", unit: "steps" },
  "name-recall:maxSpan": { label: "Most names", unit: "faces" },
};

export default function StatsPage() {
  const { ready, profile } = useProfiles();
  const { t } = useT();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selected, setSelected] = useState<ExerciseId>("number-span");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    getStorage()
      .listSessions(profile.id)
      .then((s) => {
        if (!cancelled) setSessions(s);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const today = dayKey(new Date());
  const days = useMemo(() => activityByDay(sessions, today, 28), [sessions, today]);
  const balance = useMemo(() => modalityBalance(sessions), [sessions]);
  const trend = useMemo(() => accuracyTrend(sessions, selected).slice(-20), [sessions, selected]);
  const levels20 = useMemo(() => levelTrend(sessions, selected).slice(-20), [sessions, selected]);
  // A ramp change makes "level N" mean something different; plotting both
  // sides as one line is the chart telling a story that never happened.
  const brokenScale = useMemo(
    () => spansMeasurementBreak(levels20.map((p) => p.measurementVersion)),
    [levels20],
  );
  const latency = useMemo(
    () => responseTimeTrend(sessions, selected).slice(-20),
    [sessions, selected],
  );
  const dayParts = useMemo(
    () => timeOfDayPerformance(sessions).filter((p) => p.sessions >= 3),
    [sessions],
  );

  if (!ready || !profile) return null;

  const totalMinutes = Math.round(sessions.reduce((a, s) => a + s.durationMs / 60_000, 0));
  const levels = exerciseLevels(profile);
  const records = Object.entries(profile.records).filter(([k]) => RECORD_LABELS[k]);
  const unlockedCount = Object.keys(profile.achievements).length;

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header>
        <h1 className="text-2xl font-bold">{t("Statistics")}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
          {t("In-app training performance — what you did here, nothing more.")}
        </p>
      </header>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-3" aria-label={t("Totals")}>
        {[
          { label: t("Sessions"), value: String(sessions.length) },
          { label: t("Minutes"), value: String(totalMinutes) },
          { label: t("Best streak"), value: String(profile.streak.best) },
        ].map((item) => (
          <div key={item.label} className="card p-3.5 text-center">
            <p className="text-2xl font-bold tabular-nums">{item.value}</p>
            <p className="text-xs text-[var(--color-ink-faint)]">{item.label}</p>
          </div>
        ))}
      </section>

      {/* Activity */}
      <section className="card p-5" aria-label={t("Activity over the last four weeks")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Last 4 weeks")}
        </h2>
        <DayBars values={days.map((d) => d.minutes)} label={t("Training minutes per day")} />
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {t("{days} active days · {min} min trained", {
            days: days.filter((d) => d.sessions > 0).length,
            min: Math.round(days.reduce((a, d) => a + d.minutes, 0)),
          })}
        </p>
      </section>

      {/* Per-exercise trends: level first — accuracy is flat by design */}
      <section className="card p-5" aria-label={t("Exercise trends")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Exercise trends")}
        </h2>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t("Choose exercise")}>
          {ALL_EXERCISE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected === id
                  ? "bg-[var(--color-accent)]/25 text-[var(--color-ink)]"
                  : "bg-[var(--fill-subtle)] text-[var(--color-ink-faint)]"
              }`}
            >
              {t(EXERCISES[id].name)}
            </button>
          ))}
        </div>
        {levels20.length > 1 && (
          <>
            <Sparkline
              values={levels20.map((p) => p.value)}
              label={t("{name} level", { name: t(EXERCISES[selected].name) })}
              formatValue={(v) => `Lv ${v.toFixed(0)}`}
            />
            <p className="mb-3 mt-2 text-xs text-[var(--color-ink-faint)]">
              {t(
                "Level per session. This is the progress signal: the difficulty adapts so accuracy stays near its target, and the level climbs when you do.",
              )}
            </p>
            {brokenScale && (
              <p
                role="note"
                className="mb-3 -mt-1 rounded-xl bg-[var(--color-warn)]/10 p-2.5 text-xs text-[var(--color-warn)]"
              >
                {t(
                  "The difficulty of this exercise changed during this period, so a level here does not mean the same thing as a level earlier in the line. Compare within each stretch, not across the change.",
                )}
              </p>
            )}
          </>
        )}
        <Sparkline
          values={trend.map((p) => p.value * 100)}
          label={t("{name} accuracy", { name: t(EXERCISES[selected].name) })}
          formatValue={(v) => `${v.toFixed(0)}%`}
        />
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {trend.length > 0 && trend.length < 5
            ? t("Only {n} session(s) with this exercise so far — read this as a first hint.", {
                n: trend.length,
              })
            : t(
                "Accuracy per session. Flat near 75% means the difficulty is tracking you — look at the level above for progress.",
              )}
        </p>
      </section>

      {/* Response time trend for the selected exercise */}
      {latency.length > 1 && (
        <section className="card p-5" aria-label={t("Response time trend")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            {t(EXERCISES[selected].name)} · {t("response time")}
          </h2>
          <Sparkline
            values={latency.map((p) => p.value)}
            label={t("{name} average response time", { name: t(EXERCISES[selected].name) })}
            formatValue={(v) => `${v.toFixed(0)} ms`}
            invert
          />
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            {selected === "reaction-time"
              ? t("Average reaction per session — lower is faster.")
              : t("Average answer time per session — context for the accuracy trend, not a score.")}
          </p>
        </section>
      )}

      {/* Time of day */}
      {dayParts.length >= 2 && (
        <section className="card p-5" aria-label={t("Accuracy by time of day")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            {t("Time of day")}
          </h2>
          <ul className="space-y-2">
            {dayParts.map((p) => (
              <li key={p.part} className="flex items-center justify-between text-sm">
                <span>{t(DAY_PART_LABELS[p.part])}</span>
                <span className="tabular-nums text-[var(--color-ink-dim)]">
                  {Math.round(p.accuracy * 100)}% ·{" "}
                  {t(p.sessions === 1 ? "{n} session" : "{n} sessions", { n: p.sessions })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            {t("When your sessions score best — an in-app observation, nothing more.")}
          </p>
        </section>
      )}

      {/* Levels */}
      <section className="card p-5" aria-label={t("Exercise levels")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Exercise levels")}
        </h2>
        <ul className="space-y-2">
          {levels.map((l) => (
            <li key={l.exerciseId} className="flex items-center justify-between text-sm">
              <span>{t(l.name)}</span>
              <span className="font-semibold tabular-nums">
                Lv {l.level}
                <span className="ml-2 text-xs font-normal text-[var(--color-ink-faint)]">
                  {t("{n} rounds", { n: l.attempts })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Balance */}
      <section className="card p-5" aria-label={t("Training balance")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Training balance")}
        </h2>
        <BalanceBars
          entries={(Object.keys(balance) as Modality[]).map((m) => ({
            label: t(MODALITY_LABELS[m]),
            fraction: balance[m],
          }))}
        />
      </section>

      {/* Records */}
      {records.length > 0 && (
        <section className="card p-5" aria-label={t("Personal records")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            {t("Personal records")}
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {records.map(([key, rec]) => {
              const exercise = key.split(":")[0] as keyof typeof MEASUREMENT_VERSION;
              const olderEra =
                (rec.measurementVersion ?? 0) !== (MEASUREMENT_VERSION[exercise] ?? 0);
              return (
                <li key={key} className="rounded-xl bg-[var(--fill-subtle)] p-3">
                  <p className="text-lg font-bold tabular-nums">
                    {rec.value}{" "}
                    <span className="text-xs font-normal">{t(RECORD_LABELS[key].unit)}</span>
                  </p>
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    {t(RECORD_LABELS[key].label)}
                    {olderEra && (
                      <span className="ml-1 text-[var(--color-warn)]">
                        {t("· set under an older measurement")}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Achievements */}
      <section className="card p-5" aria-label={t("Achievements")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Achievements")} · {unlockedCount}/{ACHIEVEMENTS.length}
        </h2>
        <ul className="space-y-2.5">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = profile.achievements[a.id] !== undefined;
            return (
              <li key={a.id} className={`flex items-start gap-3 ${unlocked ? "" : "opacity-45"}`}>
                <TrophyIcon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    unlocked ? "text-[var(--color-warn)]" : "text-[var(--color-ink-faint)]"
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold">
                    {t(a.title)}
                    {unlocked && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-good)]">
                        {t("unlocked")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink-dim)]">{t(a.description)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
