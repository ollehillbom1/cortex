# ADR 0007: Optional end-to-end-encrypted device sync

- **Status**: accepted
- **Date**: 2026-07-31
- **Issue**: #2 (and the server half of #9)

## Context

Cortex is local-first: all training data lives in the browser's IndexedDB.
That is the right default, but a household using Cortex on a phone and a
tablet wants shared profiles and history, and a device that dies takes its
data with it. We already ship a self-hosted server (the Next.js container),
so a sync backend can live there without adding any third party.

Constraints that shaped the design:

- **Privacy must not regress.** The server operator (often a family member)
  should not be able to read anyone's training data.
- **No accounts.** Cortex has no logins and should not grow any.
- **The app must keep working fully offline**; sync is strictly additive.
- **Pi-friendly**: no database service, minimal write amplification.

## Decision

### One passphrase is the whole identity

Enabling sync asks for a passphrase (min 8 chars). From it the browser
derives, deterministically:

- the **group id** — `SHA-256("cortex-sync-id:v1:" + passphrase)` as 64 hex
  chars. This is what the server files the data under; being a one-way hash,
  it reveals nothing about the passphrase.
- the **encryption key** — PBKDF2 (310 000 iterations, SHA-256, salt = group
  id, context-prefixed input) → AES-GCM-256.

There is no registration step: two devices that type the same passphrase end
up at the same group id with the same key. The passphrase is a shared
household secret; whoever knows it can read and write the group. Lost
passphrase ⇒ unrecoverable data (the server cannot help), which we document
prominently.

### The server stores one encrypted record per group

`GET/PUT /api/sync/{groupId}` is a Next.js route handler backed by flat files
(`$SYNC_DATA_DIR/sync/{groupId}.json`, atomic tmp+rename writes). A record is
`{rev, blob, iv, updatedAt}` — ciphertext plus an integer revision. `PUT`
carries `expectedRev` and fails with **409** when it does not match the stored
revision (optimistic concurrency); the client then re-pulls, re-merges and
retries (bounded). No database, no auth layer, no plaintext.

### Merge is deterministic and needs no server logic

The client's cycle is _pull → decrypt → merge → apply locally → encrypt →
push_. Merge rules:

- **Sessions** are immutable events: union by id.
- **Profiles** are last-write-wins on a new `updatedAt` field (bumped on every
  user-driven change; data version 6 migration backfills it from `createdAt`).
  Ties break on a symmetric JSON comparison so both devices converge.
- **Deletions** use tombstones (`deletedProfiles` timestamps, plus per-profile
  `clearedSessions` watermarks for "reset progression"), so a deletion on one
  device does not resurrect from another device's copy. An edit _newer_ than
  the tombstone revives the profile — the most recent intent wins.

Sync runs on app start, after each completed session, and on demand; failures
are recorded in meta and never block the app.

## Alternatives considered

- **CRDTs (Yjs/Automerge)**: overkill — sessions are append-only and profile
  fields are LWW-friendly; a library would add ~100 kB and a new mental model.
- **Per-device server records merged on read**: server merging is impossible
  with E2E encryption (the server cannot read the records); client-side merge
  with one record + optimistic concurrency achieves the same with less state.
- **Accounts + tokens**: contradicts the no-account principle; a passphrase-
  derived group id gives capability-style access with zero server-side user
  management.
- **SQLite on the server**: flat files are sufficient at one record per
  household, and keep the container dependency-free and trivially backupable
  (the data directory volume _is_ the backup).

## Consequences

- The Docker image now has a writable volume (`/app/data`) — the only
  server-side state; backing it up covers issue #9's server half, and the
  welcome screen's "Restore from sync" is the restore path.
- The CSP stays `connect-src 'self'` — sync is same-origin by design and no
  external origins are ever contacted.
- Anyone with the passphrase can write garbage to the group (they could also
  read everything, which is the same trust boundary as a shared household
  secret). Rate limiting, if wanted, belongs in the reverse proxy.
- A future breaking change to the payload layout is versioned by the
  `dataVersion` field inside the encrypted state plus the derivation context
  strings (`:v1:`), which can be bumped in lockstep.
