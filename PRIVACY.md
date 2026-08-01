# Privacy

Cortex is local-first by design. This document describes exactly what is stored,
where, and what leaves your device.

## What is stored

All data is stored **only in your browser**, in IndexedDB (database name `cortex`):

- **Profiles**: name, chosen avatar emoji, creation date, preferences (sound,
  volume, text size, motion, daily goal), XP, streak state, per-exercise skill
  levels, personal records, unlocked achievements.
- **Sessions**: per completed session — start/end time, exercises played,
  accuracy, response times, XP earned.
- **App metadata**: the active profile id.

Data never leaves the device unless you explicitly use **Export JSON**, which
downloads a file to your device for you to keep, or enable **device sync**
(see below).

## Optional device sync

Sync is **off by default**. When you enable it (Profile → Sync between
devices), Cortex keeps devices that share a passphrase in sync **through your
own self-hosted server** — no third party is involved.

- Everything is **end-to-end encrypted in the browser** (AES-GCM-256, key
  derived from the passphrase with PBKDF2). The server stores only ciphertext
  plus a revision counter; it cannot read names, sessions or anything else.
- The passphrase never leaves the device. What the server sees is a _group id_
  derived from it by one-way hashing.
- The passphrase is the only key. Anyone who knows it can read **and modify**
  the group's synced data, and lost passphrases cannot be recovered — the
  server operator cannot decrypt anything.
- Disabling sync forgets the credentials on that device and stops all network
  calls; local data stays. Server-side blobs remain until the operator deletes
  the corresponding file under the data directory.

## What is NOT collected

- No accounts, no e-mail addresses, no passwords.
- No telemetry, analytics, crash reporting or tracking of any kind.
- No third-party scripts, fonts, CDNs or advertising SDKs.
- No cookies. The server does not log personal data beyond standard HTTP access
  logs of whatever host you deploy on.

The service worker caches only the application shell and static assets — never
your training data.

## Household use

Multiple profiles on one device are a convenience feature, not a security
boundary: anyone with access to the browser profile can open any Cortex profile,
and data is not encrypted at rest beyond what the browser/OS provides. Use
separate OS/browser accounts if you need isolation.

The optional **profile PIN** is a courtesy barrier so household members don't
train on each other's profiles by accident. The PIN itself is stored as a
salted SHA-256 hash (never in clear text), but the underlying training data is
not encrypted with it — anyone with access to the browser's developer tools
can read the data regardless. Treat the PIN as etiquette, not security. If you
forget a PIN, export/delete paths remain available from any profile.

## Optional AI phrasing of insights

Also **off by default**, and doubly so: it does nothing unless the person
running the server configures a language-model endpoint **and** you switch it
on in your profile. Cortex ships no endpoint and no API key.

When both are on, the daily insight is reworded by the model at the address
the operator configured — typically one running on their own machine.

- **What is sent**: only the structured numbers behind the insight, plus your
  language (`en` or `sv`). Every field is a number or a fixed keyword, for
  example:

  ```json
  { "kind": "best-time-of-day", "part": "morning", "bestPct": 82, "worstPct": 71 }
  ```

- **What is never sent**: names, profile ids, timestamps, session history, and
  any free text. The format has no field capable of carrying them, and the
  server rejects anything that does not match it exactly. The one temporal
  detail that can appear is a coarse bucket like `"morning"` in the example
  above — no dates, no clock times.
- **How often**: at most once per day per insight. The result is cached for
  the local day so the endpoint cannot observe how often you open the app.
- Your browser only ever contacts your own Cortex server, which relays the
  request. If the operator points it at a third-party API, that third party
  sees the numbers above and nothing else.
- The model may only _reword_ what Cortex already worked out. Every word it
  produces must come from the original sentence or a small list of ordinary
  connecting words, every number must match, and anything else — an added
  claim, a fabricated statistic, a refusal — means the original sentence is
  shown instead. These checks are strict by design and reject often; when they
  do, you simply see Cortex's own wording.
- Your consent stays on this device: the setting is never carried by an export
  or by device sync, so enabling it here never enables it elsewhere.

## Data lifecycle

- **Export**: Profile → Your data → Export JSON (includes all profiles on the device).
- **Import**: additive and validated; existing records are never overwritten.
- **Reset progression**: clears XP, levels, streak, records, achievements and
  session history for one profile; keeps the profile and preferences.
- **Delete profile**: permanently removes the profile and all of its sessions.
  With sync enabled, the deletion propagates to the other devices in the group.
- Clearing browser site data removes everything — export first.

## Interpretation of results

Scores, levels and trends describe performance inside Cortex's exercises. They
are not medical, psychological or IQ measurements, and no such inference is made
by the app.
