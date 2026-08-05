"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/storage/db";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/sync/crypto";
import { looksLikeSyncCode, SyncCodeFormatError } from "@/lib/sync/syncCode";
import {
  createSyncGroup,
  deleteServerCopyAndDisable,
  disableSync,
  enableSync,
  getSyncStatus,
  isDeviceStale,
  joinSyncGroup,
  listSyncDevices,
  rotateGroupAfterLoss,
  setDeviceLabel,
  SyncGroupNotFoundError,
  syncNow,
  upgradeSyncToV3,
  type SyncDeviceView,
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLost, setConfirmLost] = useState(false);
  const [devices, setDevices] = useState<SyncDeviceView[]>([]);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    setStatus(await getSyncStatus(getStorage()));
    setDevices(await listSyncDevices(getStorage()));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [initial, initialDevices] = await Promise.all([
        getSyncStatus(getStorage()),
        listSyncDevices(getStorage()),
      ]);
      if (!cancelled) {
        setStatus(initial);
        setDevices(initialDevices);
      }
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

  const doDeleteServerCopy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteServerCopyAndDisable(getStorage());
      setConfirmDelete(false);
      setMessage(t("Server copy deleted. Sync is off; local data stays on every device."));
    } catch (err) {
      setConfirmDelete(false);
      setMessage(
        t("Could not delete the server copy: {error}", {
          error: err instanceof Error ? err.message : "unknown error",
        }),
      );
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const doRotateAfterLoss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { code, oldCopyDeleted } = await rotateGroupAfterLoss(getStorage());
      setConfirmLost(false);
      setMessage(
        oldCopyDeleted
          ? t("New sync group created. The old code no longer unlocks anything.")
          : t(
              "New sync group created, but the old server copy could not be removed — it is frozen and holds nothing new.",
            ),
      );
      setShownCode({ code, afterUpgrade: true });
    } catch (err) {
      setConfirmLost(false);
      setMessage(
        t("Could not rotate the sync group: {error}", {
          error: err instanceof Error ? err.message : "unknown error",
        }),
      );
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const saveLabel = async () => {
    if (labelDraft === null) return;
    await setDeviceLabel(getStorage(), labelDraft);
    setLabelDraft(null);
    // The new name travels with the next sync; refresh the local view now.
    await syncNow(getStorage());
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
          {devices.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label={t("Devices in this sync group")}>
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
                >
                  {d.self && labelDraft !== null ? (
                    <input
                      autoFocus
                      value={labelDraft}
                      maxLength={40}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onBlur={() => void saveLabel()}
                      onKeyDown={(e) => e.key === "Enter" && void saveLabel()}
                      aria-label={t("Device name")}
                      className="w-40 rounded-lg border border-white/10 bg-white/5 px-2 py-1 outline-none focus:border-[var(--color-accent-2)]"
                    />
                  ) : (
                    <span>
                      {d.label || t("Unnamed device")}
                      {d.self && (
                        <button
                          type="button"
                          onClick={() => setLabelDraft(d.label)}
                          className="ml-2 text-xs text-[var(--color-accent-2)] underline"
                        >
                          {t("this device — rename")}
                        </button>
                      )}
                    </span>
                  )}
                  <span
                    className={`text-xs ${
                      isDeviceStale(d.lastSeenAt)
                        ? "font-semibold text-[var(--color-warn)]"
                        : "text-[var(--color-ink-faint)]"
                    }`}
                  >
                    {t(
                      isDeviceStale(d.lastSeenAt)
                        ? "has not synced since {when}"
                        : "last sync {when}",
                      {
                        when: new Date(d.lastSeenAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      },
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {status.syncCode && (
            <Button
              variant="ghost"
              onClick={() => setShownCode({ code: status.syncCode!, afterUpgrade: false })}
              className="mt-3 w-full"
            >
              {t("Show sync code")}
            </Button>
          )}
          {status.syncCode && (
            <Button
              variant="ghost"
              onClick={() => setConfirmLost(true)}
              disabled={busy}
              className="mt-2 w-full"
            >
              {t("Lost a device?")}
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
          {status.syncCode && (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="mt-2.5 w-full"
            >
              {t("Delete server copy…")}
            </Button>
          )}
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

      {confirmLost && (
        <Dialog label={t("Lost a device?")} onClose={() => setConfirmLost(false)}>
          <p className="text-lg font-bold">{t("Lost a device?")}</p>
          <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
            {t(
              "A lost device knows your sync code, and a code cannot be taken back — but it can be made worthless. This moves the household to a fresh group under a NEW code and removes the old server copy. The lost device keeps only what was already on it.",
            )}
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-warn)]">
            {t(
              "Your other devices must then join again with the new code. Do this from the device you trust most.",
            )}
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => setConfirmLost(false)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void doRotateAfterLoss()}
              disabled={busy}
              className="flex-1"
            >
              {busy ? t("Syncing…") : t("Create a new code")}
            </Button>
          </div>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog label={t("Delete the server copy?")} onClose={() => setConfirmDelete(false)}>
          <p className="text-lg font-bold">{t("Delete the server copy?")}</p>
          <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
            {t(
              "This removes the household's encrypted backup from your server and turns sync off on this device. Training data stays on every device — nothing local is deleted.",
            )}
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-warn)]">
            {t(
              "After this, no device can restore from sync. A device that still has sync on will upload a fresh copy on its next sync — turn sync off there first.",
            )}
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="flex-1">
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void doDeleteServerCopy()}
              disabled={busy}
              className="flex-1"
            >
              {busy ? t("Deleting…") : t("Delete server copy")}
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
