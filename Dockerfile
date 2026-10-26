# syntax=docker/dockerfile:1.7

# ═══════════════════════════════════════════════
# BASE — shared toolchain (NO NODE_ENV here)
# ═══════════════════════════════════════════════
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache openssl wget
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# NOTE: NODE_ENV is NOT set here — each stage decides

# ═══════════════════════════════════════════════
# DEPS — install ALL deps (incl. devDeps like prisma CLI)
# ═══════════════════════════════════════════════
FROM base AS deps
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate

# ═══════════════════════════════════════════════
# BUILDER — compile TypeScript (needs tsc + nest CLI)
# ═══════════════════════════════════════════════
FROM base AS builder
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ═══════════════════════════════════════════════
# RUNNER — production image
# ═══════════════════════════════════════════════
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# ─── Entrypoint inlined (no external file) ───
RUN { \
    echo '#!/bin/sh'; \
    echo 'set -e'; \
    echo ''; \
    echo 'echo "[entrypoint] NODE_ENV=$NODE_ENV"'; \
    echo 'echo "[entrypoint] Waiting for database..."'; \
    echo 'ATTEMPTS=0'; \
    echo 'until node -e "const { Client } = require('"'"'pg'"'"'); const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }); c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));" 2>/dev/null; do'; \
    echo '  ATTEMPTS=$((ATTEMPTS + 1))'; \
    echo '  if [ "$ATTEMPTS" -ge 30 ]; then echo "[entrypoint] DB not reachable after 60s"; exit 1; fi'; \
    echo '  sleep 2'; \
    echo 'done'; \
    echo 'echo "[entrypoint] DB reachable"'; \
    echo ''; \
    echo 'echo "[entrypoint] Running migrations..."'; \
    echo 'node node_modules/prisma/build/index.js migrate deploy'; \
    echo 'echo "[entrypoint] Migrations applied"'; \
    echo ''; \
    echo 'echo "[entrypoint] Starting app: $@"'; \
    echo 'exec "$@"'; \
  } > /usr/local/bin/entrypoint.sh \
  && chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]
