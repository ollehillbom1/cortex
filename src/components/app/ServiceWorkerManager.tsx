"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";

/**
 * Registers the service worker and surfaces a small "update ready" prompt
 * when a new version has been installed in the background.
 */
export function ServiceWorkerManager() {
  const { t } = useT();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  // Only reload on controllerchange when the user asked for the update —
  // the first activation also claims clients and must NOT reload the page.
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    // The build id scopes the worker's caches, so a release cannot serve
    // pages or chunks cached by the previous one. It also changes the
    // registration URL, which is what makes the browser fetch the new worker.
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID || "dev")}`)
      .then((registration) => {
        if (!cancelled && registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
        const watchInstalling = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (!cancelled && worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        };
        watchInstalling(registration.installing);
        registration.addEventListener("updatefound", () =>
          watchInstalling(registration.installing),
        );
      })
      .catch(() => {
        // Offline support is progressive enhancement; the app still works.
      });

    const onControllerChange = () => {
      if (reloadRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[90vw] rounded-full border border-[var(--surface-border)] bg-[#161f31] px-4 py-2 text-sm shadow-xl"
    >
      <span className="mr-3">{t("A new version of Cortex is ready.")}</span>
      <button
        type="button"
        className="font-semibold text-[var(--color-accent-2)]"
        onClick={() => {
          reloadRequested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {t("Reload")}
      </button>
    </div>
  );
}
