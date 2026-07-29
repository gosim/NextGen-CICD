# syntax=docker/dockerfile:1
# Build-Kontext = Repo-Root (Monorepo).

# --- Build-Stage -----------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Nur Manifeste kopieren, damit die Dependency-Installation cachebar bleibt.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/frontend/package.json apps/frontend/

RUN pnpm install --frozen-lockfile --filter "@nextgen/frontend..."

# Jetzt der Quellcode.
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend

# Version/SHA sind reine Build-Metadaten fürs Footer-Badge — NICHT die
# Umgebungswahrheit (die kommt zur Laufzeit aus /api/info).
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_GIT_SHA=$GIT_SHA

RUN pnpm --filter @nextgen/shared build && pnpm --filter @nextgen/frontend build

# --- Runtime-Stage ---------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
