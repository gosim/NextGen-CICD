#!/usr/bin/env bash
# ops-event.sh — schreibt Deployment-/Test-Events fail-safe in die Ops-DB.
#
# Grundprinzip: Das Dashboard darf NIEMALS ein Deployment brechen. Ist der
# Ops-Stack nicht erreichbar oder schlägt der INSERT fehl, wird das Event
# verworfen und das Skript beendet sich trotzdem mit exit 0.
#
# Vertrag (wird von der Pipeline aufgerufen):
#   ops-event.sh deployment <env> <image_tag> <git_sha> <actor> <status> [duration_seconds] [run_url] [version]
#   ops-event.sh test_run   <env> <suite> <total> <passed> <failed> <flaky> <skipped> [run_url] [source] [report_url] [version]
#
# status (deployments): deployed | promoted | rolled_back | failed
# source  (test_runs):  gate (Default) | stability
# Neue Parameter sind optional und ans Ende gehängt — bestehende Aufrufe ohne
# sie bleiben unverändert gültig (rückwärtskompatibel).
#
# Bewusst set -u (unbound-Schutz), aber KEIN set -e: kein Fehler darf zum
# Abbruch mit != 0 führen.
set -u

OPS_CONTAINER='nextgen-ops-db'

warn() {
  printf 'ops-event: %s\n' "$1" >&2
}

# Führt den INSERT im Ops-DB-Container aus. Werte werden über psql-Variablen
# (-v name=value) und :'name'-Quoting übergeben — psql escaped selbst,
# dadurch SQL-Injection-sicher. Wichtig: Das SQL geht über STDIN, denn bei
# `psql -c` findet KEINE Variablen-Interpolation statt. Rückgabe != 0
# signalisiert einen Fehlerpfad.
psql_insert() {
  local sql="$1"
  shift
  local args=()
  local kv
  for kv in "$@"; do
    args+=(-v "${kv}")
  done
  if ! printf '%s\n' "${sql}" | docker exec -i "${OPS_CONTAINER}" \
    psql -U ops -d ops -q -v ON_ERROR_STOP=1 "${args[@]}" >/dev/null 2>&1; then
    warn 'Insert fehlgeschlagen — Event verworfen'
    return 1
  fi
  return 0
}

# Ops-Stack erreichbar? Wenn nicht (Container/Docker weg) -> Event verwerfen.
if ! docker exec "${OPS_CONTAINER}" true >/dev/null 2>&1; then
  warn 'Ops-Stack nicht erreichbar — Event verworfen'
  exit 0
fi

kind="${1:-}"

case "${kind}" in
  deployment)
    env="${2:-}"
    image_tag="${3:-}"
    git_sha="${4:-}"
    actor="${5:-}"
    status="${6:-}"
    duration="${7:-}"
    run_url="${8:-}"
    version="${9:-}"
    if [ -z "${env}" ] || [ -z "${image_tag}" ] || [ -z "${status}" ]; then
      warn 'deployment: env, image_tag und status sind Pflicht — Event verworfen'
      exit 0
    fi
    # NULLIF(...,'')::int -> leere Dauer wird zu SQL NULL statt Cast-Fehler.
    psql_insert \
      "INSERT INTO deployments (env, image_tag, git_sha, actor, status, duration_seconds, run_url, version)
       VALUES (:'env', :'image_tag', :'git_sha', :'actor', :'status',
               NULLIF(:'duration', '')::int, :'run_url', :'version');" \
      "env=${env}" \
      "image_tag=${image_tag}" \
      "git_sha=${git_sha}" \
      "actor=${actor}" \
      "status=${status}" \
      "duration=${duration}" \
      "run_url=${run_url}" \
      "version=${version}" || exit 0
    ;;
  test_run)
    env="${2:-}"
    suite="${3:-}"
    total="${4:-}"
    passed="${5:-}"
    failed="${6:-}"
    flaky="${7:-}"
    skipped="${8:-}"
    run_url="${9:-}"
    # source ohne Wert -> 'gate' (Default deckt sich mit der Spalten-Default).
    source="${10:-gate}"
    report_url="${11:-}"
    version="${12:-}"
    if [ -z "${env}" ] || [ -z "${suite}" ]; then
      warn 'test_run: env und suite sind Pflicht — Event verworfen'
      exit 0
    fi
    # COALESCE(NULLIF(...,'')::int, 0) -> fehlende Zahl wird defensiv zu 0.
    psql_insert \
      "INSERT INTO test_runs (env, suite, total, passed, failed, flaky, skipped, run_url, source, report_url, version)
       VALUES (:'env', :'suite',
               COALESCE(NULLIF(:'total', '')::int, 0),
               COALESCE(NULLIF(:'passed', '')::int, 0),
               COALESCE(NULLIF(:'failed', '')::int, 0),
               COALESCE(NULLIF(:'flaky', '')::int, 0),
               COALESCE(NULLIF(:'skipped', '')::int, 0),
               :'run_url', :'source', :'report_url', :'version');" \
      "env=${env}" \
      "suite=${suite}" \
      "total=${total}" \
      "passed=${passed}" \
      "failed=${failed}" \
      "flaky=${flaky}" \
      "skipped=${skipped}" \
      "run_url=${run_url}" \
      "source=${source}" \
      "report_url=${report_url}" \
      "version=${version}" || exit 0
    ;;
  '')
    warn 'Kein Event-Typ angegeben — erwartet "deployment" oder "test_run"'
    exit 0
    ;;
  *)
    warn "Unbekannter Event-Typ '${kind}' — erwartet 'deployment' oder 'test_run'"
    exit 0
    ;;
esac

exit 0
