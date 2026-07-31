"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and surfaces a small "update ready" prompt
 * when a new version has been installed in the background.
 */
export function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js")
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

    const onControllerChange = () => window.location.reload();
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
      className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[90vw] rounded-full border border-white/10 bg-[#161f31] px-4 py-2 text-sm shadow-xl"
    >
      <span className="mr-3">A new version of Cortex is ready.</span>
      <button
        type="button"
        className="font-semibold text-[var(--color-accent-2)]"
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
      >
        Reload
      </button>
    </div>
  );
}
