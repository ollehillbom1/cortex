# Cortex — multi-stage build for x86_64 and ARM64 (Raspberry Pi 5).
# Produces a small non-root image running the Next.js standalone server.

# --- deps: install exact dependencies from the lockfile ---------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build: compile the production bundle -----------------------------------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime: minimal, non-root ----------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S cortex && adduser -S cortex -G cortex

# Standalone output contains the server and pruned node_modules.
COPY --from=build --chown=cortex:cortex /app/.next/standalone ./
COPY --from=build --chown=cortex:cortex /app/.next/static ./.next/static
COPY --from=build --chown=cortex:cortex /app/public ./public

USER cortex
EXPOSE 3000

# wget ships with busybox in alpine; probes the app's health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
