# Accessibility

Cortex is built to be usable by as many people as possible, and honest about
where it falls short. This document records what is implemented, what is
deliberately labelled rather than faked, and what still needs verification on
real devices with real assistive technology.

## Implemented

- **Keyboard play** for the core exercises: digits/Backspace/Enter in Number
  Span, space bar for N-Back and Reaction, A/L for Dual N-Back. Sound Span is
  touch/pointer only — its keypad has no key handler.
- **Focus management**: dialogs (session quit, profile reset/delete, PIN,
  sync) trap focus, restore it to the trigger on close, and dismiss on
  `Escape`.
- **Live regions** for round feedback and status messages, so outcomes are
  announced rather than only shown.
- **No colour-only outcomes**: every correct/incorrect state carries a shape,
  icon or text label in addition to colour.
- **Contrast**: dim and faint text tokens were re-tuned against the dark
  background (`--color-ink-faint` is 5.6:1 — above the 4.5:1 threshold).
- **Touch targets** of at least 44 × 44 px throughout.
- **Preferences**: larger text, reduce motion (also honouring the OS setting),
  volume, and kid mode (larger interface, gentler ramp).
- **Automated audits**: `@axe-core/playwright` scans onboarding, all four
  tabs, exercise instructions and dialogs on every CI run; the suite fails on
  any serious or critical violation.

## Sensory requirements are labelled, not pretended away

Three of the twelve exercises are inherently visuospatial: the stimulus _is_ a
flashed grid, a square's position, or a colour change. There is no honest way
to render that through a screen reader, and inventing a "sonified grid" would
be a different exercise wearing the same name. So each exercise declares what
it needs:

| Exercise        | Sight | Sound | Non-visual counterpart          |
| --------------- | ----- | ----- | ------------------------------- |
| Number Span     | yes   | no    | Sound Span (same task, by ear)  |
| Sequence Memory | yes   | no    | Tone Pattern                    |
| Pattern Recall  | yes   | no    | —                               |
| N-Back          | yes   | no    | Sound Span / Dual N-Back stream |
| Dual N-Back     | yes   | yes   | —                               |
| Sound Span      | no    | yes   | —                               |
| Tone Pattern    | no    | yes   | —                               |
| Rhythm Recall   | no    | yes   | —                               |
| Reaction        | yes   | no    | —                               |
| Go/No-Go        | yes   | no    | —                               |
| Name Recall     | yes   | no    | —                               |
| Split Second    | yes   | no    | —                               |

The requirement is shown on each library card and repeated in the exercise's
instructions screen, next to the pointer at its closest non-visual equivalent.

**Profile → Preferences → "Skip exercises that need sight"** turns this into a
filter: planned sessions draw only from the non-visual set, and the library
shows those first (the rest stay one explicit tap away, and direct links keep
working — nothing becomes unreachable). What remains is a complete, adaptive
programme of four to five daily minutes across auditory memory, working
memory and attention — narrower than the full set, but real training rather
than a courtesy stub.

Exercises needing sound already state so on their instructions screen and
refuse to start silently — Sound Span shows an "audio unavailable" panel
instead of degrading into a visual exercise.

## What the automated audit now covers (issue #6)

The e2e suite fails CI on any serious/critical axe violation across: the
onboarding steps, all four tabs, the privacy page, exercise instructions,
LIVE game phases (an armed reaction round, the number-span keypad), the
quit and profile-confirm dialogs, every sync dialog (join, sync-code,
lost-device), the offline fallback, and the session summary. Dialogs are
tested for the full keyboard contract — trap, Escape, and focus
restoration to the trigger. Token contrast is pinned in a unit test
(`src/lib/a11yContrast.test.ts`), because axe only measures the pages it
visits while a token change moves every caption in the app at once.

## Deliberately out of scope

- **Pinch/double-tap zoom is disabled app-wide** (decided 2026-08-12). A
  zoomable standalone app pans around its own interface and reads as
  broken, and an accidental pinch or double-tap during a timed exercise
  corrupts the round it lands in. The supported low-vision accommodation
  is the **Larger text** preference (plus the OS text-size setting, which
  the app's relative units follow). Consequences owned openly: axe's
  `meta-viewport` rule fires on this by design and is excluded from the
  audit with a comment pointing here (`e2e/a11y.spec.ts`); users who rely
  on zoom rather than text scaling lose that path.
- **Screen-reader support (VoiceOver)** is not a target for Cortex (decided
  2026-08-11, issue #109). The app is a household training app whose users do
  not use a screen reader; the manual walkthrough that would have validated
  the screen-reader experience was descoped rather than run. The automated
  axe audits stay in CI as a markup-quality floor — they also catch problems
  (labels, contrast, focus order) that affect sighted keyboard and low-vision
  users — but no claim is made that timed exercises are usable with a screen
  reader. The scripted protocol is kept at
  [`docs/voiceover-protocol.md`](voiceover-protocol.md) should the decision
  ever be revisited.

## Still open

- A **haptic** channel for Reaction (vibration as the GO signal) would give
  that exercise a non-visual pathway; `navigator.vibrate` is unavailable on
  iOS Safari, so this needs a device-specific evaluation before promising it.
  A native wrapper would provide it — see
  [`adr/0009-native-packaging.md`](adr/0009-native-packaging.md), where this
  is one of the four conditions that would reopen that question.

## Reporting

Accessibility problems are ordinary bugs — open an issue with the
`accessibility` label and describe the assistive technology, device and OS
version.
