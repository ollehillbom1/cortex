# Measurement honesty

This document states what Cortex measures, what it does not, and the copy
rules every feature must follow. It is a compass, not a literature review.

## What each exercise measures — in-app, operationally

| Exercise                 | Metric           | Operational definition                                                                     | Known confounds                                                            |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Number Span / Sound Span | span length      | longest digit sequence reproduced in order (forward/reverse) at the adaptive level reached | practice effects, chunking strategies, input modality (keypad vs keyboard) |
| Sequence Memory          | sequence length  | longest tile order reproduced from the start                                               | motor slips on small screens                                               |
| Pattern Recall           | pattern accuracy | hits minus wrong taps over pattern size at a timed exposure                                | screen size, viewing distance                                              |
| N-Back                   | accuracy         | (hits + correct rejections) / scoreable trials; false alarms tracked separately            | response-strategy bias (conservative vs liberal responding)                |
| Reaction                 | response time    | ms from stimulus change to pointer/key event via `performance.now()`                       | device/display latency, input method, time of day, caffeine, age           |

All metrics are **within-app observations**. They are affected by practice,
device, environment and motivation, and improvements on an exercise primarily
show you got better _at that exercise_.

## What Cortex does not claim

- It does **not** measure IQ, general intelligence or clinical cognition.
- It does **not** claim training transfers to everyday memory, work
  performance, or protection against cognitive decline or any medical
  condition.
- The evidence for _far transfer_ from computerised cognitive training is, at
  best, weak and contested: practice reliably improves trained tasks and
  closely related ones (_near transfer_), while claims of broad benefits have
  not held up under rigorous review (see Owen et al. 2010, _Nature_;
  Melby-Lervåg & Hulme 2013, _Dev. Psychology_; Simons et al. 2016,
  _Psychological Science in the Public Interest_).

Cortex is therefore framed as **training with measurable in-app performance
and progression** — enjoyable, effortful practice with honest feedback.

## Copy rules for all UI text, docs and marketing

Allowed:

- "your accuracy / span / reaction time in Cortex"
- "your Number Span level went up"
- "in-app performance", "training zone", "personal best"

Not allowed (in any language):

- "improves your IQ / intelligence / brain health"
- "prevents / delays dementia, Alzheimer's or cognitive decline"
- "scientifically proven to make you smarter"
- presenting levels or XP as a cognitive assessment or diagnosis
- comparing users to population norms as if the app were a validated test

Rule of thumb: every claim must be verifiable from the user's own session
data, and must name the exercise rather than a mental faculty when in doubt.
CONTRIBUTING.md binds contributors (and AI agents) to these rules; the
AI-coaching roadmap item (#11) must generate sentences only from structured
in-app facts.

## If validation is ever pursued

A defensible first step is **reliability of Cortex's own metrics** —
test–retest stability of span, n-back accuracy and reaction time across
sessions under controlled conditions. That would justify statements like
"this measurement is stable", never "this improves cognition". Anything
beyond that (transfer claims) requires pre-registered controlled studies and
is out of scope for a self-hosted app; we simply will not make those claims
without them.
