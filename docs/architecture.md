# Architecture

Cortex is a Next.js 15 (App Router) PWA in strict TypeScript. The guiding rule:
**gameplay logic is pure and framework-free; React only orchestrates timing and
rendering; persistence sits behind one interface.**

## Layers

```
src/
├── app/                     # Application shell (routes)
│   ├── (tabs)/              #   Tabbed pages: Today, Train, Stats, Profile
│   ├── welcome/             #   Onboarding + profile creation
│   ├── session/             #   Session runner (fullscreen, no tabs)
│   ├── offline/             #   SW navigation fallback
│   └── api/health/          #   Container health probe
├── components/
│   ├── app/                 # Providers: profile context, SW registration
│   ├── game/                # One component per exercise (renders ONE round)
│   ├── session/             # SessionRunner + SessionSummary
│   └── ui/                  # Buttons, charts, icons, progress
└── lib/
    ├── domain/              # Types + exercise registry (persisted shapes)
    ├── engine/              # Seeded RNG (mulberry32)
    ├── exercises/           # Pure trial generation + scoring per exercise
    ├── adaptive/            # Central difficulty engine
    ├── session/             # Planner (pure) + applySession (pure)
    ├── progression/         # XP curve, streak model, achievements
    ├── stats/               # Aggregations for the statistics screens
    ├── audio/               # Web Audio + SpeechSynthesis engine
    └── storage/             # StorageAdapter, IndexedDB impl, migrations,
                             # export/import, profile factory
```

## Key contracts

### Exercise engines (`lib/exercises/*`)

Every engine exposes three pure pieces:

- `<name>Params(level, …)` — maps the integer difficulty level to concrete
  parameters (span, grid size, timing).
- `generate…(rng, params)` — produces a trial from an injected seeded RNG.
- `score…(expected, response)` — returns accuracy (0..1) plus exercise-specific
  facts (perfect, prefix length, hits/false alarms…).

No engine imports React, the DOM, storage or the clock. This is what makes
trials reproducible in tests (fixed seeds) and keeps rules independent of UI.

### Game components (`components/game/*`)

A game component renders **one round** and reports a `RoundResult`
(`accuracy`, `perfect`, optional `responseMs`, human `detail`, numeric
`extras`). It owns presentation timing (setTimeout choreography, keyboard
handlers, audio) and nothing else.

### Session runner (`components/session/SessionRunner.tsx`)

The runner owns the session state machine
(`overview → instructions → playing → feedback → … → summary`), and per round:

1. asks the adaptive engine for the next skill state,
2. computes XP for the round,
3. re-mounts the game with a fresh seed.

At the end it builds a `SessionRecord`, runs `applySession` (pure: streak,
records, achievements) and persists profile + session through the storage
adapter. Quitting mid-session saves completed blocks only.

### Storage (`lib/storage/*`)

`StorageAdapter` is the only persistence surface (profiles, sessions, meta).
The sole implementation wraps IndexedDB via `idb`. Profiles carry a
`dataVersion`; `migrations.ts` upgrades old records on read and persists the
result. Export/import round-trips the whole database as validated JSON.
A future sync backend implements or wraps this same interface (see ADR 0002).

### Adaptive difficulty (`lib/adaptive/engine.ts`)

One engine for all exercises; continuous skill level per (profile, exercise);
documented in [adaptive-difficulty.md](adaptive-difficulty.md) and ADR 0003.

## Rendering & performance notes

- All pages are client components rendering from IndexedDB; the server only
  serves static assets (core gameplay is server-independent).
- Timed exercises avoid re-render churn: streams are pre-generated, mutable
  bookkeeping lives in refs, and only the visible stimulus is state.
- Reaction timing uses `performance.now()` captured in the click handler —
  never network or server time.
- Charts are hand-rolled SVG (~2 kB) instead of a charting library.
- System font stack: zero font bytes, native feel on iOS.

## PWA

Hand-written service worker (`public/sw.js`): cache-first for immutable build
assets, network-first for navigations with cached-shell fallback, never caches
`/api/` or user data. Update flow via `SKIP_WAITING` message + reload prompt.
See ADR 0004.
