"use client";

import { useEffect } from "react";
import { getStorage } from "@/lib/storage/db";
import { recordCrash } from "@/lib/storage/crashLog";

/**
 * Records uncaught errors and unhandled promise rejections to the local
 * crash log. Renders nothing. Paired with error.tsx (which catches React
 * render errors); this covers the async and event-handler errors a render
 * boundary never sees. On-device only — see lib/storage/crashLog.ts.
 */
export function CrashCatcher() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      void recordCrash(getStorage(), {
        message: e.message || "Uncaught error",
        stack: e.error instanceof Error ? e.error.stack : undefined,
        where: e.filename || undefined,
        kind: "error",
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      void recordCrash(getStorage(), {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        kind: "rejection",
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
