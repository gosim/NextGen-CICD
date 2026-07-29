#!/usr/bin/env bash
# Release-State pro Umgebung: ~/deployments/state/<env>.json
#   state.sh get <env> <key>            → Wert (leer, wenn nicht vorhanden)
#   state.sh set <env> key=value ...    → setzt Schlüssel, aktualisiert updated_at
# Operative Wahrheit für Rollbacks — bewusst eine lokale Datei, unabhängig von der GitHub-API.
set -euo pipefail

STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/deployments/state}"
CMD="${1:?Verwendung: state.sh get|set <env> ...}"
ENV_NAME="${2:?Umgebung fehlt (int|abnahme|prod)}"
STATE_FILE="$STATE_DIR/$ENV_NAME.json"

mkdir -p "$STATE_DIR"
[ -f "$STATE_FILE" ] || echo '{}' > "$STATE_FILE"

case "$CMD" in
  get)
    KEY="${3:?Schlüssel fehlt}"
    jq -r --arg k "$KEY" '.[$k] // empty' "$STATE_FILE"
    ;;
  set)
    shift 2
    TMP="$(mktemp)"
    cp "$STATE_FILE" "$TMP"
    for PAIR in "$@"; do
      KEY="${PAIR%%=*}"
      VALUE="${PAIR#*=}"
      jq --arg k "$KEY" --arg v "$VALUE" '.[$k] = $v' "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
    done
    jq --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.updated_at = $t' "$TMP" > "$STATE_FILE"
    rm -f "$TMP"
    ;;
  *)
    echo "Unbekanntes Kommando: $CMD" >&2
    exit 1
    ;;
esac
