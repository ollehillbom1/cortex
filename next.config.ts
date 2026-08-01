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

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Building the arm64 image runs under QEMU emulation, where Next's parallel
  // build workers intermittently die with SIGILL. Single-process builds remove
  // the worker that crashes. Set only in the Docker build, so native builds
  // (local and CI) keep their parallelism. See the Dockerfile for why this is
  // a mitigation rather than a confirmed fix.
  ...(process.env.NEXT_SINGLE_PROCESS_BUILD === "1"
    ? { experimental: { workerThreads: false, cpus: 1 } }
    : {}),
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
