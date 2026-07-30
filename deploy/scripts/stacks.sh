#!/usr/bin/env bash
# Alle NextGen-Stacks (inkl. Docker Desktop) mit einem Befehl verwalten:
#   deploy/scripts/stacks.sh up      – Docker Desktop starten (falls aus) + Ops-Stack + alle Umgebungen
#   deploy/scripts/stacks.sh stop    – alles anhalten UND Docker Desktop beenden (Daten bleiben)
#   deploy/scripts/stacks.sh down    – Container entfernen UND Docker Desktop beenden (Volumes bleiben)
#   deploy/scripts/stacks.sh status  – Überblick: Version, Health, Container je Stack
# Flag für stop/down: --keep-docker lässt Docker Desktop weiterlaufen.
set -euo pipefail

# readlink -f: auch bei Aufruf über einen Symlink (z.B. /opt/homebrew/bin/nextgen-stacks)
# zur echten Datei auflösen, sonst zeigt ROOT ins Leere.
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "$SCRIPT_PATH")/../.." && pwd)"
OPS_FILE="$ROOT/deploy/compose/docker-compose.ops.yml"
STATE="$ROOT/deploy/scripts/state.sh"
ENVS="int abnahme prod"
CMD="${1:?Verwendung: stacks.sh up|stop|down|status}"
KEEP_DOCKER="${2:-}"

api_port() { grep -E '^API_PORT=' "$ROOT/deploy/env/$1.env" | cut -d= -f2; }

# Fine-grained PAT für Mission Control (Demo-Steuerung + GitHub-Live).
# Bevorzugt aus dem macOS-Keychain (verschlüsselt at rest; Zugriff funktioniert
# hier, weil stacks.sh in der interaktiven User-Session läuft), Fallback: lokale
# Datei. Compose substituiert MC_GITHUB_TOKEN in die Container-Umgebung.
MC_KEYCHAIN_SERVICE="nextgen-mission-control"

