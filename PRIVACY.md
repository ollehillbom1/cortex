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
downloads a file to your device for you to keep.

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

## Data lifecycle

- **Export**: Profile → Your data → Export JSON (includes all profiles on the device).
- **Import**: additive and validated; existing records are never overwritten.
- **Reset progression**: clears XP, levels, streak, records, achievements and
  session history for one profile; keeps the profile and preferences.
- **Delete profile**: permanently removes the profile and all of its sessions.
- Clearing browser site data removes everything — export first.

## Interpretation of results

Scores, levels and trends describe performance inside Cortex's exercises. They
are not medical, psychological or IQ measurements, and no such inference is made
by the app.
