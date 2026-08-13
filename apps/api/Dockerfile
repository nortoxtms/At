# ONLY HORSES API — Cloud Run image (ADR-0001).
#
# Multi-stage so the runtime image carries no toolchain and no source: pnpm,
# TypeScript and the test fixtures stay in the builder. The result is what
# Cloud Run starts and what a vulnerability scan looks at.

# ── builder ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

# sharp needs libvips at build time; the runtime stage installs its own.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential libvips-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /repo

# Manifests first: this layer is what makes an unchanged dependency tree a
# cache hit instead of a five-minute install.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @only-horses/api... --filter @only-horses/shared-types...

COPY packages/shared-types packages/shared-types
COPY packages/config packages/config
COPY apps/api apps/api

RUN pnpm --filter @only-horses/shared-types build \
 && pnpm --filter @only-horses/api build \
 && pnpm deploy --filter @only-horses/api --prod --legacy /app

# ── runtime ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Cloud Run injects PORT; §6's default keeps a local `docker run` working.
ENV PORT=3001

WORKDIR /app
COPY --from=builder /app ./
COPY --from=builder /repo/apps/api/dist ./dist
# The migration runner ships with the image so a release can apply its own
# schema change before serving (see docs/DEPLOY.md).
COPY --from=builder /repo/db ./db
COPY --from=builder /repo/scripts/migrate.mjs ./scripts/migrate.mjs

# Never root: a container that can write its own filesystem is a container an
# RCE can persist in.
USER node

EXPOSE 3001

# §12's /health is unauthenticated and cheap by design; /health/ready checks
# the database, which is what a load balancer should gate traffic on.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
