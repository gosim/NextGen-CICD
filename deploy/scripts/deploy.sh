#!/usr/bin/env bash
# Deployed einen Image-Tag in eine Umgebung und wartet auf gesunde Services.
#   IMAGE_TAG=sha-abc1234 deploy.sh <env>
# Ablauf: Images ziehen (fehlertolerant, lokaler Cache reicht) → compose up --wait
# (führt den migrate-One-Shot aus und wartet auf alle Healthchecks).
set -euo pipefail

ENV_NAME="${1:?Verwendung: IMAGE_TAG=<tag> deploy.sh <env>}"
: "${IMAGE_TAG:?IMAGE_TAG muss gesetzt sein}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/compose/docker-compose.yml"
ENV_FILE="$ROOT/deploy/env/$ENV_NAME.env"
PROJECT="nextgen-$ENV_NAME"

[ -f "$ENV_FILE" ] || { echo "FEHLER: env-File fehlt: $ENV_FILE" >&2; exit 1; }

echo "Deploye ${IMAGE_TAG} nach ${ENV_NAME}…" >&2

# Pull best-effort: beim Rollback liegt das Image ggf. nur im lokalen Cache
docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull --ignore-pull-failures >/dev/null 2>&1 || true

docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --wait --wait-timeout 120

API_PORT="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2)"
for i in $(seq 1 12); do
  if curl -fsS "http://localhost:${API_PORT}/api/health" >/dev/null 2>&1; then
    echo "Deployment $IMAGE_TAG auf $ENV_NAME ist gesund (API-Port $API_PORT)." >&2
    exit 0
  fi
  sleep 5
done

echo "FEHLER: /api/health auf Port $API_PORT wurde nicht gesund." >&2
exit 1
