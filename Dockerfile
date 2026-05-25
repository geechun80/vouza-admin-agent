# =============================================================================
# Vouza Admin Agent — Docker Image
#
# Multi-stage build:
#   1. deps:   install dependencies separately so npm ci isn't re-run on
#              every source edit (better build cache)
#   2. build:  TypeScript compile + copy public assets
#   3. runtime: minimal Alpine image with non-root user, no build tools
#
# Build:  docker build -t vouza-admin-agent:latest .
# Run:    docker run -p 3456:3456 \
#                    -v $(pwd)/data:/app/data \
#                    -e VOUZA_API_KEY=sk-or-v1-... \
#                    vouza-admin-agent:latest
# Or use: docker compose up -d   (see docker-compose.yml)
# =============================================================================

# ─── Stage 1: dependencies ──────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools needed for some native deps (better-sqlite3, sharp, etc.)
# Removed from final stage so they don't bloat the runtime image.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# npm ci uses package-lock.json for deterministic installs — exactly the
# same versions we tested. Never use npm install in a Dockerfile.
RUN npm ci --no-audit --no-fund

# ─── Stage 2: build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript + copy dashboard public assets to dist/
RUN npm run build

# Prune dev dependencies so they don't end up in the runtime image
RUN npm prune --omit=dev

# ─── Stage 3: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Tini handles signals correctly (otherwise SIGTERM doesn't reach Node)
RUN apk add --no-cache tini

# Run as non-root for security — node user is built into the official image
USER node

# Copy only what's needed for runtime — no source, no devDeps
COPY --from=build --chown=node:node /app/dist          ./dist
COPY --from=build --chown=node:node /app/node_modules  ./node_modules
COPY --from=build --chown=node:node /app/package.json  ./package.json
COPY --from=build --chown=node:node /app/src/skills    ./src/skills
COPY --from=build --chown=node:node /app/ecosystem.config.cjs ./ecosystem.config.cjs
COPY --from=build --chown=node:node /app/CHANGELOG.md  ./CHANGELOG.md

# data/ is a volume — created if missing on first start
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production \
    DASHBOARD_BIND=0.0.0.0 \
    PORT=3456

# Health check — hits the operator-defaults endpoint every 30s.
# That endpoint is public (no auth required) and returns quickly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3456/api/operator-defaults > /dev/null 2>&1 || exit 1

EXPOSE 3456
VOLUME ["/app/data"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/dashboard/launch.js"]
