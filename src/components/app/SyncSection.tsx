"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/storage/db";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/sync/crypto";
import { looksLikeSyncCode, SyncCodeFormatError } from "@/lib/sync/syncCode";
import {
  createSyncGroup,
  disableSync,
  enableSync,
  getSyncStatus,
  joinSyncGroup,
  SyncGroupNotFoundError,
  syncNow,
  upgradeSyncToV3,
  type SyncStatus,
} from "@/lib/sync/engine";
import { useT } from "@/lib/i18n/useT";
import { useProfiles } from "@/components/app/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Sync controls on the profile page (issue #2; v3 protocol per SEC-01). */
export function SyncSection() {
  const { t } = useT();
  const { refresh } = useProfiles();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  /** Non-null while the save-your-code dialog is up. */
  const [shownCode, setShownCode] = useState<{ code: string; afterUpgrade: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
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

  const doCreate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const code = await createSyncGroup(getStorage());
      await refresh();
      setMessage(t("Sync is on. This device's data is now backed up to your server."));
      setShownCode({ code, afterUpgrade: false });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const doJoin = async () => {
    const input = joinInput.trim();
    if (busy || input.length < MIN_PASSPHRASE_LENGTH) return;
    setBusy(true);
    setJoinError(null);
    try {
      const before = (await getStorage().listProfiles()).length;
      if (looksLikeSyncCode(input)) {
        await joinSyncGroup(getStorage(), input);
      } else {
        await enableSync(getStorage(), input);
      }
      const after = (await getStorage().listProfiles()).length;
      await refresh();
      setShowJoin(false);
      setJoinInput("");
      setMessage(
        after > before
          ? t("Sync is on. Restored {n} profile(s) from your other devices.", {
              n: after - before,
            })
          : t("Sync is on. This device now shares data with the group."),
      );
    } catch (err) {
      if (err instanceof SyncCodeFormatError) {
        setJoinError(t("That is not a complete sync code — compare it with the other device."));
      } else if (err instanceof SyncGroupNotFoundError) {
        setJoinError(
          t("No sync group found. Check the code or passphrase, or create a new group instead."),
        );
      } else {
        setJoinError(err instanceof Error ? err.message : t("Sync failed — try again."));
      }
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const doUpgrade = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const code = await upgradeSyncToV3(getStorage());
      setMessage(t("Sync security upgraded."));
      setShownCode({ code, afterUpgrade: true });
    } catch (err) {
      setMessage(
        t("Upgrade failed: {error}", {
          error: err instanceof Error ? err.message : "sync failed",
        }),
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

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (permissions, non-secure context); the
      // code is selectable text either way.
    }
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
              "Optional: sync profiles and history between devices via your own server. Data is end-to-end encrypted — the server only ever stores ciphertext.",
            )}
          </p>
          <Button
            variant="ghost"
            onClick={() => void doCreate()}
            disabled={busy}
            className="mt-3 w-full"
          >
            {busy ? t("Syncing…") : t("Set up sync on this device")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setJoinInput("");
              setJoinError(null);
              setShowJoin(true);
            }}
            className="mt-2 w-full"
          >
            {t("Join with a sync code or passphrase")}
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
                  "This group's identity is still derived from its passphrase, which can be guessed. Upgrading moves your data to a group with a random identity and gives you a sync code. Do this on ONE device; every other device then joins with that code.",
                )}
              </p>
              <Button
                variant="ghost"
                onClick={() => void doUpgrade()}
                disabled={busy}
                className="mt-3 w-full"
              >
                {busy ? t("Syncing…") : t("Upgrade sync security")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  // The second device's half of the upgrade: the first device
                  // created the v3 group and holds the code.
                  setJoinInput("");
                  setJoinError(null);
                  setShowJoin(true);
                }}
                disabled={busy}
                className="mt-2 w-full"
              >
                {t("This household already has a code — join with it")}
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
          {status.syncCode && (
            <Button
              variant="ghost"
              onClick={() => setShownCode({ code: status.syncCode!, afterUpgrade: false })}
              className="mt-3 w-full"
            >
              {t("Show sync code")}
            </Button>
          )}
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

      {showJoin && (
        <Dialog label={t("Join a sync group")} onClose={() => setShowJoin(false)}>
          <p className="text-lg font-bold">{t("Join a sync group")}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
            {t(
              "Enter the sync code from another device (Profile → Show sync code), or the passphrase of a group created before sync codes existed.",
            )}
          </p>
          <input
            autoFocus
            type="text"
            autoComplete="off"
            value={joinInput}
            onChange={(e) => {
              setJoinInput(e.target.value);
              setJoinError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void doJoin()}
            aria-label={t("Sync code or passphrase")}
            placeholder={t("Sync code or passphrase")}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[var(--color-accent-2)]"
          />
          <p role="alert" className="mt-1.5 min-h-5 text-sm text-[var(--color-bad)]">
            {joinError ?? ""}
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="ghost" onClick={() => setShowJoin(false)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              onClick={() => void doJoin()}
              disabled={joinInput.trim().length < MIN_PASSPHRASE_LENGTH || busy}
              className="flex-1"
            >
              {busy ? t("Syncing…") : t("Join")}
            </Button>
          </div>
        </Dialog>
      )}

      {shownCode && (
        <Dialog
          label={t("Your sync code")}
          onClose={() => {
            setShownCode(null);
            setCopied(false);
          }}
        >
          <p className="text-lg font-bold">{t("Your sync code")}</p>
          <p
            data-testid="sync-code"
            className="mt-3 select-all break-all rounded-2xl border border-white/10 bg-white/5 p-4 text-center font-mono text-base tracking-wide"
          >
            {shownCode.code}
          </p>
          <p className="mt-3 text-sm text-[var(--color-ink-dim)]">
            {t(
              "Write this code down and keep it safe. It is the key to your synced data: another device joins with it, and if every device is lost it is the ONLY way to get your data back. It cannot be recovered for you.",
            )}
          </p>
          {shownCode.afterUpgrade && (
            <p className="mt-2 text-sm font-semibold text-[var(--color-warn)]">
              {t(
                "Other devices in your household must now join with this code — the old passphrase no longer finds this group.",
              )}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button
              variant="ghost"
              onClick={() => void copyCode(shownCode.code)}
              className="flex-1"
            >
              {copied ? t("Copied") : t("Copy")}
            </Button>
            <Button
              onClick={() => {
                setShownCode(null);
                setCopied(false);
              }}
              className="flex-1"
            >
              {t("I have saved my sync code")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
