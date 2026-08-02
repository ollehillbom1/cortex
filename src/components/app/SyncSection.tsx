"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/storage/db";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/sync/crypto";
import { generatePassphrase } from "@/lib/sync/passphrase";
import {
  disableSync,
  enableSync,
  getSyncStatus,
  syncNow,
  type SyncStatus,
} from "@/lib/sync/engine";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Sync controls on the profile page (issue #2). */
export function SyncSection() {
  const { t } = useT();
  const { refresh } = useProfiles();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [showEnable, setShowEnable] = useState(false);
  const [revealPassphrase, setRevealPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => setStatus(await getSyncStatus(getStorage()));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await getSyncStatus(getStorage());
      if (!cancelled) setStatus(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const doEnable = async () => {
    if (busy || passphrase.length < MIN_PASSPHRASE_LENGTH) return;
    setBusy(true);
    try {
      const before = (await getStorage().listProfiles()).length;
      await enableSync(getStorage(), passphrase);
      const after = (await getStorage().listProfiles()).length;
      await refresh();
      setShowEnable(false);
      setPassphrase("");
      // Back to masked: one tap of Generate left the field in clear text for
      // the component's lifetime, including the upgrade dialog where the user
      // types their real existing passphrase.
      setRevealPassphrase(false);
      // Say whether anything actually arrived: "sync is on" alone left a
      // returning user unsure whether their history was coming back.
      setMessage(
        after > before
          ? t("Sync is on. Restored {n} profile(s) from your other devices.", {
              n: after - before,
            })
          : t("Sync is on. This device now shares data with everyone using the same passphrase."),
      );
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const doSyncNow = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await syncNow(getStorage());
    if (ok) await refresh();
    setBusy(false);
    setMessage(ok ? t("Synced.") : t("Sync failed — see the status below."));
    await reload();
  };

  const doDisable = async () => {
    await disableSync(getStorage());
    setMessage(t("Sync is off. Local data stays on this device."));
    await reload();
  };

  if (!status) return null;

  return (
    <section className="card p-5" aria-label={t("Sync between devices")}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-dim)]">
        {t("Sync between devices")}
      </h2>
      {message && (
        <p role="status" className="mt-2 text-sm text-[var(--color-accent-2)]">
          {message}
        </p>
      )}
      {!status.enabled ? (
        <>
          <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
            {t(
              "Optional: sync profiles and history between devices via your own server. Data is end-to-end encrypted with a passphrase — the server only ever stores ciphertext.",
            )}
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
            {t(
              "Reinstalled the app, or setting up a new device? Enter the passphrase you already use and this device rejoins that group — your profiles and history come back.",
            )}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              // Empty, not pre-filled. This button serves rejoining too, and a
              // returning user who does not clear a generated phrase starts a
              // NEW group instead — orphaning the data they came back for.
              // Generating is one tap away inside the dialog.
              setPassphrase("");
              setRevealPassphrase(false);
              setShowEnable(true);
            }}
            className="mt-3 w-full"
          >
            {t("Set up sync, or rejoin with your passphrase")}
          </Button>
        </>
      ) : (
        <>
          {status.needsUpgrade && (
            <div
              role="status"
              className="mt-3 rounded-2xl border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 p-3"
            >
              <p className="text-sm font-semibold text-[var(--color-warn)]">
                {t("Security upgrade available")}
              </p>
              <p className="mt-1 text-xs text-[var(--color-ink-dim)]">
                {t(
                  "This device still uses the old key derivation, which made the passphrase easier to guess from the server's files. Enter your passphrase to upgrade — your synced data comes with you. Until you do, this device will not see devices that have already upgraded.",
                )}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  // Never generated here: the upgrade re-derives the key for the
                  // group this device is ALREADY in, so it needs the existing
                  // passphrase. A generated one silently starts a new group and
                  // orphans everything already synced.
                  setPassphrase("");
                  setRevealPassphrase(false);
                  setShowEnable(true);
                }}
                className="mt-3 w-full"
              >
                {t("Upgrade sync security")}
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            {t("Last sync:")}{" "}
            {status.lastSyncAt
              ? new Date(status.lastSyncAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : t("never")}
            {status.lastError && (
              <span className="text-[var(--color-bad)]">
                {" · "}
                {t("last attempt failed:")} {status.lastError}
              </span>
            )}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button variant="ghost" onClick={() => void doSyncNow()} disabled={busy}>
              {t("Sync now")}
            </Button>
            <Button variant="danger" onClick={() => void doDisable()} disabled={busy}>
              {t("Disable sync")}
            </Button>
          </div>
        </>
      )}

      {showEnable && (
        <Dialog label={t("Set up sync")} onClose={() => setShowEnable(false)}>
          <p className="text-lg font-bold">{t("Set up sync")}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t(
              "A passphrase you already use on another device joins that group and brings its data here. A new passphrase starts a new group from this device's data.",
            )}
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t(
              "At least {n} characters. It is the only key to your data: anyone who knows it can read and change the synced data, and it cannot be recovered if lost.",
              { n: MIN_PASSPHRASE_LENGTH },
            )}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-ink-dim)]">
              {t("Starting a new group? Generate a passphrase and write it down.")}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setPassphrase(generatePassphrase());
                setRevealPassphrase(true);
              }}
            >
              {passphrase ? t("Generate another") : t("Generate a passphrase")}
            </Button>
          </div>
          <input
            autoFocus
            type={revealPassphrase ? "text" : "password"}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doEnable()}
            aria-label={t("Sync passphrase")}
            placeholder={t("Sync passphrase")}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[var(--color-accent-2)]"
          />
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => setShowEnable(false)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              onClick={() => void doEnable()}
              disabled={passphrase.length < MIN_PASSPHRASE_LENGTH || busy}
              className="flex-1"
            >
              {busy ? t("Syncing…") : t("Enable sync")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
