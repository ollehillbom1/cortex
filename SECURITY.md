# Security

## Reporting a vulnerability

Please open a GitHub issue with the label `security` (for this self-hosted,
no-cloud project the attack surface is local, and public coordination is
acceptable). If the issue could realistically endanger other self-hosters,
e-mail the repository owner via the address on their GitHub profile instead and
allow a reasonable window before public disclosure.

## Security model

Cortex is a static-ish Next.js app with one health endpoint and one optional
sync endpoint. There is no authentication and no database; the only server-side
state is the sync store: **end-to-end-encrypted blobs** the server cannot read
(see below). The main assets to protect are the user's local data and the
integrity of the served code.

Measures in place:

- **Strict security headers** on every response (`next.config.ts`):
  restrictive Content-Security-Policy (`default-src 'self'`, no external
  origins), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, minimal `Permissions-Policy`.
- **No third-party runtime dependencies in the browser** beyond React/Next and
  the ~1 kB `idb` wrapper; no CDNs, no external fonts.
- **Validated import**: JSON imports are structurally validated, size-capped and
  length-capped; unknown formats and future versions are rejected; imports are
  additive and cannot overwrite existing records.
- **Safe rendering**: user-controlled values (names) are rendered as React text
  nodes only, never as HTML.
- **Service worker** caches same-origin GET requests only and never caches API
  responses; it is served with `no-cache` so updates propagate.
- **Docker**: multi-stage build, non-root runtime user, no secrets in the image,
  minimal alpine base, health check without external calls.
- **No secrets in the repository**; configuration is documented in
  `.env.example` (ports and a data directory — no keys exist).
- **Sync endpoint** (`/api/sync/{groupId}`): the browser encrypts everything
  with AES-GCM-256 before upload (key: PBKDF2, 310 000 iterations, derived from
  the household passphrase); the server never sees the passphrase or key, only
  a hash-derived 64-hex group id, ciphertext, IV and a revision counter. Input
  is strictly validated (hex id, base64 payload, size caps) and writes use
  optimistic concurrency, so a stale device cannot silently overwrite newer
  data. Knowing a passphrase grants read/write to that group — that is the
  model (a shared household secret), so passphrases should be long and the
  server ideally not exposed beyond your LAN/VPN.

## Deployment recommendations

- Serve over **HTTPS** (required for service workers anyway); see
  `docs/deployment.md` for reverse-proxy examples.
- Keep the container up to date (`docker compose pull/build` after upgrades).
- If exposing beyond your LAN, put standard reverse-proxy rate limiting in
  front; the app itself has no login to brute-force.

## Dependency review

Dependencies are intentionally few (`next`, `react`, `react-dom`, `idb` at
runtime). `npm ci` is enforced in CI from the lockfile. Run `npm audit` before
upgrades and prefer minor pins over broad ranges.
