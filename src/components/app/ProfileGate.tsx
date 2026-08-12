"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/domain/types";
import { getStorage } from "@/lib/storage/db";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { PinDialog } from "@/components/app/PinDialog";

/**
 * Launch profile picker (issue #8): on app start with several household
 * profiles, ask who is training. "Don't ask again" persists in meta; the
 * choice itself is remembered per app launch (sessionStorage).
 */

export const META_SKIP_PROFILE_PICKER = "skipProfilePicker";
const SESSION_CHOSEN_KEY = "cortex:profile-chosen";

export function ProfileGate() {
  const { ready, profiles, profile, setActiveProfile } = useProfiles();
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [skipNextTime, setSkipNextTime] = useState(false);
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  // Evaluate once per page load: the picker belongs to app launch, not to
  // profile-count changes mid-session (e.g. adding a household member).
  const evaluated = useRef(false);

  useEffect(() => {
    if (!ready || evaluated.current) return;
    evaluated.current = true;
    if (profiles.length < 2) return;
    if (sessionStorage.getItem(SESSION_CHOSEN_KEY) === "true") return;
    let cancelled = false;
    getStorage()
      .getMeta(META_SKIP_PROFILE_PICKER)
      .then((skip) => {
        if (!cancelled && skip !== "true") setShow(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, profiles.length]);

  if (!show || !ready || profiles.length < 2) return null;

  const finish = async (p: Profile) => {
    await setActiveProfile(p.id);
    sessionStorage.setItem(SESSION_CHOSEN_KEY, "true");
    if (skipNextTime) {
      await getStorage().setMeta(META_SKIP_PROFILE_PICKER, "true");
    }
    setShow(false);
  };

  const choose = (p: Profile) => {
    if (p.pin && p.id !== profile?.id) {
      setPinFor(p);
    } else {
      void finish(p);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Who is training?")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-night)]/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold">{t("Who is training?")}</h1>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className="card flex flex-col items-center gap-2 p-5 transition-transform active:scale-[0.97]"
            >
              <span
                aria-hidden
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--surface-border)] text-3xl"
                style={{ background: `hsl(${p.avatarHue} 60% 25% / 0.6)` }}
              >
                {p.avatar}
              </span>
              <span className="font-semibold">{p.name}</span>
              {p.pin && (
                <span
                  aria-label={t("PIN protected")}
                  className="text-xs text-[var(--color-ink-faint)]"
                >
                  🔒
                </span>
              )}
            </button>
          ))}
        </div>
        <label className="mt-6 flex cursor-pointer items-center justify-center gap-2 text-sm text-[var(--color-ink-dim)]">
          <input
            type="checkbox"
            checked={skipNextTime}
            onChange={(e) => setSkipNextTime(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          {t("Don't ask next time")}
        </label>
      </div>

      {pinFor && (
        <PinDialog
          profile={pinFor}
          onResult={(ok) => {
            const target = pinFor;
            setPinFor(null);
            if (ok && target) void finish(target);
          }}
        />
      )}
    </div>
  );
}
