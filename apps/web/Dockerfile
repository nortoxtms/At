# ONLY HORSES web — Cloud Run image (ADR-0001, §19).
#
# Next.js standalone output: the runtime image carries the server, the built
# pages and the exact node_modules subset the traced build needs — not the
# whole workspace.

FROM node:22-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @only-horses/web... --filter @only-horses/shared-types...

COPY packages/shared-types packages/shared-types
COPY packages/config packages/config
COPY apps/web apps/web

# NEXT_PUBLIC_* are inlined at build time, so the API URL is a build argument
# rather than a runtime variable. Getting this wrong ships a bundle that calls
# localhost from production.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN pnpm --filter @only-horses/shared-types build \
 && pnpm --filter @only-horses/web build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
