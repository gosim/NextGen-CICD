# E2E-Test-Image. Build-Kontext = REPO-ROOT (docker build -f e2e/Dockerfile .).
# Das offizielle Playwright-Image bringt Browser + passende System-Deps mit;
# die Version MUSS zur @playwright/test-Version aus e2e/package.json passen.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# pnpm über corepack (in Node enthalten) bereitstellen.
RUN corepack enable

WORKDIR /repo

# Zuerst nur die Manifeste für einen cache-freundlichen Install.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY e2e/package.json e2e/

# Nur das E2E-Package (und dessen — hier leere — Workspace-Deps) installieren.
RUN pnpm install --frozen-lockfile --filter "@nextgen/e2e..."

# Danach den Testcode kopieren (ändert sich häufiger als die Dependencies).
COPY e2e e2e

WORKDIR /repo/e2e
ENV CI=true

# Projekt/Argumente kommen von `docker run` (z.B. --project=int-regression).
ENTRYPOINT ["npx", "playwright", "test"]
