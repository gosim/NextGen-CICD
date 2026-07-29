#!/usr/bin/env bash
# Führt Node-/pnpm-Kommandos in einem Wegwerf-Container aus, damit auf dem Host
# kein Node/pnpm installiert sein muss. Beispiele:
#   deploy/scripts/dev.sh pnpm install
#   deploy/scripts/dev.sh pnpm -r typecheck
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TTY_FLAGS=""
if [ -t 0 ] && [ -t 1 ]; then
  TTY_FLAGS="-it"
fi

# Der pnpm-Store liegt in einem benannten Docker-Volume, damit Installs schnell bleiben.
exec docker run --rm ${TTY_FLAGS} \
  -v "$ROOT":/work \
  -v nextgen-pnpm-store:/pnpm-store \
  -e npm_config_store_dir=/pnpm-store \
  -e CI="${CI:-}" \
  -w /work \
  node:22-bookworm \
  bash -c 'corepack enable >/dev/null 2>&1 && exec "$@"' -- "$@"
