# Build context must be the REPO ROOT (pnpm workspace):
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/

# ── Development ──────────────────────────────────────────────────────────────
FROM base AS dev
RUN pnpm install --filter api
COPY apps/api apps/api
WORKDIR /repo/apps/api
CMD ["pnpm", "dev"]

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
RUN pnpm --filter api build
# Standalone deployable: project files + production deps only
# (--legacy: api has no workspace-package deps, so injection is unnecessary)
RUN pnpm --filter api deploy --legacy --prod /out

# ── Production ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /out .
# Uploads (course thumbnails) live on a mounted volume. Create it owned by
# `node` in the image so a fresh named volume inherits that ownership —
# otherwise Docker creates the mountpoint as root and the non-root runtime
# user gets EACCES on first write.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
EXPOSE 3000
USER node
CMD ["node", "dist/src/index.js"]
