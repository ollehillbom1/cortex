# ADR 0005: Strict CSP with 'unsafe-inline' script exception

**Status**: accepted · 2026-07-31

## Context

Cortex should ship hardened headers by default, self-hosted behind arbitrary
proxies. Next.js App Router injects inline bootstrap scripts; a nonce-based CSP
requires per-request middleware and disables static optimisation of pages.

## Decision

Set a restrictive CSP in `next.config.ts`: every directive locked to `'self'`
(no external origins at all, `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`), with `script-src 'self' 'unsafe-inline'` and
`style-src 'self' 'unsafe-inline'` as the only relaxations. Plus `nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and a deny-by-default
`Permissions-Policy`.

## Rationale

With **zero external script sources allowed**, `'unsafe-inline'` is only
exploitable if an attacker can already inject markup — and the app renders no
user-controlled HTML (React text nodes only, validated imports). Trading that
residual risk for static pages + simpler deployment is reasonable for a
local-first app with no server-side user content. Revisit with nonces if any
server-rendered user content ever appears.

## Consequences

- Documented residual risk (above).
- Adding any external resource (fonts, CDNs, analytics) is a deliberate,
  visible CSP change — which doubles as a privacy guard.
