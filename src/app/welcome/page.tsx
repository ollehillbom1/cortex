"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATAR_CHOICES, createProfile, newId } from "@/lib/storage/profileFactory";
import { requestPersistentStorage } from "@/lib/storage/persistence";
import { getStorage } from "@/lib/storage/db";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/sync/crypto";
import { disableSync, enableSync, getSyncStatus } from "@/lib/sync/engine";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { BoltIcon, CheckIcon, FlameIcon, StatsIcon, TrainIcon } from "@/components/ui/icons";

const STEPS = [
  {
    title: "Train your mind, a few minutes a day",
    icon: TrainIcon,
    body: [
      "Cortex is a personal trainer for memory, attention and speed: short, focused exercises designed for daily 5–20 minute sessions.",
      "It measures your in-app performance — accuracy, span, reaction time — and shows how it develops. It does not measure IQ, and it makes no medical claims.",
    ],
  },
  {
    title: "Why train working memory?",
    icon: FlameIcon,
    body: [
      "Working memory is what holds a phone number while you dial, a recipe step while you stir, the thread of a conversation while you listen. Like most skills, the abilities you practise are the ones that grow.",
      "Short daily sessions beat rare long ones: a focused streak builds span, sharpens attention and speeds up recall — and Cortex shows you that progress, session by session.",
    ],
  },
  {
    title: "Always the right challenge",
    icon: BoltIcon,
    body: [
      "Every exercise adapts to you. Do well and the difficulty rises gently; struggle and it eases off.",
      "Cortex aims for the zone where you succeed about three times out of four — hard enough to be worth doing, never punishing.",
    ],
  },
  {
    title: "Yours. Private. Offline.",
    icon: StatsIcon,
    body: [
      "Everything is stored on this device, in your browser. No account, no cloud, no tracking.",
      "You can export your data as a file any time, and install Cortex on your home screen to train offline.",
    ],
  },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { addProfile, refresh } = useProfiles();
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_CHOICES[0]);
  const [busy, setBusy] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const restore = async () => {
    if (busy || passphrase.length < MIN_PASSPHRASE_LENGTH) return;
    setBusy(true);
    setRestoreError(null);
    try {
      await enableSync(getStorage(), passphrase);
      const status = await getSyncStatus(getStorage());
      const profiles = await getStorage().listProfiles();
      if (profiles.length > 0) {
        await refresh();
        router.replace("/");
        return;
      }
      // Nothing came back — most likely a typo. Undo so a later "create
      // profile" doesn't quietly start pushing to the wrong sync group.
      await disableSync(getStorage());
      setRestoreError(
        status.lastError
          ? t("Sync failed: {error}", { error: status.lastError })
          : t("No data found for that passphrase. Check the spelling, or create a new profile."),
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const profile = createProfile({
      id: newId(),
      name: trimmed,
      avatar,
      avatarHue: Math.floor(Math.random() * 360),
    });
    profile.onboarded = true;
    await addProfile(profile);
    // Ask the browser not to evict our IndexedDB under storage pressure.
    // Best-effort: outcome is surfaced later under Profile → Your data.
    void requestPersistentStorage();
    router.replace("/");
  };

  const isForm = step === STEPS.length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-safe pt-safe">
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div
          role="group"
          className="flex justify-center gap-1.5"
          aria-label={t("Step {step} of {total}", { step: step + 1, total: STEPS.length + 1 })}
        >
          {Array.from({ length: STEPS.length + 1 }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-[var(--color-accent-2)]" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>

        {!isForm ? (
          <div key={step} className="rise-in flex flex-col items-center gap-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_60px_-15px_var(--color-accent)]">
              {(() => {
                const Icon = STEPS[step].icon;
                return <Icon className="h-10 w-10 text-white" />;
              })()}
            </div>
            <h1 className="text-3xl font-bold leading-tight">{t(STEPS[step].title)}</h1>
            {STEPS[step].body.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
                {t(p)}
              </p>
            ))}
          </div>
        ) : (
          <div className="rise-in flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold">{t("Create your profile")}</h1>
              <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
                {t("Profiles keep training separate for each person in your household.")}
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm text-[var(--color-ink-dim)]">
                {t("Your name")}
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void finish()}
                maxLength={40}
                placeholder="e.g. Olle"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-lg outline-none focus:border-[var(--color-accent-2)]"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm text-[var(--color-ink-dim)]">
                {t("Pick an avatar")}
              </span>
              <div role="radiogroup" aria-label={t("Avatar")} className="flex flex-wrap gap-2">
                {AVATAR_CHOICES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={avatar === a}
                    onClick={() => setAvatar(a)}
                    className={`touch-target rounded-2xl border p-2.5 text-2xl transition-colors ${
                      avatar === a
                        ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/20"
                        : "border-white/10 bg-white/4"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pb-6">
        {!isForm ? (
          <>
            <Button onClick={() => setStep((s) => s + 1)} className="w-full">
              {step === 0 ? t("Get started") : t("Continue")}
            </Button>
            {step > 0 && (
              <Button variant="subtle" onClick={() => setStep((s) => s - 1)}>
                {t("Back")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              onClick={() => void finish()}
              disabled={!name.trim() || busy}
              className="w-full"
            >
              <CheckIcon className="h-5 w-5" /> {t("Start training")}
            </Button>
            <Button variant="subtle" onClick={() => setStep((s) => s - 1)}>
              {t("Back")}
            </Button>
            <Button variant="subtle" onClick={() => setShowRestore(true)}>
              {t("Already use Cortex? Restore from sync")}
            </Button>
          </>
        )}
      </div>

      {showRestore && (
        <Dialog label={t("Restore from sync")} onClose={() => setShowRestore(false)}>
          <p className="text-lg font-bold">{t("Restore from sync")}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t(
              "Enter the sync passphrase you use on your other device. Profiles and history are fetched from your server and this device joins the sync group.",
            )}
          </p>
          <input
            autoFocus
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setRestoreError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void restore()}
            aria-label={t("Sync passphrase")}
            placeholder={t("Sync passphrase")}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[var(--color-accent-2)]"
          />
          <p role="alert" className="mt-1.5 min-h-5 text-sm text-[var(--color-bad)]">
            {restoreError ?? ""}
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="ghost" onClick={() => setShowRestore(false)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              onClick={() => void restore()}
              disabled={passphrase.length < MIN_PASSPHRASE_LENGTH || busy}
              className="flex-1"
            >
              {busy ? t("Syncing…") : t("Restore")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
