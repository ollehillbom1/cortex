# Testing

## Unit tests (Vitest)

```bash
npm run test          # or npm run test:watch
```

The unit suite covers the pure core and the component layer — every module in
`src/lib` that contains logic. (No count here on purpose: a number in prose
drifts the day after it is written; `npm run test` prints the real one, and a
contract test fails this file if a count creeps back in.)

| Area                       | File                                  | Highlights                                                                                                                                                                      |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adaptive engine            | `lib/adaptive/engine.test.ts`         | band behaviour, step caps, fatigue discount, safety valve, clamping, determinism, convergence simulation                                                                        |
| Trial generation & scoring | `lib/exercises/exercises.test.ts`     | span/sequence/pattern generation invariants, n-back forced-match structure and hit/miss/false-alarm scoring, reaction delay windows and speed→accuracy mapping                  |
| Progression                | `lib/progression/progression.test.ts` | XP curve monotonicity + inversion, streak growth/freeze/reset/clock-backwards, achievement uniqueness and behaviour-based unlocks                                               |
| Sessions                   | `lib/session/session.test.ts`         | planner determinism, modality coverage, time budget, staleness bias; applySession XP/streak/records (incl. lower-is-better)                                                     |
| Storage                    | `lib/storage/storage.test.ts`         | IndexedDB adapter CRUD (fake-indexeddb), newest-first session listing, cascade delete, v1→v2 migrations, export/import round-trip, tamper resistance, invalid payload rejection |
| Statistics                 | `lib/stats/aggregate.test.ts`         | day bucketing, modality balance, day-key arithmetic                                                                                                                             |
| Backup reminder            | `lib/storage/backupReminder.test.ts`  | quiet-before-progress, staleness threshold, dismissal snooze, malformed timestamps                                                                                              |

All gameplay randomness goes through an injected mulberry32 RNG, so tests use
fixed seeds and are fully deterministic.

## End-to-end tests (Playwright)

```bash
npm run build         # e2e runs against the production server
npm run e2e
```

The suite runs on an **iPhone 13 viewport** (the primary target) against
`next start` (port 3100 by default; override with `E2E_PORT` to run two
suites at once). One suite per spec file — a contract test fails this file
if a spec exists that is not described here:

- `onboarding.spec.ts` — onboarding → profile creation → persistence across
  reload; the recommended plan preview (3–5 exercises, duration estimate);
  a second household profile.
- `session.spec.ts` — a complete Reaction block (summary, XP, streak,
  records survive reload), early-quit semantics (nothing saved without a
  completed block), Number Span presentation + keypad input, and
  backgrounding discarding the in-flight round instead of scoring it.
- `practice.spec.ts` — practice at a chosen fixed level runs and leaves no
  trace in XP, streak or levels.
- `family.spec.ts` — launch picker with several profiles; PIN-gated
  switching.
- `audio-exercises.spec.ts` — sound-dependent exercises play and score; the
  library lists all nine exercises.
- `i18n.spec.ts` — switching to Swedish translates the app and persists.
- `coach.spec.ts` — the optional AI coach is off, unconfigured and
  non-posting by default; errors carry no upstream detail.
- `offline.spec.ts` — manifest/service-worker headers, **offline startup**
  from a genuinely cold cache, and offline reload with data intact. The
  offline tests are Chromium-only: WebKit's `setOffline`/`route.abort` cut
  navigation above the service worker, so an outage the worker can answer
  cannot be simulated there (the reason is recorded in the spec; the
  feature itself was verified on WebKit by killing the server).
- `a11y.spec.ts` — axe-core scans of onboarding, all four tabs, exercise
  instructions and the quit dialog — the suite fails on any serious or
  critical violation — plus focus-trap and Escape behaviour for modals.
- `sync.spec.ts` — two browser contexts act as two devices on the v3
  protocol: device A sets up sync and walks the mandatory save-your-code
  step, device B restores from the welcome screen with that code, changes
  merge both ways; a wrong passphrase restores nothing, and a mistyped code
  is called out as a code typo rather than blamed on the data. Sync records
  go to `.sync-test-data/` (gitignored) via the web server's
  `SYNC_DATA_DIR`.

In sandboxed environments without Playwright's downloaded browsers, point the
suite at a system Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run e2e
```

## Browsers

The default e2e run is `mobile-chromium` — Chromium at iPhone dimensions.
That is a **viewport**, not an engine: it shares nothing with Safari, which is
what the primary target actually runs.

`webkit-mobile` runs the same specs on WebKit:

```bash
E2E_WEBKIT=1 npx playwright test --project=webkit-mobile
```

CI runs it as a **required** step since 2026-08-02, promoted from
non-blocking after nine consecutive green step runs (the two offline tests
are skipped there, with the reason attached in the spec). A WebKit failure
fails the job — Safari's engine is what the primary target actually runs.

If WebKit refuses to launch locally, it is usually these three system
packages (`playwright install-deps` wants interactive sudo, so install them
directly):

```bash
sudo apt-get install libevent-2.1-7t64 libavif16 libmanette-0.2-0
npx playwright install webkit
```

No automated browser exercises a real screen reader. The manual VoiceOver
pass in `docs/voiceover-protocol.md` would, but it was deliberately descoped
— screen-reader support is not a target (see `docs/accessibility.md`,
"Deliberately out of scope").

## CI

`.github/workflows/ci.yml` runs on PRs and pushes to main: `npm ci` (lockfile
enforced) → format check → lint → typecheck → unit tests → production build →
e2e (Chromium, then WebKit — both required) → Docker build for **amd64 + arm64
on PRs too** — building arm64 only after merge hid a broken Raspberry Pi
image twice.
