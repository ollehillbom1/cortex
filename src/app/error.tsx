"use client";

import { useEffect } from "react";
import { getStorage } from "@/lib/storage/db";
import { recordCrash } from "@/lib/storage/crashLog";

/**
 * Route-level error boundary (App Router). Catches render errors, records
 * them to the local crash log, and offers recovery — reset() re-renders the
 * segment, and a link home escapes a screen that keeps throwing. Plain
 * English, no stack in the user's face: the detail lives under Profile →
 * Diagnostics for anyone who wants it.
 *
 * Deliberately not translated: it must render even if the i18n/profile
 * context is what threw, so it depends on nothing.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    void recordCrash(getStorage(), {
      message: error.message || "Render error",
      stack: error.stack,
      where: "render boundary",
      kind: "error",
    });
  }, [error]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-[var(--color-ink-dim)]">
        This screen hit an error. Your training data is safe on your device. Try again, or go back
        to Today.
      </p>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="btn-primary touch-target rounded-2xl px-6 py-3 font-semibold"
        >
          Try again
        </button>
        {/* A hard navigation on purpose, not a Link: if the client router or
            a provider is what threw, a client-side nav can re-throw, while a
            full reload escapes to a clean slate. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="touch-target rounded-2xl px-6 py-3 text-sm font-semibold text-[var(--color-ink-dim)]"
        >
          Back to Today
        </a>
      </div>
    </div>
  );
}
