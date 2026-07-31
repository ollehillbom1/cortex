# ADR 0003: One central adaptive difficulty engine

**Status**: accepted · 2026-07-31

## Context

Every exercise needs difficulty that tracks the user. Embedding bespoke
difficulty logic in each game leads to six inconsistent, untestable
implementations coupled to UI code.

## Decision

A single pure engine (`lib/adaptive/engine.ts`) owns the skill model: a
continuous per-(profile, exercise) `level` updated after every round from the
round's accuracy, session fatigue and the failure streak. Exercises only map
`floor(level)` → parameters in their own pure `…Params(level)` functions.
Reaction-style exercises translate speed onto the same 0..1 accuracy scale so
the engine stays universal.

Full algorithm and tuning rationale: [docs/adaptive-difficulty.md](../adaptive-difficulty.md).

## Rationale

- One place to reason about pacing (70–85 % target band, ±1 max step,
  calibration boost, fatigue discount, losing-streak valve).
- Deterministic and side-effect free → exhaustively unit-tested, including a
  convergence simulation.
- Exercise authors implement two small pure functions and inherit sane
  adaptivity.

## Consequences

- The engine sees only scalar accuracy; richer signals (within-exercise
  response times, error types) are recorded but unused for now — an accepted
  MVP limitation listed in the docs and roadmap.
