# ---------- base: Node + Lightpanda ----------
FROM node:22-bookworm-slim AS base
ARG TARGETARCH
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) LP=lightpanda-x86_64-linux ;; \
      arm64) LP=lightpanda-aarch64-linux ;; \
      *) echo "Arsitektur tidak didukung: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/lightpanda "https://github.com/lightpanda-io/browser/releases/download/nightly/${LP}"; \
    chmod +x /usr/local/bin/lightpanda; \
    lightpanda version
WORKDIR /app

# ---------- build Next.js ----------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# cache build tidak perlu ikut ke image runtime
RUN npm run build && rm -rf .next/cache

# ---------- runtime (web, worker, migrate memakai image yang sama) ----------
FROM base AS runner
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx playwright-core install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
COPY --from=build /app/.next ./.next
COPY next.config.ts tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "next", "start"]
