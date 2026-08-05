"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/storage/db";
import { useT } from "@/lib/i18n/useT";
import { Button } from "@/components/ui/Button";

/**
 * Install-on-home-screen guidance for mobile browser visitors.
 *
 * A family member who types the URL into a phone browser gets a working app
 * and no idea it can live on the home screen — nothing on iOS ever tells
 * them, and Android only sometimes does. So: on iOS, the exact Share-sheet
 * steps (there is no API — Apple allows nothing better than instructions);
 * on Android, a real install button when the browser hands us the
 * `beforeinstallprompt` event, with menu instructions as the fallback.
 *
 * Renders nothing when already installed (standalone display mode) or on
 * desktop, and stays away for good once dismissed.
 */

export const META_INSTALL_HINT_DISMISSED = "installHintDismissed";

type Platform = "ios" | "android" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallHint() {
  const { t } = useT();
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // All detection in an effect: the server knows neither the UA nor the
    // display mode, and guessing during render is a hydration mismatch.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    const detected: Platform = /iPhone|iPad|iPod/.test(ua)
      ? "ios"
      : /Android/.test(ua)
        ? "android"
        : null;
    if (!detected) return;

    let cancelled = false;
    void (async () => {
      const dismissed = await getStorage().getMeta(META_INSTALL_HINT_DISMISSED);
      if (!cancelled && !dismissed) {
        setPlatform(detected);
        setVisible(true);
      }
    })();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const dismiss = async () => {
    setVisible(false);
    await getStorage().setMeta(META_INSTALL_HINT_DISMISSED, new Date().toISOString());
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setVisible(false);
    // Declined: keep the card — the menu instructions still apply, and the
    // browser will not hand us the event a second time.
    setInstallEvent(null);
  };

  if (!visible || !platform) return null;

  return (
    <section
      className="card border-[var(--color-accent-2)]/25 p-4"
      aria-label={t("Install Cortex on your home screen")}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-lg">
          📲
        </span>
        <div className="flex-1 text-sm">
          <p className="font-semibold">{t("Install Cortex on your home screen")}</p>
          <p className="mt-0.5 text-[var(--color-ink-dim)]">
            {t("It opens full-screen like an app and works offline.")}
          </p>
          {platform === "ios" ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[var(--color-ink-dim)]">
              <li>{t("Tap the Share button in Safari (the square with an arrow).")}</li>
              <li>{t("Scroll down and tap “Add to Home Screen”.")}</li>
              <li>{t("Tap Add in the top corner.")}</li>
            </ol>
          ) : installEvent ? (
            <Button onClick={() => void install()} className="mt-2.5">
              {t("Install app")}
            </Button>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[var(--color-ink-dim)]">
              <li>{t("Open the browser menu (the ⋮ in the top corner).")}</li>
              <li>{t("Tap “Add to Home screen” or “Install app”.")}</li>
            </ol>
          )}
          <button
            type="button"
            onClick={() => void dismiss()}
            className="mt-2 text-xs text-[var(--color-ink-faint)] underline"
          >
            {t("Don't show this again")}
          </button>
        </div>
      </div>
    </section>
  );
}
