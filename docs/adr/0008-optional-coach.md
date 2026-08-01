# ADR 0008: Optional AI phrasing of insights

- **Status**: accepted
- **Date**: 2026-08-01
- **Issue**: #11 (phase 2)

## Context

Phase 1 of issue #11 shipped a deterministic rule-based insight engine: pure
functions over the user's own session data that produce one short observation
at a time ("Your accuracy tends to dip late in sessions…"). It works offline,
is unit-tested per rule, and every sentence is a template.

Phase 2 asks whether a language model can make that phrasing warmer and more
varied. The obvious version of this feature — send the user's training history
to a model and ask for coaching — is incompatible with everything Cortex
promises: no telemetry, no third-party requests, strict `default-src 'self'`
CSP, and no claims about cognition or health. The issue itself scopes it
tightly: _"natural-language phrasing of Phase-1 insights only — the model
never invents claims; it re-phrases structured facts."_

The design problem is therefore not "how do we add an LLM" but "how do we make
that constraint enforceable rather than aspirational".

## Decision

### Structured facts cross the wire, never sentences

`Insight` now carries a `fact` alongside its rendered `text`:

```ts
type InsightFact =
  | { kind: "streak-at-risk"; days: number }
  | { kind: "modality-imbalance"; modality: string; suggestion: ExerciseId | null }
  | { kind: "late-session-drop" }
  | { kind: "best-time-of-day"; part: DayPart; bestPct: number; worstPct: number };
```

Every field is a number or a value from a closed enum. There is no free-text
field, so a profile name, a timestamp or any other personal datum cannot leave
the device even by mistake — the type system and a strict server-side parser
both refuse it. The server renders the English sentence from _its own_ copy of
the templates; the browser's wording is never transmitted.

This also removes the prompt-injection surface: the browser cannot contribute
prompt text, only a validated fact.

### The operator brings the model; the browser talks only to us

`COACH_API_BASE` + `COACH_MODEL` (optional `COACH_API_KEY`) point at an
OpenAI-compatible endpoint the operator runs themselves — Ollama, llama.cpp,
LM Studio, vLLM. With nothing configured, `GET /api/coach` reports
`{configured: false}`, the setting does not render, and `POST` returns 503.

The browser only ever calls the same-origin `/api/coach`, so the strict CSP
stays untouched and no user who has not opted in makes a third-party request —
directly or indirectly.

### Two independent switches

The feature is on only when **both** the operator configured an endpoint
**and** the user enabled `aiCoach` in their profile (data version 8, default
false). Either one off means the deterministic text is what renders.

### Output is validated, and failure is silent and safe

Rephrased lines must survive `validateCoachLines` before display:

- **No invented numbers** — every digit run in a rewritten line must already
  appear in the fact it came from. This kills fabricated statistics, the most
  dangerous failure mode, with a check that cannot be argued with.
- **No health-adjacent vocabulary** — IQ, diagnosis, medical, treatment,
  dementia, cognitive decline, and their Swedish equivalents, matched on word
  boundaries.
- **Same number of lines**, each non-empty and under 240 characters.

Any violation, parse failure, timeout or non-200 response means the app keeps
its own wording. The user never sees an error; at worst they see the phrasing
they would have seen anyway.

## Alternatives considered

- **Let the model analyse raw statistics and generate coaching.** Rejected:
  it would require sending training history off-device, and no prompt makes
  "never claim anything about cognition" reliable when the model is reasoning
  rather than rewriting. The value gap over template phrasing does not justify
  it for a household app.
- **Run the model in the browser (WebLLM/transformers.js).** Genuinely
  local-first and tempting, but a multi-hundred-megabyte download onto phones,
  for cosmetic rewording, is a bad trade — especially with the PWA's offline
  cache budget in mind. Worth revisiting if small on-device models become
  routine.
- **Ship a default hosted endpoint.** Rejected outright: it would break the
  no-third-party promise for the whole product to benefit an optional feature.
- **JSON-structured model output.** Line-per-fact plain text with a strict
  parser is simpler and fails more obviously; JSON adds a parsing surface
  without adding safety, since the guardrails run on the text either way.

## Consequences

- Adding an insight rule now means adding a fact kind in two places (the
  engine and the wire protocol's parser/renderer). That duplication is
  deliberate: the server refusing to render a fact it does not know is what
  makes the protocol closed.
- The guardrails are conservative and will sometimes reject a perfectly good
  rewrite (a model that helpfully adds "about 3 times a week" gets dropped).
  A silent fallback to correct text is the right side to err on.
- `docs/measurement.md`'s copy rules now have a machine-checked counterpart
  for generated text, which is stronger than the human review the rest of the
  copy relies on.
- Cortex still ships with no keys, no endpoints and no network calls beyond
  its own origin. The default deployment is byte-for-byte as private as it was
  before this feature existed, and an e2e test asserts exactly that.
