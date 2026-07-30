# syntax=docker/dockerfile:1
# Multi-stage Build. Build-Kontext = REPO-ROOT (nicht apps/mission-control).
# Mission-Control hat keine Workspace-Dependencies und braucht KEINE Build-Args —
# Version/SHA/Umgebung ermittelt der Server zur Laufzeit über GitHub & /api/info.

# ---------- Build ----------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifeste zuerst kopieren (Layer-Cache für Installs).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/mission-control/package.json apps/mission-control/

RUN pnpm install --frozen-lockfile --filter "@nextgen/mission-control..."

# Quellcode (inkl. public/, vom Frontend-Agenten befüllt) kopieren und bauen.
COPY apps/mission-control apps/mission-control

# pnpm deploy nimmt dist/ und public/ über das files-Feld ins schlanke /out-Image.
RUN pnpm --filter @nextgen/mission-control build \
  && pnpm --filter @nextgen/mission-control deploy --prod /out

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /out .

USER node
EXPOSE 9100

HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:9100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