load_mc_token() {
  MC_GITHUB_TOKEN="$(security find-generic-password -s "$MC_KEYCHAIN_SERVICE" -a "$USER" -w 2>/dev/null || true)"
  if [ -n "$MC_GITHUB_TOKEN" ]; then
    export MC_GITHUB_TOKEN
    return 0
  fi
  MC_ENV_FILE="$HOME/deployments/mission-control.env"
  if [ -f "$MC_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$MC_ENV_FILE"
    set +a
    return 0
  fi
  echo "── Hinweis: Kein Mission-Control-Token — GitHub-Live/Demo-Steuerung bleiben aus." >&2
  echo "   Einrichten (empfohlen, Keychain): $0 token" >&2
}

# Gedeckelter Engine-Ping statt `docker info`: der CLI-Aufruf kann gegen einen
# halb gestarteten Daemon minutenlang hängen, der curl-Ping bricht nach 2s ab.
engine_ready() {
  [ "$(curl -fsS -m 2 --unix-socket "$HOME/.docker/run/docker.sock" http://localhost/_ping 2>/dev/null || true)" = "OK" ]
}

ensure_docker() {
  engine_ready && return 0
  echo "── Docker Desktop ist aus — starte…"
  open -a Docker
  for i in $(seq 1 40); do
    engine_ready && { echo "── Docker ist bereit."; return 0; }
    sleep 3
  done
  # Selbstheilung: Nach einem App-Quit bleibt Docker gelegentlich in einem
  # kaputten Halbzustand hängen (Socket da, Engine antwortet mit 500).
  # Dann hilft nur ein harter Neustart der App.
  echo "── Docker hängt im Halbzustand — erzwinge Neustart…" >&2
  osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
  sleep 3
  pkill -f "Docker Desktop" 2>/dev/null || true
  pkill -f com.docker 2>/dev/null || true
  sleep 5
  open -a Docker
  for i in $(seq 1 40); do
    engine_ready && { echo "── Docker ist bereit (nach Neustart)."; return 0; }
    sleep 3
  done
  echo "FEHLER: Docker-Engine wurde nicht bereit — bitte Docker Desktop manuell prüfen." >&2
  exit 1
}

quit_docker() {
  if [ "$KEEP_DOCKER" = "--keep-docker" ]; then
    echo "── Docker Desktop bleibt an (--keep-docker)."
    return 0
  fi
  echo "── Beende Docker Desktop…"
  osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
}

case "$CMD" in
  up)
    ensure_docker
    echo "── Ops-Stack (Grafana, Portainer, Mission Control)…"
    load_mc_token
    docker compose -p nextgen-ops -f "$OPS_FILE" up -d --build mission-control
    docker compose -p nextgen-ops -f "$OPS_FILE" up -d
    for e in $ENVS; do
      TAG="$("$STATE" get "$e" current)"
      [ -z "$TAG" ] && TAG="$("$STATE" get "$e" last_green)"
      if [ -z "$TAG" ]; then
        echo "── ${e}: noch nie deployt — übersprungen (erst Pipeline laufen lassen)." >&2
        continue
      fi
      PORT="$(api_port "$e")"
      if curl -fsS -m 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        echo "── ${e}: läuft bereits (${TAG}) — übersprungen."
        continue
      fi
      echo "── ${e}: starte mit ${TAG}…"
      IMAGE_TAG="$TAG" "$ROOT/deploy/scripts/deploy.sh" "$e"
    done
    echo "✅ Alles oben. Mission Control: http://localhost:9100  Grafana: http://localhost:8000  Portainer: http://localhost:9000"
    ;;
  stop)
    for e in $ENVS; do
      echo "── ${e}: stoppe…"
      docker compose -p "nextgen-$e" stop 2>/dev/null || true
    done
    echo "── ops: stoppe…"
    load_mc_token 2>/dev/null || true
    docker compose -p nextgen-ops -f "$OPS_FILE" stop 2>/dev/null || true
    quit_docker
    echo "✅ Alles gestoppt (Container + Daten bleiben; wieder hoch mit: stacks.sh up)."
    ;;
  down)
    for e in $ENVS; do
      echo "── ${e}: entferne Container…"
      docker compose -p "nextgen-$e" down 2>/dev/null || true
    done
    echo "── ops: entferne Container…"
    load_mc_token 2>/dev/null || true
    docker compose -p nextgen-ops -f "$OPS_FILE" down 2>/dev/null || true
    quit_docker
    echo "✅ Alle Container entfernt (Volumes/Daten bleiben; Komplett-Rückbau: down + 'docker volume rm')."
    ;;
  status)
    for e in $ENVS; do
      TAG="$("$STATE" get "$e" current)"
      VERSION="$("$STATE" get "$e" current_version)"
      PORT="$(api_port "$e")"
      if curl -fsS -m 2 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        HEALTH="✅ läuft"
      else
        HEALTH="⛔ aus"
      fi
      COUNT="$(docker compose -p "nextgen-$e" ps -q 2>/dev/null | grep -c . || true)"
      printf '%-8s %-9s v%-10s %-12s %s Container\n' "$e" "$HEALTH" "${VERSION:-?}" "(${TAG:-—})" "${COUNT:-0}"
    done
    OPS_COUNT="$(docker compose -p nextgen-ops ps -q 2>/dev/null | grep -c . || true)"
    printf '%-8s %-9s %-23s %s Container\n' "ops" "$([ "${OPS_COUNT:-0}" -gt 0 ] && echo '✅ läuft' || echo '⛔ aus')" "(Grafana/Portainer/ops-db)" "${OPS_COUNT:-0}"
    ;;
  token)
    echo "Fine-grained PAT für Mission Control im macOS-Keychain speichern."
    echo "(Erstellen: https://github.com/settings/personal-access-tokens/new —"
    echo " nur Repo NextGen-CICD; Actions R+W, Deployments R+W, Contents R)"
    printf 'Token (Eingabe unsichtbar): '
    read -r -s MC_TOKEN_INPUT
    echo ""
    if [ -z "$MC_TOKEN_INPUT" ]; then
      echo "Abgebrochen — kein Token eingegeben." >&2
      exit 1
    fi
    # -U: vorhandenen Eintrag aktualisieren statt Duplikat anlegen.
    security add-generic-password -U -s "$MC_KEYCHAIN_SERVICE" -a "$USER" -w "$MC_TOKEN_INPUT"
    unset MC_TOKEN_INPUT
    if [ -f "$HOME/deployments/mission-control.env" ]; then
      rm -f "$HOME/deployments/mission-control.env"
      echo "✅ Token im Keychain gespeichert; alte Klartext-Datei entfernt."
    else
      echo "✅ Token im Keychain gespeichert."
    fi
    echo "   Aktivieren mit: $0 up"
    ;;
  *)
    echo "Unbekanntes Kommando: $CMD (up|stop|down|status|token)" >&2
    exit 1
    ;;
esac
