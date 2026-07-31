# ADR 0006: System fonts and zero external assets

**Status**: accepted · 2026-07-31

## Context

"Premium" usually pulls teams toward webfonts and CDN assets. Cortex targets
iPhones, Raspberry Pi self-hosting, offline use and a no-telemetry privacy
posture.

## Decision

- **System font stack** (SF Pro on iOS, Roboto on Android, Segoe on Windows):
  zero font bytes, native feel on the primary device, no build-time font
  downloads (which also keeps Docker/CI builds hermetic).
- **No external requests of any kind at runtime**: icons are inline SVG, charts
  are hand-rolled SVG, exercise audio is synthesised (Web Audio /
  SpeechSynthesis) rather than shipped media files.
- Brand identity comes from colour, gradients, depth, spacing and motion
  instead of typography licensing.

## Consequences

- The CSP can stay `'self'`-only (ADR 0005) and PRIVACY.md's "no third-party
  requests" claim is enforced by construction.
- Typeface rendering differs slightly across platforms; accepted.
- First-load JS stays ~100 kB gzip-ish shared — comfortably fast on home
  networks and Pi hosting.
