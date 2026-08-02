import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Cortex is local-first: no third-party scripts, fonts, trackers or CDNs.
 * `'unsafe-inline'` is required for Next.js hydration bootstrap scripts and
 * Tailwind's inline style attributes; everything else is locked to 'self'.
 * See docs/adr/0005-security-headers.md for the reasoning.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/**
 * A per-build identifier exposed to the client.
 *
 * The service worker scopes its caches by it, so each release gets its own
 * cache and the previous one is deleted on activation. Falls back to a
 * timestamp when the deploy does not pass one in.
 */
const buildId = process.env.BUILD_ID || process.env.SOURCE_COMMIT || String(Date.now());

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The service worker must always be revalidated so clients pick up
        // new versions promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
