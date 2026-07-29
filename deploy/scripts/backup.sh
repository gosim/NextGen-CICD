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

if ! docker compose -p "$PROJECT" exec -T db pg_isready -U app -d app >/dev/null 2>&1; then
  echo "FEHLER: DB-Container läuft, ist aber nicht bereit — Deployment ohne Backup wäre riskant." >&2
  exit 1
fi

FILE="$BACKUP_DIR/$(date +%Y-%m-%dT%H-%M-%S)_${TAG}.dump"
# Erst in Temp-Datei dumpen und atomar umbenennen: ein fehlgeschlagener pg_dump
# darf keinen leeren/halben Dump als vermeintlich gültiges Backup hinterlassen.
if ! docker compose -p "$PROJECT" exec -T db pg_dump -U app -Fc app > "$FILE.tmp"; then
  rm -f "$FILE.tmp"
  echo "FEHLER: pg_dump fehlgeschlagen — kein Backup erstellt, Deployment wird abgebrochen." >&2
  exit 1
fi
mv "$FILE.tmp" "$FILE"

# Retention: alles außer den 10 neuesten löschen
ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +11 | while read -r OLD; do rm -f "$OLD"; done

echo "Backup erstellt: $FILE ($(du -h "$FILE" | cut -f1))" >&2
echo "$FILE"
