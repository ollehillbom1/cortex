# Deployment

Cortex ships as a single container. User data lives in each browser's
IndexedDB; the only server-side state is the optional device-sync store —
end-to-end-encrypted blobs under `/app/data` (a named volume in the compose
file). It runs identically on x86_64 and ARM64.

## Quick start (any Docker host)

```bash
git clone https://github.com/ollehillbom1/cortex.git
cd cortex
docker compose up -d --build
# → http://<host>:3000
```

`docker-compose.yml` sets a restart policy, a 512 MB memory limit, a health
check against `/api/health` — and a hardened runtime: read-only root
filesystem (with `/tmp` as tmpfs and the data volume as the only writable
mounts), all capabilities dropped, `no-new-privileges`, a PID limit and
rotated logs. The app needs none of what is closed off; the settings were
verified against the full surface (pages, health, sync writes). Override the
published port with `PORT=8080 docker compose up -d`.

## Raspberry Pi 5 (ARM64, 64-bit OS)

Identical commands — the multi-stage `Dockerfile` builds natively on arm64
(about 5 minutes on a Pi 5; use `docker compose build --progress plain` to
watch). Resource notes:

- Idle memory use is around 45 MiB, well under the 512 MB compose limit.

> **The limit and the hardening only apply if you start it with Compose.**
> `docker run` honours none of the compose file's settings, so pass them
> explicitly when not using Compose — this is exactly how the public
> deployment runs since 2026-08-03 (verified with `docker inspect`: memory
> 512 MiB, pids 256, read-only rootfs, all caps dropped):
>
> ```bash
> docker run -d --name cortex --restart unless-stopped \
>   --memory 512m --pids-limit 256 --read-only --tmpfs /tmp \
>   --cap-drop ALL --security-opt no-new-privileges \
>   --log-opt max-size=10m --log-opt max-file=3 \
>   -p 127.0.0.1:9922:3000 -v cortex-sync:/app/data cortex:latest
> ```

- No GPU, CUDA or external services are required.
- SD-card wear is negligible: the server only writes when a household with
  sync enabled finishes a session (one small file rewrite per sync).

## HTTPS and reverse proxy (required for PWA)

Service workers and home-screen installation require a **secure context**:
HTTPS, or `http://localhost` during development. Put any reverse proxy in
front; two examples, replace `cortex.example.com` with your host name:

