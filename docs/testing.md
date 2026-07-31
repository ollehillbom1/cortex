# Testing

## Unit tests (Vitest)

```bash
npm run test          # or npm run test:watch
```

110 tests cover the pure core — every module in `src/lib` that contains logic:

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
`next start` on port 3100:

1. Onboarding → profile creation → persistence across reload.
2. Recommended session plan (3–5 exercises, duration estimate).
3. Household profile creation and switching.
4. A complete Reaction block: play 5 rounds, summary, XP, streak, records in
   Stats — then reload and verify everything came back from IndexedDB.
5. Early-quit semantics (nothing saved without a completed block).
6. Number Span presentation + keypad input.
7. PWA: manifest/service-worker headers, and **offline startup** after first
   visit (context goes offline, app reloads from SW cache with data intact).
8. **Accessibility audit** (`e2e/a11y.spec.ts`): axe-core scans of onboarding,
   all four tabs, exercise instructions and the quit dialog — the suite fails
   on any serious/critical violation — plus focus-trap and Escape behaviour
   for modals.

In sandboxed environments without Playwright's downloaded browsers, point the
suite at a system Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run e2e
```

## CI

`.github/workflows/ci.yml` runs on PRs and pushes to main: `npm ci` (lockfile
enforced) → format check → lint → typecheck → unit tests → production build →
e2e (chromium) → Docker build (amd64 on PRs; amd64+arm64 on main).
