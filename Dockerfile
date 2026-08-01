# Cortex — multi-stage build for x86_64 and ARM64 (Raspberry Pi 5).
# Produces a small non-root image running the Next.js standalone server.
#
# Cross-compiled. Every stage that runs Node is pinned to $BUILDPLATFORM, so
# the compiler never executes under QEMU. Emulating the arm64 build is what
# produced the intermittent "qemu: uncaught target signal 4 (Illegal
# instruction)" / SIGILL crashes in Next's build workers (#22, #23): the
# single-process mitigation reduced the exposure but did not remove it, since
# workers spawn regardless of `workerThreads: false` and `cpus: 1`. Not
# emulating the build removes the fault entirely rather than working around
# it.
#
# The only architecture-specific thing the runtime needs is sharp's native
# image codec. npm fetches the target's prebuilt binaries directly with
# --os/--cpu/--libc, so that stage is not emulated either.

ARG NODE_IMAGE=node:22-alpine

# --- deps: build-platform dependencies, used to compile --------------------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build: compile the production bundle (native, never emulated) ---------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- native: the target's prebuilt binaries, fetched not emulated ----------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS native
WORKDIR /app
# Docker says amd64/arm64; npm's --cpu wants x64/arm64.
ARG TARGETARCH
COPY package.json package-lock.json ./
RUN NPM_CPU=$(case "${TARGETARCH}" in amd64) echo x64 ;; *) echo "${TARGETARCH}" ;; esac) \
    && npm ci --os=linux --cpu="${NPM_CPU}" --libc=musl --no-audit --no-fund \
    && test -d node_modules/@img \
    && find node_modules/@img -name '*.node' | grep -q . \
    || (echo "no native sharp binaries for ${TARGETARCH}" && exit 1)

# --- runtime: minimal, non-root ---------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SYNC_DATA_DIR=/app/data

RUN addgroup -S cortex && adduser -S cortex -G cortex \
    && mkdir -p /app/data && chown cortex:cortex /app/data

# Standalone output contains the server and pruned node_modules.
COPY --from=build --chown=cortex:cortex /app/.next/standalone ./
COPY --from=build --chown=cortex:cortex /app/.next/static ./.next/static
COPY --from=build --chown=cortex:cortex /app/public ./public

# Replace the build platform's sharp with the target's. The standalone output
# carries whichever architecture compiled it, which is the wrong one whenever
# we are cross-building; dropping the directory first stops the unused copy
# riding along (~33 MB) and stops sharp finding a binary it cannot load.
RUN rm -rf ./node_modules/@img ./node_modules/sharp
COPY --from=native --chown=cortex:cortex /app/node_modules/@img ./node_modules/@img
COPY --from=native --chown=cortex:cortex /app/node_modules/sharp ./node_modules/sharp

USER cortex
EXPOSE 3000

# wget ships with busybox in alpine; probes the app's health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
