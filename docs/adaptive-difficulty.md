# Adaptive difficulty

## Goals

- Keep each exercise in a challenging-but-achievable band: roughly **70–85 %
  round accuracy** over time.
- Calibrate new users quickly, then move smoothly — never a jump of more than
  one level step per round.
- Stay **deterministic and pure** so behaviour is fully unit-testable.

## Model

Each (profile, exercise) pair stores a `SkillState`:

| field      | meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `level`    | continuous float ≥ 1; `floor(level)` parameterises the exercise |
| `streak`   | consecutive rounds above/below the target band                  |
| `recent`   | ring buffer of the last 10 round accuracies                     |
| `attempts` | lifetime rounds played                                          |

Exercises map the integer level to concrete parameters in their
`…Params(level)` functions (span length, grid size, presentation time, n-back
N, delay windows). This keeps the engine generic and the mapping local to each
exercise.

## Update rule (`updateSkill`)

After each round with accuracy `a` (0..1):

| condition         | Δlevel                             |
| ----------------- | ---------------------------------- |
| `a ≥ 0.95`        | +0.60 (clearly too easy)           |
| `a ≥ 0.85`        | +0.40                              |
| `0.70 ≤ a < 0.85` | +0.10 (slow drift keeps challenge) |
| `0.50 ≤ a < 0.70` | −0.25                              |
| `a < 0.50`        | −0.50 (clearly too hard)           |

Modifiers, applied in order:

1. **Calibration**: first 3 attempts multiply Δ by 1.8 to find the user's level
   fast.
2. **Fatigue**: the runner passes `fatigue ∈ [0,1]` (minutes into session / 15).
   Downward steps are discounted by up to 50 % — late-session misses are more
   likely tiredness than a wrong skill estimate.
3. **Latency strain** ("correct but laboured"): each skill keeps a ring buffer
   of the last 10 answer times (`recentInputMs`, input-phase start →
   submission). Once ≥3 samples exist, an _upward_ step is halved when the
   round took more than 1.35× the user's own rolling median. Latency
   modulates, never dominates: it cannot turn a success into a step down, and
   it is skipped for reaction-style exercises whose accuracy is already
   speed-derived. The baseline is per-user per-exercise (a rolling median), so
   naturally deliberate users are not penalised.
4. **Safety valve**: from the 3rd consecutive sub-band round, an extra −0.25
   prevents a slow, demoralising grind at a too-high level.
5. **Clamp**: net Δ ∈ [−1, +1]; level ∈ [1, 40].

Reaction-style exercises map speed onto the same 0..1 scale
(`scoreReaction`: ≤220 ms ≈ 1.0 → ≥600 ms ≈ 0.3, −0.1 per false start) so one
engine serves every exercise.

## Why these numbers

The asymmetry (+0.10 inside the band vs −0.25 just below it) makes the level a
slightly conservative estimator: users sit at the top of their comfortable
range and break through on good days, which matches the 70–85 % target. The
convergence test in `engine.test.ts` simulates a user with fixed ability and
asserts the estimate settles within ±3 levels.

## Limitations (known and accepted)

- Answer latency only dampens up-steps; error _types_ (e.g. transpositions vs
  omissions in span tasks) are not yet analysed.
- `fatigue` is a linear proxy for time-in-session, not a measured state.
- Levels are per-exercise; there is no cross-exercise transfer of skill
  estimates.
- The engine adapts between rounds, not within a round.
- No forgetting model: a long absence returns you at your old level, and the
  first rounds back may feel hard (the safety valve limits the damage).

These are deliberate MVP trade-offs; see the roadmap issues for planned
improvements.
