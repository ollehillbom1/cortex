# Contributing to Cortex

Thanks for helping! This project values small, well-tested changes.

## Setup

```bash
npm ci
npm run dev
```

Before pushing:

```bash
npm run verify        # format check + lint + typecheck + unit tests + build
npm run build && npm run e2e   # for changes touching flows or games
```

## Ground rules

- **Pure logic stays pure.** Trial generation, scoring, difficulty, planning,
  progression and migrations live in `src/lib` with no React/DOM/storage/clock
  imports, take an injected RNG, and come with unit tests.
- **Storage goes through `StorageAdapter`.** Never touch IndexedDB directly
  from components. Any change to persisted shapes needs a `dataVersion` bump
  plus a migration and a test.
- **No new runtime dependencies** without discussion — bundle size, privacy
  (no external requests, see ADR 0006) and the strict CSP are features.
- **Accessibility is not optional**: keyboard operability, visible focus,
  labels/live regions, ≥44 px touch targets, no colour-only meaning, respect
  reduced motion.
- **No unsupported claims** in UI copy or docs: Cortex measures in-app
  performance, not IQ or clinical cognition.
- Significant design decisions get an ADR in `docs/adr/`.

## Adding an exercise (the short version)

1. `src/lib/exercises/<name>.ts` — pure `params/generate/score` + tests.
2. Register it in `src/lib/domain/types.ts` (`EXERCISES`).
3. `src/components/game/<Name>Game.tsx` — renders one round, reports
   `RoundResult`.
4. Wire it into `GAMES` in `SessionRunner`, add instruction copy in
   `lib/exercises/instructions.ts`.
5. The planner, adaptive engine, XP, stats and records pick it up from the
   registry.

## Commits & PRs

- Conventional-ish messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- PRs should say what changed, why, and how it was verified (commands run).
- CI (format, lint, types, unit, build, e2e, Docker) must pass.

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
