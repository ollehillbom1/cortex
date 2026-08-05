import type { Metadata } from "next";
import Link from "next/link";

/**
 * Privacy, as a page rather than only a repository file.
 *
 * The app linked to "PRIVACY" from the profile screen, and /privacy answered
 * 404 in production: the one place a user might check what happens to their
 * data was a dead end. This mirrors PRIVACY.md — keep them in step.
 */

export const metadata: Metadata = {
  title: "Privacy — Cortex",
  description:
    "What Cortex stores, where it is stored, and what leaves your device. Local-first by design, with optional end-to-end encrypted sync through your own server.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm text-[var(--color-ink-dim)]">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto h-dvh w-full max-w-2xl overflow-y-auto px-5 pb-16 pt-10">
      <h1 className="text-2xl font-bold">Privacy</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
        Cortex is local-first by design. This page says exactly what is stored, where, and what
        leaves your device.
      </p>

      <Section title="What is stored, and where">
        <p>
          Everything lives in your browser, in IndexedDB (database <code>cortex</code>): profiles
          (name, avatar, preferences, XP, streak, per-exercise levels, personal records,
          achievements) and completed sessions (times, exercises, accuracy, response times, XP).
        </p>
        <p>
          Alongside them sits app state: the active profile id, and — when sync is on — the group id
          and <strong>the sync key itself</strong>, stored so the app can decrypt without asking for
          your passphrase every time. Anyone with access to this browser profile can therefore read
          the synced data without knowing the passphrase. That is the same trust boundary as the
          training data itself, but it is worth saying plainly.
        </p>
        <p>
          There is no account, no analytics, no tracking and no third-party script. Clearing your
          browser data deletes your training — export a backup first.
        </p>
      </Section>

      <Section title="What leaves your device">
        <p>Nothing, unless you ask for it. Two things can send data, both off by default:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Export JSON</strong> downloads a file to your device. It contains every profile
            on this device, the full session history and, if set, the salted PIN hash — treat it as
            sensitive.
          </li>
          <li>
            <strong>Device sync</strong> keeps devices that share a passphrase in step through your
            own server. Data is end-to-end encrypted in the browser (AES-GCM-256, key derived with
            PBKDF2); the server stores ciphertext and a revision counter, and cannot read it.
            Requests are logged by the server like any web request, which includes the group id in
            the URL and your IP address.
          </li>
          <li>
            <strong>AI phrasing of insights</strong>, when both you and the operator enable it,
            sends a small set of numbers from one insight to the language model your server is
            configured with. No names, no session history.
          </li>
        </ul>
      </Section>

      <Section title="The passphrase, and what it protects">
        <p>
          The sync passphrase is the only key to your synced data. Anyone who knows it can read and
          change it, and it cannot be recovered if lost. Two households choosing the same phrase end
          up in the same group, which is why the app offers to generate one.
        </p>
        <p>
          A profile PIN is a courtesy barrier between household profiles on a shared device. It is
          not encryption and does not protect data from anyone with access to the browser.
        </p>
      </Section>

      <Section title="Deleting things">
        <p>
          Resetting progression clears sessions and progress for a profile; deleting a profile
          removes it and its sessions. With sync on, both are recorded as tombstones so the deletion
          reaches your other devices instead of being undone by the next sync.
        </p>
      </Section>

      <p className="mt-10 text-sm">
        <Link className="underline" href="/">
          Back to Cortex
        </Link>
      </p>
    </main>
  );
}
