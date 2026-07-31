# Deployment

Cortex ships as a single stateless container (all user data lives in each
browser's IndexedDB). It runs identically on x86_64 and ARM64.

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

- Idle memory use is well under the 512 MB compose limit.
- No GPU, CUDA or external services are required.
- SD-card wear is negligible: the app writes no server-side data.

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

See `.env.example`. Only `PORT` and `HOSTNAME` exist — there are no secrets,
API keys or feature flags.

## Updating

```bash
git pull
docker compose up -d --build
```

Clients pick the new version up on next load; if a tab is open, the in-app
"new version ready" prompt appears once the new service worker has installed.

## Backups

Server-side there is nothing to back up. User data is per-browser: each user
should occasionally use **Profile → Your data → Export JSON** and keep the
file. (A server-assisted backup/sync feature is on the roadmap.)

## Running without Docker

```bash
npm ci && npm run build
PORT=3000 npm run start   # or: node .next/standalone/server.js (set HOSTNAME/PORT)
```

Use a process manager (systemd unit, pm2) for restarts. Node.js 20+ required.
