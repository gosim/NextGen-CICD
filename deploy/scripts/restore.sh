#!/usr/bin/env bash
# Stellt die Umgebungs-DB aus einem pg_dump-Backup wieder her (Rollback-Pfad).
#   restore.sh <env> <backup-file>
# Reihenfolge ist kritisch: Backend stoppen → offene Connections beenden → pg_restore.
set -euo pipefail

ENV_NAME="${1:?Verwendung: restore.sh <env> <backup-file>}"
BACKUP_FILE="${2:?Backup-Datei fehlt}"
PROJECT="nextgen-$ENV_NAME"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/compose/docker-compose.yml"
ENV_FILE="$ROOT/deploy/env/$ENV_NAME.env"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "FEHLER: Backup-Datei nicht gefunden: $BACKUP_FILE" >&2
  exit 1
fi

echo "Stelle sicher, dass die DB läuft (z.B. nach Docker-Neustart)…" >&2
# IMAGE_TAG wird vom db-Service nicht benutzt, aber Compose interpoliert die
# gesamte Datei — ohne Wert würde ${IMAGE_TAG:?} hier abbrechen.
IMAGE_TAG="${IMAGE_TAG:-restore-unused}" \
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db >/dev/null
for i in $(seq 1 24); do
  if docker compose -p "$PROJECT" exec -T db pg_isready -U app -d app >/dev/null 2>&1; then
    break
  fi
  [ "$i" = "24" ] && { echo "FEHLER: DB wurde nicht bereit." >&2; exit 1; }
  sleep 5
done

echo "Stoppe Backend, damit der Restore keine offenen Connections vorfindet…" >&2
docker compose -p "$PROJECT" stop backend >/dev/null

echo "Beende verbliebene DB-Connections…" >&2
docker compose -p "$PROJECT" exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'app' AND pid <> pg_backend_pid();" >/dev/null

echo "Spiele Backup ein: $BACKUP_FILE" >&2
docker compose -p "$PROJECT" exec -T db pg_restore --clean --if-exists -U app -d app < "$BACKUP_FILE"

echo "DB-Restore abgeschlossen." >&2
