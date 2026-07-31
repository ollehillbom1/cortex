# ADR 0002: Local-first storage in IndexedDB behind a StorageAdapter

**Status**: accepted · 2026-07-31

## Context

The MVP must work fully without any account or cloud. Progression must survive
reloads, app restarts and offline use, support multiple household profiles, and
allow a future backend sync without a rewrite. localStorage is synchronous,
size-limited and string-only; important progression must not live in React
state.

## Decision

- All durable data (profiles, sessions, metadata) lives in **IndexedDB**,
  accessed through the ~1 kB **`idb`** wrapper.
- The app talks only to a **`StorageAdapter` interface**
  (`lib/storage/adapter.ts`); `IndexedDBAdapter` is the only implementation
  today.
- Profile records carry a **`dataVersion`**; ordered migrations upgrade old
  records on read and persist the result (`migrations.ts`). IndexedDB _schema_
  changes use `idb`'s `upgrade` callback separately.
- **Export/import** serialises everything to validated JSON; import is additive
  (never overwrites existing ids).

## Rationale

IndexedDB is the only widely-supported durable browser store fit for structured
data and offline PWAs. The adapter boundary means a sync backend can be added
as a wrapping adapter (local write-through + background push/pull) without
touching gameplay or UI. Two migration mechanisms (record-level vs schema-level)
keep data evolution cheap — most changes are record-shaped.

## Consequences

- React state is always a view; every mutation goes through storage first.
- Clearing site data destroys progress — mitigated by prominent export and a
  roadmap issue for server-assisted backup.
- iOS may evict IndexedDB for rarely-used non-installed sites; installing the
  PWA (which we encourage) makes eviction unlikely.
