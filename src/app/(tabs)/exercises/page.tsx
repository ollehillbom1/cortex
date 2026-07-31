"use client";

import Link from "next/link";
import { ALL_EXERCISE_IDS, EXERCISES, MODALITY_LABELS } from "@/lib/domain/types";
import { effectiveLevel, recentAccuracy } from "@/lib/adaptive/engine";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { ChevronRightIcon } from "@/components/ui/icons";

export default function ExercisesPage() {
  const { ready, profile } = useProfiles();
  const { t } = useT();
  if (!ready) return null;

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header>
        <h1 className="text-2xl font-bold">{t("Training library")}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
          {t("Play any exercise on its own — results still count towards your progress.")}
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {ALL_EXERCISE_IDS.map((id) => {
          const def = EXERCISES[id];
          const skill = profile?.skills[id];
          const level = skill ? effectiveLevel(skill) : 1;
          const acc = skill ? recentAccuracy(skill) : null;
          return (
            <li key={id}>
              <Link
                href={`/session?exercise=${id}`}
                className="card flex items-center gap-4 p-4 transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold">{t(def.name)}</h2>
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink-dim)]">
                      Lv {level}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[var(--color-ink-dim)]">
                    {t(def.tagline)}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
                    {def.modalities.map((m) => t(MODALITY_LABELS[m])).join(" · ")}
                    {acc !== null && ` · ${t("recent")} ${Math.round(acc * 100)}%`}
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--color-ink-faint)]" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">
        {t(
          "Levels adapt to keep each exercise challenging but doable. Scores reflect in-app performance only — they are not medical or IQ measurements.",
        )}
      </p>
    </div>
  );
}
