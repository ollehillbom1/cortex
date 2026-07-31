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
  modalityBalance,
  responseTimeTrend,
  timeOfDayPerformance,
} from "@/lib/stats/aggregate";
import { ACHIEVEMENTS } from "@/lib/progression/achievements";
import { useProfiles } from "@/components/app/ProfileProvider";
import { BalanceBars, DayBars, Sparkline } from "@/components/ui/charts";
import { TrophyIcon } from "@/components/ui/icons";

const RECORD_LABELS: Record<string, { label: string; unit: string; lower?: boolean }> = {
  "reaction-time:bestMs": { label: "Best reaction", unit: "ms", lower: true },
  "number-span:maxSpan": { label: "Number span", unit: "digits" },
  "auditory-digits:maxSpan": { label: "Sound span", unit: "digits" },
  "sequence-memory:maxSequence": { label: "Longest sequence", unit: "steps" },
};

export default function StatsPage() {
  const { ready, profile } = useProfiles();
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
        <h1 className="text-2xl font-bold">Statistics</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
          In-app training performance — not a medical or IQ measurement.
        </p>
      </header>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-3" aria-label="Totals">
        {[
          { label: "Sessions", value: String(sessions.length) },
          { label: "Minutes", value: String(totalMinutes) },
          { label: "Best streak", value: String(profile.streak.best) },
        ].map((t) => (
          <div key={t.label} className="card p-3.5 text-center">
            <p className="text-2xl font-bold tabular-nums">{t.value}</p>
            <p className="text-xs text-[var(--color-ink-faint)]">{t.label}</p>
          </div>
        ))}
      </section>

      {/* Activity */}
      <section className="card p-5" aria-label="Activity over the last four weeks">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Last 4 weeks
        </h2>
        <DayBars values={days.map((d) => d.minutes)} label="Training minutes per day" />
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {days.filter((d) => d.sessions > 0).length} active days ·{" "}
          {Math.round(days.reduce((a, d) => a + d.minutes, 0))} min trained
        </p>
      </section>

      {/* Accuracy trend */}
      <section className="card p-5" aria-label="Accuracy trend">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Accuracy trend
        </h2>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose exercise">
          {ALL_EXERCISE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected === id
                  ? "bg-[var(--color-accent)]/25 text-[var(--color-ink)]"
                  : "bg-white/6 text-[var(--color-ink-faint)]"
              }`}
            >
              {EXERCISES[id].name}
            </button>
          ))}
        </div>
        <Sparkline
          values={trend.map((t) => t.value * 100)}
          label={`${EXERCISES[selected].name} accuracy`}
          formatValue={(v) => `${v.toFixed(0)}%`}
        />
      </section>

      {/* Response time trend for the selected exercise */}
      {latency.length > 1 && (
        <section className="card p-5" aria-label="Response time trend">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            {EXERCISES[selected].name} · response time
          </h2>
          <Sparkline
            values={latency.map((t) => t.value)}
            label={`${EXERCISES[selected].name} average response time`}
            formatValue={(v) => `${v.toFixed(0)} ms`}
            invert
          />
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            {selected === "reaction-time"
              ? "Average reaction per session — lower is faster."
              : "Average answer time per session — context for the accuracy trend, not a score."}
          </p>
        </section>
      )}

      {/* Time of day */}
      {dayParts.length >= 2 && (
        <section className="card p-5" aria-label="Accuracy by time of day">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            Time of day
          </h2>
          <ul className="space-y-2">
            {dayParts.map((p) => (
              <li key={p.part} className="flex items-center justify-between text-sm">
                <span>{DAY_PART_LABELS[p.part]}</span>
                <span className="tabular-nums text-[var(--color-ink-dim)]">
                  {Math.round(p.accuracy * 100)}% · {p.sessions} session
                  {p.sessions !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            When your sessions score best — an in-app observation, nothing more.
          </p>
        </section>
      )}

      {/* Levels */}
      <section className="card p-5" aria-label="Exercise levels">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Exercise levels
        </h2>
        <ul className="space-y-2">
          {levels.map((l) => (
            <li key={l.exerciseId} className="flex items-center justify-between text-sm">
              <span>{l.name}</span>
              <span className="font-semibold tabular-nums">
                Lv {l.level}
                <span className="ml-2 text-xs font-normal text-[var(--color-ink-faint)]">
                  {l.attempts} rounds
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Balance */}
      <section className="card p-5" aria-label="Training balance">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Training balance
        </h2>
        <BalanceBars
          entries={(Object.keys(balance) as Modality[]).map((m) => ({
            label: MODALITY_LABELS[m],
            fraction: balance[m],
          }))}
        />
      </section>

      {/* Records */}
      {records.length > 0 && (
        <section className="card p-5" aria-label="Personal records">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
            Personal records
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {records.map(([key, rec]) => (
              <li key={key} className="rounded-xl bg-white/5 p-3">
                <p className="text-lg font-bold tabular-nums">
                  {rec.value} <span className="text-xs font-normal">{RECORD_LABELS[key].unit}</span>
                </p>
                <p className="text-xs text-[var(--color-ink-faint)]">{RECORD_LABELS[key].label}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Achievements */}
      <section className="card p-5" aria-label="Achievements">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          Achievements · {unlockedCount}/{ACHIEVEMENTS.length}
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
                    {a.title}
                    {unlocked && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-good)]">
                        unlocked
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink-dim)]">{a.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
