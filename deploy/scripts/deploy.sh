#!/usr/bin/env bash
# Deployed einen Image-Tag in eine Umgebung — mit Zero-Downtime-Rolling-Update.
#   IMAGE_TAG=v1.0.42 deploy.sh <env>
#
# Ablauf:
#   1. Images ziehen (fehlertolerant, lokaler Cache reicht beim Rollback).
#   2. Migrationen IMMER zuerst als One-Shot (bei Fehler Abbruch VOR jedem App-Wechsel).
#   3. Bootstrap (kein backend läuft): kompletter Stack via `up -d --wait`.
#      Sonst ROLLING pro Service (erst backend, dann frontend): neue Replicas hoch,
#      auf Health warten, dann alte entfernen — bei Timeout sicherer Abbruch, die
#      alte Version läuft unverändert weiter.
#   4. Proxy sicherstellen, End-Healthcheck via curl auf ${API_PORT}/api/health.
set -euo pipefail

ENV_NAME="${1:?Verwendung: IMAGE_TAG=<tag> deploy.sh <env>}"
: "${IMAGE_TAG:?IMAGE_TAG muss gesetzt sein}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/compose/docker-compose.yml"
ENV_FILE="$ROOT/deploy/env/$ENV_NAME.env"
PROJECT="nextgen-$ENV_NAME"

[ -f "$ENV_FILE" ] || { echo "FEHLER: env-File fehlt: $ENV_FILE" >&2; exit 1; }

# Kurzform für den immer gleichen Compose-Aufruf.
dc() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# Rolling-Update eines Service ohne Downtime: die alten Replicas laufen weiter,
# während die neuen (mit dem neuen IMAGE_TAG) hochkommen; erst wenn die neuen
# healthy sind, werden die alten entfernt. Bei Timeout: neue verwerfen, exit 1.
rolling_update() {
  SVC="$1"
  echo "Rolling ${SVC}: starte neue Replicas neben den alten…" >&2

  # ps -q liefert eine ID pro Zeile; auf Leerzeichen normalisieren, damit die
  # spätere Mengendifferenz per case-Pattern zuverlässig matcht.
  OLD_IDS="$(dc ps -q "$SVC" | tr '\n' ' ')"

  # 2 alte + 2 neue = 4. --no-recreate lässt die alten unangetastet; --no-deps
  # verhindert, dass db/migrate erneut angefasst werden.
  dc up -d --no-deps --no-recreate --scale "$SVC=4" "$SVC"

  # Neue = alle aktuellen minus die alten.
  NEW_IDS=""
  for id in $(dc ps -q "$SVC"); do
    case " $OLD_IDS " in
      *" $id "*) : ;;
      *) NEW_IDS="$NEW_IDS $id" ;;
    esac
  done

  if [ -z "$NEW_IDS" ]; then
    echo "FEHLER: Keine neuen ${SVC}-Replicas gestartet — Abbruch." >&2
    exit 1
  fi

  echo "Rolling ${SVC}: warte auf Health der neuen Replicas…" >&2
  # Timeout ~120s (60 * 2s).
  i=0
  while :; do
    ALL_HEALTHY=1
    for id in $NEW_IDS; do
      STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo missing)"
      [ "$STATUS" = "healthy" ] || { ALL_HEALTHY=0; break; }
    done
    [ "$ALL_HEALTHY" = "1" ] && break
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "FEHLER: Neue ${SVC}-Replicas wurden nicht healthy — sicherer Abbruch, alte Version läuft weiter." >&2
      for id in $NEW_IDS; do
        docker stop "$id" >/dev/null 2>&1 || true
        docker rm -f "$id" >/dev/null 2>&1 || true
      done
      exit 1
    fi
    sleep 2
  done

  echo "Rolling ${SVC}: neue Replicas healthy — entferne alte…" >&2
  for id in $OLD_IDS; do
    docker stop "$id" >/dev/null 2>&1 || true
    docker rm "$id" >/dev/null 2>&1 || true
  done

  # Sollzustand (2 Replicas) normalisieren, die neuen nicht anfassen.
  dc up -d --no-deps --no-recreate --scale "$SVC=2" "$SVC" >/dev/null
}

echo "Deploye ${IMAGE_TAG} nach ${ENV_NAME}…" >&2

# Pull best-effort: beim Rollback liegt das Image ggf. nur im lokalen Cache.
dc pull --ignore-pull-failures >/dev/null 2>&1 || true

# Migrationen IMMER zuerst — wartet via depends_on auf db healthy. Fehler hier
# bricht ab, BEVOR irgendeine App-Replica gewechselt wird.
echo "Migrationen (One-Shot)…" >&2
if ! dc run --rm migrate; then
  echo "FEHLER: Migration fehlgeschlagen — Deployment abgebrochen, keine App-Version geändert." >&2
  exit 1
fi

# Bootstrap-Erkennung: läuft aktuell KEIN backend-Container im Projekt?
RUNNING_BACKEND="$(dc ps -q --status running backend 2>/dev/null || true)"
if [ -z "$RUNNING_BACKEND" ]; then
  echo "Bootstrap: kein backend aktiv — starte kompletten Stack (inkl. Proxy & Replicas)…" >&2
  dc up -d --wait --wait-timeout 120
else
  rolling_update backend
  rolling_update frontend
  echo "Proxy sicherstellen (falls Config/Image geändert)…" >&2
  dc up -d --no-deps proxy
fi

# End-Healthcheck via Proxy (API_PORT -> proxy:81 -> backend:3000).
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
