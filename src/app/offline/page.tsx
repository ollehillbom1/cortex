import Link from "next/link";

export const metadata = { title: "Offline" };

/**
 * Final navigation fallback used by the service worker when a page has never
 * been cached. Once the app shell is cached, users normally land on "/"
 * instead of this page.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl" aria-hidden>
        📡
      </p>
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-sm text-[var(--color-ink-dim)]">
        This page hasn&apos;t been saved for offline use yet. Your training data is safe on this
        device — try the home screen, which works offline after your first visit.
      </p>
      <Link
        href="/"
        className="btn-primary touch-target mt-2 inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold"
      >
        Go to Today
      </Link>
    </div>
  );
}
