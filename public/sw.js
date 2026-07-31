/*
 * Cortex service worker.
 *
 * Strategy (see docs/adr/0004-offline-strategy.md):
 * - /_next/static, icons, manifest: cache-first (content-hashed / immutable).
 * - navigations (HTML): network-first with cache fallback, so updates arrive
 *   promptly online and the app still opens offline after the first visit.
 * - /api/*: network-only. All user data lives in IndexedDB, never in caches.
 *
 * Bump CACHE_VERSION when the caching logic changes; old caches are removed
 * on activate. Page/asset freshness does not depend on this constant.
 */

const CACHE_VERSION = "cortex-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = ["/", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(RUNTIME_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        /* Precaching is best-effort; runtime caching covers the rest. */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses.
  if (url.pathname.startsWith("/api/")) return;

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

  // Everything else same-origin (images, chunks loaded late): cache, then network.
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function navigationHandler(request, url) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(url.pathname)) || (await cache.match("/")) || (await cache.match("/offline"));
    if (cached) return cached;
    return new Response("Cortex is offline and this page has not been cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
