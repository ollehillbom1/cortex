# ADR 0001: Next.js App Router as the application framework

**Status**: accepted · 2026-07-31

## Context

Cortex needs a mobile-first installable PWA with offline gameplay, strict
TypeScript, small bundles, easy self-hosting on ARM64/x86_64, and no cloud
dependency. Candidates: Next.js (App Router), Vite + React SPA, SvelteKit.

## Decision

Use **Next.js 15 App Router** with React 19, TypeScript strict and Tailwind 4,
built with `output: "standalone"` for a small self-contained Node server.

## Rationale

- Standalone output gives a tiny, dependency-pruned production server that maps
  cleanly onto a non-root Docker image — the simplest credible self-host story.
- `headers()` lets us ship a strict CSP and security headers without a separate
  proxy config.
- App Router route groups model our two shells (tabbed app vs fullscreen
  session/onboarding) cleanly.
- The team-of-the-future is most likely to know React + Next.

A pure Vite SPA would also work (the app is client-rendered from IndexedDB) but
would need a separate static server, header management and health endpoint.
Since gameplay is entirely in `src/lib` (framework-free), migrating later is
cheap.

## Consequences

- All interactive pages are client components; the server renders only shells.
- The service worker is hand-written (ADR 0004) because Next has no built-in
  PWA story.

## Update (2026-08-01)

The decision stands; the version does not. The app runs **Next.js 16** with
Turbopack production builds since the security upgrade in PR #24. This ADR is
left as written — it records what was decided at the time, not what is true
now — with this note so a reader is not misled by the version number.
