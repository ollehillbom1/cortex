# ADR 0004: Hand-written service worker; network-first navigations

**Status**: accepted · 2026-07-31

## Context

Cortex must remain usable after the first successful load when the server is
down (self-hosters reboot Pis). Next.js has no built-in service worker;
libraries like Workbox or next-pwa add build complexity and opaque caching that
has historically caused stale-app bugs. User data must never enter HTTP caches.

## Decision

Ship a small hand-written `public/sw.js` (~100 lines):

| Request                                     | Strategy                                                      |
| ------------------------------------------- | ------------------------------------------------------------- |
| `/_next/static/*`, `/icons/*`, manifest     | **cache-first** (content-hashed/immutable)                    |
| navigations (HTML)                          | **network-first**, fallback to cached page → `/` → `/offline` |
| other same-origin GET (late chunks, images) | cache-first with network fill                                 |
| `/api/*`, non-GET, cross-origin             | **never handled/cached**                                      |

`/`, `/offline` and the manifest are precached at install (best-effort).
Updates: the SW is served with `no-cache`; a waiting worker triggers an in-app
"reload" prompt which posts `SKIP_WAITING` and reloads on `controllerchange`.
Old caches are deleted on activate.

## Rationale

- Network-first navigations mean online users always get the newest HTML while
  offline users get the cached shell — the classic stale-PWA failure mode is
  structurally avoided.
- User data lives in IndexedDB (ADR 0002), so the cache layer holds only code
  and assets; nothing personal, nothing mutable.
- ~100 auditable lines beat a generated 300 kB Workbox bundle for this size of
  app.

## Consequences

- Full offline coverage of a page requires having visited it once (runtime
  caching); the precached `/` shell covers the common entry path either way.
- The e2e suite asserts offline startup to keep the strategy honest.
