# syntax=docker/dockerfile:1
# Multi-stage Build. Build-Kontext = REPO-ROOT (nicht apps/backend).

# ---------- Build ----------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifeste zuerst kopieren (Layer-Cache für Installs).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

RUN pnpm install --frozen-lockfile --filter "@nextgen/backend..."

# Quellcode kopieren und bauen.
COPY packages/shared packages/shared
COPY apps/backend apps/backend

RUN pnpm --filter @nextgen/shared build \
  && pnpm --filter @nextgen/backend build \
  && pnpm --filter @nextgen/backend deploy --prod /out

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production

# Umgebungs-Identität ist reine Laufzeit-Config; Version/SHA/Zeit kommen als Build-Args.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

WORKDIR /app
COPY --from=build /out .

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
