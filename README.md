# Cortex

**Cortex is a premium, self-hosted cognitive training PWA.** Short daily sessions —
5 to 20 minutes — train working memory, visual and auditory memory, attention and
speed through six adaptive exercises. Everything runs in your browser, installs to
your home screen, works offline, and stores data only on your device.

Cortex measures **in-app performance** (accuracy, span, reaction time) and shows how
it develops over time. It does not measure IQ and makes no medical claims — see
[docs/measurement.md](docs/measurement.md) for exactly what is and is not measured.

| Onboarding                                     | Today                                 | Exercise intro                                        | Reaction                                         | Statistics                              |
| ---------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| ![Onboarding](docs/screenshots/01-welcome.png) | ![Home](docs/screenshots/03-home.png) | ![Instructions](docs/screenshots/06-instructions.png) | ![Reaction](docs/screenshots/08-reaction-go.png) | ![Stats](docs/screenshots/09-stats.png) |

## Exercises

| Exercise            | Trains                     | Mechanics                                                                                                                                                 |
| ------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Number Span**     | Working memory             | Digits shown one at a time; recall forwards, and in reverse from level 4. Span and speed adapt.                                                           |
| **Sequence Memory** | Working + visual memory    | Tiles light up in order; repeat the order. Grid grows 3×3 → 4×4.                                                                                          |
| **Pattern Recall**  | Visual memory              | A tile pattern flashes briefly; rebuild it. Grid 3×3 → 5×5, timing adapts.                                                                                |
| **N-Back**          | Working memory + attention | Position n-back (1/2/3-back) with forced match rates, hit/miss/false-alarm scoring and guided onboarding.                                                 |
| **Sound Span**      | Auditory memory            | Digits spoken aloud (Web Speech), or tone melodies on four pads when speech is unavailable. Requires explicit tap-to-play; never silently becomes visual. |
| **Reaction**        | Speed + attention          | Random delay → GO. False-start detection, millisecond timing via `performance.now()`, averages and personal bests.                                        |

A central **adaptive difficulty engine** keeps every exercise near a 70–85 % success
band with smooth, capped steps — see [docs/adaptive-difficulty.md](docs/adaptive-difficulty.md).

## Features

- **Daily sessions** planned across modalities, biased to weak/stale skills, with
  time estimates and an end-of-session summary (accuracy, XP, records, level moves).
- **Local-first profiles** for the whole household — no accounts, no cloud. Data
  lives in IndexedDB with versioned migrations, JSON export/import, reset and delete.
- **Restrained gamification**: XP and levels, achievements tied to real behaviour,
  personal bests, a daily goal and a humane streak (freezes earned every 7 days
  protect a single missed day; missing more never erases records or XP).
- **Statistics**: 4-week activity, accuracy and reaction-time trends, per-exercise
  levels, modality balance and records — dependency-free SVG charts.
- **Real PWA**: installable (standalone display), offline after first load,
  update prompt, iPhone home-screen guidance in the app.
- **Accessibility**: keyboard play for core exercises, visible focus, ARIA labels
  and live regions, focus-trapped dialogs, large-text and reduce-motion settings,
  ≥44 px touch targets, no colour-only outcomes — enforced by an axe-core audit
  in the e2e suite.
- **Data safety**: gentle backup reminders when progress is unexported, and
  persistent-storage protection (`navigator.storage.persist()`) requested on
  profile creation with status shown in the app.

## Architecture

```mermaid
flowchart TB
    subgraph UI["UI (React / Next.js App Router)"]
        Pages["Pages: Today · Train · Stats · Profile · Welcome"]
        Runner["Session runner"]
        Games["Game components (one round each)"]
    end
    subgraph Domain["Domain (pure TypeScript, fully unit-tested)"]
        Engines["Exercise engines\ntrial generation + scoring"]
        Adaptive["Adaptive difficulty engine"]
        Planner["Session planner"]
        Progress["XP · streak · achievements"]
        Stats["Statistics aggregation"]
    end
    subgraph Infra["Infrastructure"]
        Storage["StorageAdapter → IndexedDB (idb)\nmigrations · export/import"]
        Audio["Audio engine\nWeb Audio + SpeechSynthesis"]
        SW["Service worker\noffline shell + assets"]
    end
    Pages --> Runner --> Games
    Games --> Engines
    Runner --> Adaptive
    Runner --> Planner
    Runner --> Progress
    Pages --> Stats
    Runner --> Storage
    Pages --> Storage
    Games --> Audio
    UI -.installed & cached by.-> SW
```

Exercise rules and scoring are pure functions with injected seeded RNG — no React,
no I/O — so gameplay is deterministic and testable. The UI orchestrates phases and
timing; `StorageAdapter` isolates persistence so a sync backend can be added later.
Details: [docs/architecture.md](docs/architecture.md) · decisions: [docs/adr](docs/adr).

## Getting started

Requires Node.js 20+ (22 recommended).

```bash
npm ci
npm run dev          # http://localhost:3000
```

Quality gates:

```bash
npm run verify       # format check + lint + typecheck + unit tests + build
npm run test         # vitest unit tests (64 tests, pure logic)
npm run e2e          # Playwright e2e (production build; run `npm run build` first)
```

## Docker

```bash
docker compose up -d --build     # serves on :3000, non-root, healthchecked
```

Or manually:

```bash
docker build -t cortex .
docker run -d -p 3000:3000 --restart unless-stopped cortex
```

The container is stateless (all training data is in each browser's IndexedDB), so
no volumes are needed. Works on x86_64 and ARM64 — a Raspberry Pi 5 runs it
comfortably within the 512 MB compose memory limit.

### Raspberry Pi 5 (ARM64)

```bash
git clone https://github.com/ollehillbom1/cortex.git && cd cortex
docker compose up -d --build     # native arm64 build, ~5 min on a Pi 5
```

Then put a reverse proxy with HTTPS in front — **service workers and installation
require HTTPS** (or plain `http://localhost`). See
[docs/deployment.md](docs/deployment.md) for Caddy/nginx examples, updates and
backups.

## Privacy & security

- All data stays in the browser (IndexedDB). No accounts, no telemetry, no
  third-party requests — fonts are system fonts, charts are local SVG.
- Strict security headers and CSP; validated JSON import; no secrets in the repo.
- Details: [PRIVACY.md](PRIVACY.md) · [SECURITY.md](SECURITY.md).

## Testing

Unit tests cover the adaptive engine, trial generation, scoring, n-back matching,
XP/levels, streaks, planning, migrations and import validation. Playwright drives
the critical flows on an iPhone viewport, including offline startup. See
[docs/testing.md](docs/testing.md).

## Roadmap

Tracked as GitHub issues — highlights: optional self-hosted sync backend, dual
n-back, richer auditory training, multilingual support, automated accessibility
audits, server-side backups. See the issue list for motivation and acceptance
criteria.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed — [LICENSE](LICENSE).
