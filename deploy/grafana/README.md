# Observability — Grafana Ops-Stack

Visueller Anker der Demo: live-Umgebungsstände, Deployment-Historie und Gate-/Flaky-Trends
in **einem** Dashboard („NextGen CICD — Environments"). Der Ops-Stack läuft bewusst getrennt
vom App-Stack, damit das Dashboard **nie** ein Single Point of Failure ist.

## Start / Stopp

```bash
# Starten (aus dem Repo-Root)
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml up -d

# Stoppen (Daten bleiben in den Volumes erhalten)
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml stop

# Komplett-Rückbau inkl. Volumes
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml down -v
```

- Grafana: **http://localhost:8000** — anonymer **Viewer** ohne Login.
- Editieren: oben rechts anmelden mit **admin / admin**.
- Das Haupt-Dashboard ist als Startseite gesetzt (`GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH`).

> **Erststart braucht Internet:** Das Panel-Plugin `yesoreyeram-infinity-datasource`
> (Live-Poll der Umgebungen) wird beim ersten Hochfahren von Grafana heruntergeladen
> (`GF_INSTALL_PLUGINS`). Danach liegt es im `grafana-data`-Volume und funktioniert offline.

## Stack

| Service              | Image                       | Port (Host) | Zweck                                    |
| -------------------- | --------------------------- | ----------- | ---------------------------------------- |
| `nextgen-ops-db`     | `postgres:16-alpine`        | 5400        | Ops-DB: `deployments`, `test_runs`       |
| `nextgen-ops-grafana`| `grafana/grafana-oss:11.4.0`| 8000        | Dashboard (Datasources + JSON as Code)   |

Alles ist **as Code** provisioniert (nichts manuell klicken):

- `provisioning/datasources/datasources.yml` — **OpsDB** (Postgres, uid `ops-postgres`, default)
  und **Infinity** (uid `infinity`).
- `provisioning/dashboards/dashboards.yml` — lädt alle JSON aus `dashboards/`.
- `dashboards/nextgen-environments.json` — das Haupt-Dashboard.
- `../compose/ops-db-init/01_schema.sql` — Schema-Init der Ops-DB beim ersten Start.

## Dashboard-Panels

1. **Umgebungen live** — pro Umgebung (INT 3001, ABNAHME 3002, PROD 3003) ein Stat mit
   laufender Version (`gitSha`) und ein Health-Stat (GRÜN / rot / **OFFLINE**), live via
   Infinity gegen `http://host.docker.internal:<port>/api/info` bzw. `/api/health`.
   Kein Zusatzdienst — der echte Ist-Zustand direkt aus der App.
2. **Deployment-Historie** — Tabelle aus `deployments`; Status farbig hinterlegt
   (`rolled_back` rot, `promoted` grün, `deployed` blau, `failed` dunkelrot), Run-Spalte verlinkt.
3. **Quality Gates** — gestapelte Balken passed/failed/flaky (INT & Abnahme) plus die Stats
   „Flaky gesamt (7d)", „Rollbacks (7d)" und „Letzte Gate-Dauer".

## Event-Vertrag (`../scripts/ops-event.sh`)

Die Pipeline speist Events in die Ops-DB — **fail-safe**: Ist der Ops-Stack nicht erreichbar
oder schlägt der INSERT fehl, wird das Event verworfen und das Skript endet mit `exit 0`.
Ein fehlendes Dashboard darf niemals ein Deployment brechen.

```bash
# Deployment-Event (status: deployed | promoted | rolled_back | failed)
deploy/scripts/ops-event.sh deployment <env> <image_tag> <git_sha> <actor> <status> [duration_seconds] [run_url]

# Testlauf-Event (inkl. flaky-Zahl)
deploy/scripts/ops-event.sh test_run <env> <suite> <total> <passed> <failed> <flaky> <skipped> [run_url]
```

Beispiele:

```bash
deploy/scripts/ops-event.sh deployment int sha-abc1234 abc1234 gosim deployed 42 "$RUN_URL"
deploy/scripts/ops-event.sh deployment int sha-abc1234 abc1234 gosim rolled_back "" "$RUN_URL"
deploy/scripts/ops-event.sh test_run   int int-regression 8 7 0 1 0 "$RUN_URL"
```

Werte werden per `psql -v` und `:'var'`-Quoting übergeben (SQL-Injection-sicher). Der Container
wird fest über `docker exec nextgen-ops-db` angesprochen — daher der feste `container_name`.

## Fail-safe-Beweis (Demo)

Ops-Stack stoppen und trotzdem deployen — die Pipeline läuft fehlerfrei durch, die Events
landen nur nicht im Dashboard:

```bash
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml stop
# ... Deployment/Rollback läuft normal, ops-event.sh meldet "Ops-Stack nicht erreichbar" auf stderr
```