**Caddy** (automatic Let's Encrypt):

```
cortex.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name cortex.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;  (e.g. via certbot)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

For LAN-only use without a domain, options are: a local CA (e.g. `mkcert`) with
the certificate installed on your devices, or Tailscale/`tailscale cert` which
gives every node a valid HTTPS name with zero exposure to the internet.

## Environment variables

See `.env.example`. `PORT`, `HOSTNAME` and `SYNC_DATA_DIR` (default `./data`,
`/app/data` in the image — where the sync endpoint stores encrypted blobs) are
all a normal deployment needs; no secrets or API keys are required.

Optionally, `COACH_API_BASE` + `COACH_MODEL` enable AI rewording of insights
against a language-model endpoint you run yourself, e.g. Ollama on the same
host:

```yaml
environment:
  - COACH_API_BASE=http://host.docker.internal:11434/v1
  - COACH_MODEL=llama3.2
```

Leave them unset and the feature does not exist — no setting appears in the
app and the endpoint refuses every request. Users must additionally opt in per
profile. Only structured numbers are sent, never names; see
[docs/adr/0008-optional-coach.md](adr/0008-optional-coach.md) and PRIVACY.md.

Two operational notes. `COACH_API_BASE` must be `https://` unless it points at
a loopback or private-network address — Cortex refuses to start the feature
otherwise rather than send statistics over plaintext internet. And because the
endpoint spends your compute (or your credit, against a paid provider) on
behalf of whoever can reach it, it is rate limited per client and per instance,
and you should keep a coach-enabled instance on your LAN or behind a VPN
rather than exposed publicly.

## Monitoring

`ops/watchdog.sh` probes a running deployment and pages a human when it
breaks. Install it with `ops/install-watchdog.sh`, which copies the script to
`~/.local/lib/cortex-ops/` (a stable path — the git checkout changes branches,
and a monitor that disappears with a branch fails silently) and writes an
idempotent cron line. It records the commit it was installed from in
`~/.local/lib/cortex-ops/INSTALLED`.

What it checks: the public `/api/health` endpoint (which exercises the whole
chain — proxy, TLS, app), certificate expiry, and — with `--local-checks`, on
the Docker host — container state/health, disk space, and backup freshness. It pages on the
second consecutive failure (a single blip during a redeploy is not an
outage), repeats every six hours while still down, and announces recovery.

Alarms go to the SMS gateway configured in `~/.hermes/.env`, with a WhatsApp
DM as fallback. Cron does not export that file, so the script sources it
itself.

Prove it rather than assume it:

```bash
ops/watchdog.sh --self-test    # state machine, offline, no SMS (also runs in CI)
ops/watchdog.sh --test-alarm   # one real message, so you know the path works
```

> **A watchdog on the Docker host cannot report that the Docker host is
> down.** The install supports `--remote-only` for exactly this: run it on a
> second machine (the reverse-proxy RPi is the natural home) and it probes the
> public URL, catching failures that a host-local watchdog can never see. Until
> that exists, host-side monitoring covers the common failures — container
> exited, app unhealthy, proxy or certificate broken, disk full — and nothing
> covers a dead host.

## Updating

```bash
git pull
docker compose up -d --build
```

Clients pick the new version up on next load; if a tab is open, the in-app
"new version ready" prompt appears once the new service worker has installed.

## Sync and backups

Device sync is opt-in per household: **Profile → Sync between devices →
Enable sync**, choose a passphrase, and enter the same passphrase on the
other device(s) — or on a brand-new device via **Restore from sync** on the
welcome screen. All payloads are encrypted in the browser before upload; the
server (you) only ever stores ciphertext. See `docs/adr/0007-sync-backend.md`
for the design and PRIVACY.md for the guarantees.

Backing up the server therefore means backing up one volume, and
`ops/backup-sync.sh` does it properly:

```bash
ops/backup-sync.sh --init             # once: generates the encryption passphrase
ops/install-backup.sh                 # nightly backup + weekly restore check
ops/backup-sync.sh --verify-restore   # any time: restore into a throwaway
                                      # volume and diff it against live
```

Each run streams the volume out through a helper container, encrypts with
gpg (AES-256) and then **decrypts its own output to confirm the archive is
readable** — an unreadable backup is worse than none, because you only find
out on the day you need it. The watchdog alarms if no successful run has been
recorded for 30 hours, so a cron that dies quietly cannot masquerade as a
backup.

> An earlier version of this document told you to `tar` a volume called
> `cortex_cortex-sync`. This deployment's volume is `cortex-sync`; the
> command produced a valid, empty, useless archive and said nothing was
> wrong. `backup-sync.sh` refuses to run against a volume that does not
> exist for exactly that reason.

**Retention is a human decision, never a timer.** Nothing in the sync store
expires automatically — the disaster case a TTL invites is an inactive
household's only backup deleted on schedule, silently. Instead: the
watchdog warns when the NEWEST record has gone quiet (default 21 days,
`CORTEX_SYNC_STALE_DAYS`), the app marks devices that have not synced in
two weeks, and `ops/sync-store.sh` lets the operator `list` the store and
`reap --older-than-days N` deliberately — dry-run by default, and the most
recent record is never reaped regardless of age.

Keep the passphrase (`~/.config/cortex/backup.key`) somewhere other than this
machine — it is the machine the backups exist to survive. For households with
sync enabled the backup covers everything; the blobs stay readable only with
the household's sync code. Users who never enable sync should still
occasionally use **Profile → Your data → Export JSON** and keep the file.

## Releases and rollback

"Deploy main" is not a release: two deploys of `main` an hour apart are
different software with the same name, and neither can be rolled back to.

```bash
ops/release.sh prepare 1.2.3                # changelog + version bump, as a PR
# …merge that PR…
ops/release.sh tag 1.2.3                    # verify green CI, tag, build image
ops/deploy.sh --env staging --tag v1.2.3    # loopback :9923, its own volume
ops/deploy.sh --env prod    --tag v1.2.3    # :9922, the live sync volume
ops/deploy.sh --env prod    --tag v1.2.2    # rollback = a deliberate choice
```

The release is prepared **as a pull request** rather than committed straight
to main: main is protected, everything goes through review, and a release
commit is not an exception (the first version of this script did commit
directly, which branch protection rejects — a brand-new commit has no
passing checks yet). `release.sh tag` then refuses a dirty tree, a branch
other than main, a commit that is not on origin, a version with no changelog
entry, or a commit whose CI is not green — the tag has to mean "this
passed". `deploy.sh` holds the hardened runtime flags (one place,
pinned by `deployContract.test.ts`) and accepts a deploy only when the new
container **actually answers on its port**; anything else rolls back to the
previous image and verifies that the rollback serves.

## Running without Docker

```bash
npm ci && npm run build
PORT=3000 npm run start   # or: node .next/standalone/server.js (set HOSTNAME/PORT)
```

Use a process manager (systemd unit, pm2) for restarts. Node.js 20+ required.
