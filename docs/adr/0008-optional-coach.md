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
  | { kind: "modality-imbalance"; modality: Modality; suggestion: ExerciseId | null }
  | { kind: "late-session-drop" }
  | { kind: "best-time-of-day"; part: DayPart; bestPct: number; worstPct: number };
```

Every field is a number or a value from a closed enum, and there is no
free-text field, so a profile name cannot be placed in this payload without
both the type checker and the server-side parser objecting. The sentence is
rendered from the templates on the server; the browser's wording is never
transmitted.

One honest caveat: `best-time-of-day` carries a coarse time-of-day bucket
(`"morning"`), which is a _time_ in the ordinary sense even though it is not a
timestamp. PRIVACY.md says so rather than claiming no temporal data is sent.

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

### Output is checked with an allowlist, not a denylist

The first version of this used a denylist of forbidden words. Adversarial
review destroyed it: eleven health claims passed, including "…and strengthens
your working memory" and "Your brain is rewiring itself". The failure is
structural, not a missing entry — the app's own copy says "Working memory has
had little attention lately", so banning _memory_ would reject faithful
rephrasings of a real insight. In Swedish it was worse: compounding walks
straight through a word-boundary pattern, so `demens` never matched
"demensrisken".

The check therefore runs the other way round. Every content word in the output
must come from the source sentence or from a small closed set of connectives
and warmth words. "Strengthens" appears in neither, so the claim above is
rejected without anyone having had to predict that sentence. Four further
checks close the rest:

- **Numbers must match the source exactly** — none invented, none dropped, and
  none re-attached to a different unit, so a 5-day streak cannot become "5%
  ahead of other users". Unicode digits are normalised and spelled-out
  numerals rejected.
- **A faithfulness floor** — enough of the source's content must survive that
  refusals ("I'm sorry, I can't help") and unrelated text cannot render.
- **Model voice rejected** — preambles, apologies, "here is your rewrite".
- **Length bounded** relative to the source, leaving little room to append.

Sources are rendered in the _target_ locale, which is what makes any of this
work for Swedish: the model rephrases a Swedish sentence and its words are
compared against Swedish words.

Any violation, parse failure, timeout or non-200 response means the app keeps
its own wording. The user never sees an error; at worst they see the phrasing
they would have seen anyway.

### The route spends the operator's resources, so it is bounded

`/api/coach` has no one to authenticate — Cortex has no accounts. It does,
however, occupy a model for up to 20 seconds per call, and may bill a paid
provider. It is therefore rate limited per client and per instance, and the
deployment docs say to keep the instance off the public internet. Failures
return a fixed reason (`timeout`, `upstream-error`, `unparseable`,
`rejected`) and never upstream error text, which would otherwise disclose the
operator's internal hostnames and ports.

### One call per insight per day

Results are cached against the local day. Without that, the endpoint would see
a request per home-screen visit, and streak length plus accuracy percentages
arriving repeatedly is itself a household activity pattern.

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

- Adding an insight rule means adding a fact kind and a template in
  `protocol.ts`. The engine and the endpoint render through the same function,
  so the displayed sentence and the rephrased one cannot drift apart.
- **The guardrails are strict, and will often reject.** A rewrite that reaches
  for a synonym the source does not contain is refused — in Swedish,
  inflection alone ("liv" → "lever") is enough. Expect the deterministic
  wording to stand a good share of the time, more so in Swedish. That is the
  intended trade-off: the fallback is text that was always correct, and the
  alternative is a check that can be talked past.
- These are layered mitigations, not a proof. A sufficiently odd model, or a
  hostile endpoint the operator configured, can still produce something
  unhelpful within the allowlist. The feature is off by default, the operator
  chooses the model, and the blast radius is one sentence on the home screen.
- `docs/measurement.md`'s copy rules now have a machine-checked counterpart
  for generated text, which is stronger than the human review the rest of the
  copy relies on.
- Cortex still ships with no keys, no endpoints and no network calls beyond
  its own origin. The default deployment is byte-for-byte as private as it was
  before this feature existed, and an e2e test asserts exactly that.
