"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/domain/types";
import { levelProgress } from "@/lib/progression/xp";
import { initialStreak } from "@/lib/progression/streak";
import { getStorage } from "@/lib/storage/db";
import { AVATAR_CHOICES, createProfile, newId } from "@/lib/storage/profileFactory";
import {
  exportAll,
  importBundle,
  ImportError,
  parseExportBundle,
} from "@/lib/storage/exportImport";
import { META_LAST_EXPORT_AT } from "@/lib/storage/backupReminder";
import {
  persistentStorageStatus,
  requestPersistentStorage,
  type PersistenceState,
} from "@/lib/storage/persistence";
import { createPinRecord, isValidPin } from "@/lib/security/pin";
import { recordProfileDeletion, recordSessionsCleared, syncNow } from "@/lib/sync/engine";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { META_SKIP_PROFILE_PICKER } from "@/components/app/ProfileGate";
import { PinDialog } from "@/components/app/PinDialog";
import { SyncSection } from "@/components/app/SyncSection";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export default function ProfilePage() {
  const router = useRouter();
  const {
    ready,
    profile,
    profiles,
    saveProfile,
    addProfile,
    removeProfile,
    setActiveProfile,
    refresh,
  } = useProfiles();
  const { t } = useT();
  const [message, setMessage] = useState<string | null>(null);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(AVATAR_CHOICES[1]);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceState>("unsupported");
  const [askAtStart, setAskAtStart] = useState(true);
  const [switchTo, setSwitchTo] = useState<Profile | null>(null);
  const [pinSetup, setPinSetup] = useState(false);
  const [pinRemove, setPinRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [exportAt, status, skipPicker] = await Promise.all([
        getStorage().getMeta(META_LAST_EXPORT_AT),
        persistentStorageStatus(),
        getStorage().getMeta(META_SKIP_PROFILE_PICKER),
      ]);
      if (!cancelled) {
        setLastExportAt(exportAt ?? null);
        setPersistence(status);
        setAskAtStart(skipPicker !== "true");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !profile) return null;

  const progress = levelProgress(profile.xp);

  const setPref = <K extends keyof Profile["preferences"]>(
    key: K,
    value: Profile["preferences"][K],
  ) => void saveProfile({ ...profile, preferences: { ...profile.preferences, [key]: value } });

  const doExport = async () => {
    const bundle = await exportAll(getStorage());
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cortex-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const stamp = new Date().toISOString();
    await getStorage().setMeta(META_LAST_EXPORT_AT, stamp);
    setLastExportAt(stamp);
    setMessage(t("Export downloaded. Keep it somewhere safe."));
  };

  const doImport = async (file: File) => {
    try {
      const bundle = parseExportBundle(await file.text());
      const result = await importBundle(getStorage(), bundle);
      await refresh();
      setMessage(
        t("Imported {p} profile(s) and {s} session(s). Skipped {skipped} existing item(s).", {
          p: result.profilesAdded,
          s: result.sessionsAdded,
          skipped: result.profilesSkipped + result.sessionsSkipped,
        }),
      );
    } catch (err) {
      setMessage(
        err instanceof ImportError ? err.message : t("Import failed — file not recognised."),
      );
    }
  };

  const doReset = async () => {
    const fresh: Profile = {
      ...profile,
      xp: 0,
      streak: initialStreak(),
      skills: {},
      records: {},
      achievements: {},
    };
    await getStorage().deleteSessions(profile.id);
    // Watermark so old sessions do not resurrect via sync.
    await recordSessionsCleared(getStorage(), profile.id);
    await saveProfile(fresh);
    setConfirming(null);
    setMessage(t("Progression reset. Profile and preferences kept."));
    void syncNow(getStorage());
  };

  const doDelete = async () => {
    // Tombstone first so the deletion sticks across synced devices.
    await recordProfileDeletion(getStorage(), profile.id);
    await removeProfile(profile.id);
    setConfirming(null);
    void syncNow(getStorage());
    if (profiles.length <= 1) router.replace("/welcome");
  };

  const createNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const p = createProfile({
      id: newId(),
      name,
      avatar: newAvatar,
      avatarHue: Math.floor(Math.random() * 360),
    });
    p.onboarded = true;
    await addProfile(p);
    setShowNewProfile(false);
    setNewName("");
    setMessage(t("Welcome, {name}!", { name }));
  };

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 text-3xl"
          style={{ background: `hsl(${profile.avatarHue} 60% 25% / 0.6)` }}
        >
          {profile.avatar}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          <p className="text-sm text-[var(--color-ink-dim)]">
            {t("Level {n}", { n: progress.level })} · {profile.xp} XP ·{" "}
            {t("member since {date}", {
              date: new Date(profile.createdAt).toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              }),
            })}
          </p>
        </div>
      </header>

      {message && (
        <p role="status" className="card border-[var(--color-accent)]/30 p-3.5 text-sm">
          {message}
        </p>
      )}

      {/* Household profiles */}
      <section className="card p-5" aria-label={t("Profiles")}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Profiles on this device")}
        </h2>
        <ul className="mt-3 space-y-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  if (p.id === profile.id) return;
                  if (p.pin) setSwitchTo(p);
                  else void setActiveProfile(p.id);
                }}
                aria-pressed={p.id === profile.id}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  p.id === profile.id
                    ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10"
                    : "border-white/8 bg-white/4 hover:bg-white/8"
                }`}
              >
                <span aria-hidden className="text-xl">
                  {p.avatar}
                </span>
                <span className="flex-1 font-medium">
                  {p.name}
                  {p.pin && (
                    <span aria-label={t("PIN protected")} className="ml-1.5 text-xs">
                      🔒
                    </span>
                  )}
                </span>
                {p.id === profile.id && (
                  <span className="text-xs font-semibold text-[var(--color-accent-2)]">
                    {t("active")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {showNewProfile ? (
          <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-ink-dim)]">{t("Name")}</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 outline-none focus:border-[var(--color-accent-2)]"
                placeholder="e.g. Alex"
              />
            </label>
            <div role="radiogroup" aria-label={t("Avatar")} className="flex flex-wrap gap-2">
              {AVATAR_CHOICES.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={newAvatar === a}
                  onClick={() => setNewAvatar(a)}
                  className={`touch-target rounded-xl border p-2 text-xl ${
                    newAvatar === a
                      ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/15"
                      : "border-white/10"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowNewProfile(false)} className="flex-1">
                {t("Cancel")}
              </Button>
              <Button
                onClick={() => void createNew()}
                disabled={!newName.trim()}
                className="flex-1"
              >
                {t("Create")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setShowNewProfile(true)} className="mt-3 w-full">
            {t("Add household profile")}
          </Button>
        )}
        {profiles.length > 1 && (
          <div className="mt-4 border-t border-white/8 pt-4">
            <Toggle
              label={t("Ask who's training at start")}
              description={t("Show the profile picker when the app opens")}
              checked={askAtStart}
              onChange={(v) => {
                setAskAtStart(v);
                void getStorage().setMeta(META_SKIP_PROFILE_PICKER, v ? "false" : "true");
              }}
            />
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="card p-5" aria-label={t("Preferences")}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Preferences")}
        </h2>
        <div className="mt-3 space-y-4">
          <Toggle
            label={t("Sound")}
            description={t("Tones and spoken digits during exercises")}
            checked={profile.preferences.audioEnabled}
            onChange={(v) => setPref("audioEnabled", v)}
          />
          <label className="block">
            <span className="flex justify-between text-sm">
              <span>{t("Volume")}</span>
              <span className="text-[var(--color-ink-faint)]">
                {Math.round(profile.preferences.volume * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(profile.preferences.volume * 100)}
              onChange={(e) => setPref("volume", Number(e.target.value) / 100)}
              disabled={!profile.preferences.audioEnabled}
              className="mt-2 w-full accent-[var(--color-accent)]"
              aria-label={t("Volume")}
            />
          </label>
          <Toggle
            label={t("Larger text")}
            description={t("Increase text size across the app")}
            checked={profile.preferences.largeText}
            onChange={(v) => setPref("largeText", v)}
          />
          <Toggle
            label={t("Reduce motion")}
            description={t("Minimise animations (also follows your system setting)")}
            checked={profile.preferences.reduceMotion}
            onChange={(v) => setPref("reduceMotion", v)}
          />
          <label className="block">
            <span className="flex justify-between text-sm">
              <span>{t("Daily goal")}</span>
              <span className="text-[var(--color-ink-faint)]">
                {profile.preferences.dailyGoalMinutes} min
              </span>
            </span>
            <input
              type="range"
              min={5}
              max={25}
              step={5}
              value={profile.preferences.dailyGoalMinutes}
              onChange={(e) => setPref("dailyGoalMinutes", Number(e.target.value))}
              className="mt-2 w-full accent-[var(--color-accent)]"
              aria-label={t("Daily goal in minutes")}
            />
          </label>
          <Toggle
            label={t("Kid mode")}
            description={t("Larger interface and a gentler difficulty ramp")}
            checked={profile.preferences.kidMode}
            onChange={(v) => setPref("kidMode", v)}
          />
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">{t("Profile PIN")}</span>
              <span className="block text-xs text-[var(--color-ink-faint)]">
                {profile.pin
                  ? t("A PIN is required to switch to this profile.")
                  : t(
                      "Ask for a 4-digit PIN when switching to this profile. Not a security feature — see PRIVACY.",
                    )}
              </span>
            </span>
            <Button
              variant="ghost"
              className="shrink-0 !px-4 !py-2 text-sm"
              onClick={() => (profile.pin ? setPinRemove(true) : setPinSetup(true))}
            >
              {profile.pin ? t("Remove PIN") : t("Set PIN")}
            </Button>
          </div>
          <div>
            <span className="block text-sm font-medium">{t("Language")}</span>
            <div
              role="group"
              aria-label={t("Language")}
              className="mt-2 grid grid-cols-3 gap-2 text-sm"
            >
              {(
                [
                  { value: "auto", label: t("Automatic") },
                  { value: "en", label: "English" },
                  { value: "sv", label: "Svenska" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={profile.preferences.locale === opt.value}
                  onClick={() => setPref("locale", opt.value)}
                  className={`touch-target rounded-xl border px-3 py-2 font-medium transition-colors ${
                    profile.preferences.locale === opt.value
                      ? "border-[var(--color-accent-2)] bg-[var(--color-accent)]/15"
                      : "border-white/10 bg-white/4"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="card p-5" aria-label={t("Your data")}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Your data")}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
          {t(
            "Everything is stored locally in this browser — nothing is sent anywhere. Export a backup before clearing browser data or moving devices.",
          )}
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {t("Last export:")}{" "}
          {lastExportAt
            ? new Date(lastExportAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : t("never")}
          {" · "}
          {persistence === "granted" && t("Storage is protected against automatic clean-up.")}
          {persistence === "denied" && (
            <>
              {t("Storage may be cleared under pressure.")}{" "}
              <button
                type="button"
                className="underline"
                onClick={() =>
                  void requestPersistentStorage().then((s) => {
                    setPersistence(s);
                    if (s === "granted") setMessage(t("Persistent storage granted."));
                  })
                }
              >
                {t("Request protection")}
              </button>
            </>
          )}
          {persistence === "unsupported" && t("Persistent-storage API not available here.")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Button variant="ghost" onClick={() => void doExport()}>
            {t("Export JSON")}
          </Button>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            {t("Import JSON")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="danger" onClick={() => setConfirming("reset")}>
            {t("Reset progression")}
          </Button>
          <Button variant="danger" onClick={() => setConfirming("delete")}>
            {t("Delete profile")}
          </Button>
        </div>
      </section>

      {/* Sync */}
      <SyncSection />

      {/* Install */}
      <section className="card p-5" aria-label={t("Install Cortex")}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
          {t("Install on your phone")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          {t(
            "On iPhone: open Cortex in Safari, tap the Share button, then Add to Home Screen. Cortex then runs full-screen and works offline. On Android, choose Install app from the browser menu.",
          )}
        </p>
      </section>

      <p className="pb-2 text-center text-xs text-[var(--color-ink-faint)]">
        {t(
          "Cortex · self-hosted cognitive training · results reflect in-app performance, not clinical cognition.",
        )}
      </p>

      {/* PIN-gated profile switch */}
      {switchTo && (
        <PinDialog
          profile={switchTo}
          onResult={(ok) => {
            const target = switchTo;
            setSwitchTo(null);
            if (ok && target) void setActiveProfile(target.id);
          }}
        />
      )}

      {/* Set PIN */}
      {pinSetup && (
        <SetPinDialog
          onClose={() => setPinSetup(false)}
          onSet={async (pin) => {
            const record = await createPinRecord(pin);
            await saveProfile({ ...profile, pin: record });
            setPinSetup(false);
            setMessage(t("PIN set for {name}.", { name: profile.name }));
          }}
        />
      )}

      {/* Remove PIN (requires the current PIN) */}
      {pinRemove && profile.pin && (
        <PinDialog
          profile={profile}
          onResult={(ok) => {
            setPinRemove(false);
            if (ok) {
              const rest = { ...profile };
              delete rest.pin;
              void saveProfile(rest).then(() => setMessage(t("PIN removed.")));
            }
          }}
        />
      )}

      {/* Confirm dialogs */}
      {confirming && (
        <Dialog
          label={confirming === "reset" ? t("Reset progression?") : t("Delete profile?")}
          onClose={() => setConfirming(null)}
        >
          <p className="text-lg font-bold">
            {confirming === "reset"
              ? t("Reset progression?")
              : t("Delete {name}?", { name: profile.name })}
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {confirming === "reset"
              ? t(
                  "XP, levels, streak, records, achievements and session history will be permanently removed. The profile itself is kept. Consider exporting first.",
                )
              : t(
                  "This permanently removes the profile and all of its training history from this device. Consider exporting first.",
                )}
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => setConfirming(null)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void (confirming === "reset" ? doReset() : doDelete())}
              className="flex-1"
            >
              {confirming === "reset" ? t("Reset") : t("Delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SetPinDialog({
  onClose,
  onSet,
}: {
  onClose: () => void;
  onSet: (pin: string) => Promise<void>;
}) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length === 4 && pin !== confirm;
  const ready = isValidPin(pin) && pin === confirm;

  return (
    <Dialog label={t("Set a profile PIN")} onClose={onClose}>
      <p className="text-lg font-bold">{t("Set a profile PIN")}</p>
      <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
        {t(
          "A courtesy barrier for household profiles — anyone with access to this browser can still reach the data. Choose 4 digits.",
        )}
      </p>
      {[
        { value: pin, set: setPin, label: t("New PIN"), focus: true },
        { value: confirm, set: setConfirm, label: t("Repeat PIN"), focus: false },
      ].map((field) => (
        <input
          key={field.label}
          autoFocus={field.focus}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={field.value}
          onChange={(e) => field.set(e.target.value.replace(/\D/g, "").slice(0, 4))}
          aria-label={field.label}
          placeholder={field.label}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none placeholder:text-sm placeholder:tracking-normal focus:border-[var(--color-accent-2)]"
        />
      ))}
      <p role="alert" className="mt-1.5 min-h-5 text-sm text-[var(--color-bad)]">
        {mismatch ? t("The PINs do not match.") : ""}
      </p>
      <div className="mt-3 flex gap-3">
        <Button variant="ghost" onClick={onClose} className="flex-1">
          {t("Cancel")}
        </Button>
        <Button
          onClick={() => {
            setBusy(true);
            void onSet(pin);
          }}
          disabled={!ready || busy}
          className="flex-1"
        >
          {t("Set PIN")}
        </Button>
      </div>
    </Dialog>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--color-ink-faint)]">{description}</span>
      </span>
      <span className="relative inline-block h-7 w-12 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-white/12 transition-colors peer-checked:bg-[var(--color-accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-accent-2)]" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
