/*
 * Cortex service worker.
 *
 * Strategy (see docs/adr/0004-offline-strategy.md):
 * - /_next/static, icons, manifest: cache-first (content-hashed / immutable).
 * - navigations (HTML): network-first with cache fallback, so updates arrive
 *   promptly online and the app still opens offline after the first visit.
 * - RSC payloads and /api/*: network-only. Serving a cached RSC response
 *   hands the app stale data that looks live; user data lives in IndexedDB
 *   and never belongs in a cache.
 *
 * The cache name carries the build id, passed on the registration URL
 * (`/sw.js?v=<buildId>`). A fixed name meant every release piled its chunks
 * into one cache that was never cleared, and a page cached by an older build
 * could be served to a newer one.
 */

const BUILD_ID = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PREFIX = "cortex";
const RUNTIME_CACHE = `${CACHE_PREFIX}-${BUILD_ID}`;

const PRECACHE_URLS = ["/", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

/**
 * Cache the shell AND the build assets it references.
 *
 * Caching only the HTML routes was not enough for a genuinely cold start:
 * with the normal HTTP cache cleared, every /_next/static chunk was missing
 * and the app rendered as a bare tab bar. The asset names are build-specific,
 * so they are read out of the shell HTML rather than hard-coded.
 */
async function precache() {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    await cache.addAll(PRECACHE_URLS);
  } catch {
    /* Best-effort: runtime caching still covers what is fetched later. */
  }
  try {
    const shell = await cache.match("/");
    if (!shell) return;
    const html = await shell.clone().text();
    const assets = new Set();
    for (const match of html.matchAll(/["'(](\/_next\/static\/[^"')\s]+)["')\s]/g)) {
      assets.add(match[1]);
    }
    await Promise.all(
      [...assets].map((url) =>
        cache.add(url).catch(() => {
          /* One missing asset must not fail the whole install. */
        }),
      ),
    );
  } catch {
    /* Parsing is opportunistic; never block activation on it. */
  }
}

self.addEventListener("activate", (event) => {
  // claim() is part of activation: awaited, so a page is not left talking to
  // the previous worker while the new caches are in place.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

/** True for React Server Component payloads, which must never be cached. */
function isRscRequest(request, url) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or RSC payloads.
  if (url.pathname.startsWith("/api/") || isRscRequest(request, url)) return;

  // Immutable build assets and icons: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page navigations: network-first, falling back to cached shell.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request, url));
    return;
  }

  // Everything else same-origin: network first, cache as a fallback. These
  // are not content-hashed, so serving them cache-first could pin stale
  // responses for the lifetime of the build.
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    // Awaited: an un-awaited put can be cut short when the worker is killed
    // right after the response is returned.
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function navigationHandler(request, url) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(url.pathname, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      (await cache.match("/offline"));
    if (cached) return cached;
    return new Response("Cortex is offline and this page has not been cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
