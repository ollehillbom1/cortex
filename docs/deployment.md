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

`docker-compose.yml` sets a restart policy, a 512 MB memory limit and a health
check against `/api/health`. Override the published port with `PORT=8080
docker compose up -d`.

## Raspberry Pi 5 (ARM64, 64-bit OS)

Identical commands — the multi-stage `Dockerfile` builds natively on arm64
(about 5 minutes on a Pi 5; use `docker compose build --progress plain` to
watch). Resource notes:

- Idle memory use is around 45 MiB, well under the 512 MB compose limit.

> **The limit only applies if you start it with Compose.** The current public
> deployment was started with `docker run`, which honours none of the
> `deploy.resources` settings — verified with `docker inspect` (memory limit
> `0`). Pass them explicitly when not using Compose:
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

Backing up the server therefore means backing up one directory:

```bash
docker run --rm -v cortex_cortex-sync:/data -v "$PWD":/backup alpine \
  tar czf /backup/cortex-sync-backup.tar.gz -C /data .
```

For households with sync enabled that covers everything; the encrypted blobs
are only readable with the household passphrase. Users who never enable sync
should still occasionally use **Profile → Your data → Export JSON** and keep
the file.

## Running without Docker

```bash
npm ci && npm run build
PORT=3000 npm run start   # or: node .next/standalone/server.js (set HOSTNAME/PORT)
```

Use a process manager (systemd unit, pm2) for restarts. Node.js 20+ required.
