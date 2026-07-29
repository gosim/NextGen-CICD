#!/usr/bin/env bash
# Erstellt VOR jedem Deployment ein pg_dump-Backup der Umgebungs-DB.
#   backup.sh <env>
# Gibt als letzte Zeile den Backup-Pfad aus (leer beim Bootstrap ohne laufende DB).
# Retention: die letzten 10 Backups pro Umgebung bleiben erhalten.
set -euo pipefail

ENV_NAME="${1:?Verwendung: backup.sh <env>}"
BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$HOME/deployments/backups}/$ENV_NAME"
PROJECT="nextgen-$ENV_NAME"
TAG="${IMAGE_TAG:-unknown}"

mkdir -p "$BACKUP_DIR"

if ! docker compose -p "$PROJECT" ps --status running db 2>/dev/null | grep -q db; then
  echo "Hinweis: Keine laufende DB im Projekt $PROJECT — Bootstrap-Deployment, kein Backup möglich." >&2
  echo ""
  exit 0
fi

FILE="$BACKUP_DIR/$(date +%Y-%m-%dT%H-%M-%S)_${TAG}.dump"
docker compose -p "$PROJECT" exec -T db pg_dump -U app -Fc app > "$FILE"

# Retention: alles außer den 10 neuesten löschen
ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +11 | while read -r OLD; do rm -f "$OLD"; done

echo "Backup erstellt: $FILE ($(du -h "$FILE" | cut -f1))" >&2
echo "$FILE"
