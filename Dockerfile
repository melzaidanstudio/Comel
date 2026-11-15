FROM node:22-bookworm-slim

ARG TARGETARCH
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/app/data \
    PORT=3000

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

# Lightpanda (headless browser untuk scraping)
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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx playwright-core install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY src ./src
COPY public ./public

VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
