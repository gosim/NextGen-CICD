# NextGen-CICD

Eine Beispielanwendung zur Mitarbeiterverwaltung, verpackt in eine State-of-the-Art GitHub-Actions-Pipeline: Quality Gates, die eine Promotion strukturell verhindern, wenn E2E-Tests gegen die real deployte Umgebung fehlschlagen; automatischer Rollback von App **und** Datenbank; und ein Flaky-Test-Management, das Instabilität sichtbar macht statt sie zu verstecken. Kernbotschaft: *Eine Umgebung ist immer grün, weil eine Version, die das Gate nicht besteht, dort niemals stehen bleibt.*

Dieses Repository ist eine Demo für Enterprise-Teilnehmer — Antwort auf eine reale Ausgangslage, in der Integrationsumgebungen wegen flaky Tests und fehlendem Rollback dauerhaft rot sind.

## Architektur — Kurzüberblick

Drei identisch aufgebaute Docker-Compose-Stacks (Integration, Abnahme, PROD — je `frontend`/`backend`/`postgres`/`migrate`) plus ein separater Ops-Stack (Grafana + Mini-Postgres) laufen auf einem self-hosted GitHub-Runner. GitHub Actions baut Images auf gehosteten Runnern (`ubuntu-latest`), pusht sie mit einem unveränderlichen `sha-`-Tag nach GHCR; **dasselbe** Image wandert anschließend byte-identisch durch alle drei Umgebungen. Schlägt das E2E-Gate einer Umgebung fehl, rollt der Deploy-Job App und Datenbank automatisch auf die letzte grüne Version zurück.

Ausführlich dokumentiert in:

- **[docs/architecture.md](docs/architecture.md)** — Systemarchitektur- und Pipeline-Flow-Diagramme, Build-once-deploy-many, State-Tracking, Rollback-Mechanik im Detail, Port-Matrix, Sicherheitsprinzip
- **[docs/testkonzept.md](docs/testkonzept.md)** — Testpyramide, die drei Quality Gates (INT/Abnahme/PROD) und ihre Begründung, Flaky-Strategie inkl. Quarantäne-Prozess, Testdaten-Strategie
- **[docs/demo-runbook.md](docs/demo-runbook.md)** — Drehbuch für die Live-Präsentation in vier Akten
- **[Plan.md](Plan.md)** — vollständiger Umsetzungsplan mit allen Entscheidungen und Begründungen

## Quickstart

### Voraussetzungen

Auf dem Host wird bewusst nur das Minimum installiert — Node, pnpm, Playwright und Postgres-Client laufen ausschließlich in Containern:

- **Docker Desktop** (`brew install --cask docker`)
- **GitHub CLI** (`brew install gh`), danach `gh auth login`
- **jq** (`brew install jq`)

### Entwicklung ohne Node auf dem Host

`deploy/scripts/dev.sh` führt jedes Kommando in einem Wegwerf-Container aus (`node:22-bookworm`, pnpm-Store als benanntes Docker-Volume für schnelle Re-Installs):

```bash
deploy/scripts/dev.sh pnpm install
deploy/scripts/dev.sh pnpm -r typecheck
deploy/scripts/dev.sh pnpm lint
deploy/scripts/dev.sh pnpm test
```

### Lokale Stacks starten

Jede Umgebung ist ein eigenes Compose-Projekt mit eigenem env-File:

```bash
docker compose -p nextgen-int     --env-file deploy/env/int.env     -f deploy/compose/docker-compose.yml up -d --wait
docker compose -p nextgen-abnahme --env-file deploy/env/abnahme.env -f deploy/compose/docker-compose.yml up -d --wait
docker compose -p nextgen-prod    --env-file deploy/env/prod.env    -f deploy/compose/docker-compose.yml up -d --wait

# Ops-Stack (Grafana-Dashboard)
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml up -d
```

Danach: Frontend auf `http://localhost:8001` (INT) / `:8002` (Abnahme) / `:8003` (PROD), Dashboard auf `http://localhost:8000`.

### GitHub-Setup

Nach `gh auth login` richtet ein Skript Environments, Approval-Regeln und optional den self-hosted Runner ein:

```bash
deploy/scripts/setup-github.sh           # Environments: integration (auto), abnahme + prod (Required Reviewer)
deploy/scripts/setup-github.sh runner    # zusätzlich: self-hosted Runner unter ~/actions-runner installieren + starten
```

### Pipeline triggern

Ein Push auf `main` startet CI → Deploy INT automatisch. Für die Demo-Szenarien (siehe unten) per `workflow_dispatch`:

```bash
gh workflow run pipeline.yml -f demo_break_deploy=true
gh workflow run pipeline.yml -f demo_flaky=true
gh workflow run rollback-manual.yml -f environment=int -f restore_db=true
```

Alternativ über die GitHub-UI: Actions → „Pipeline" bzw. „Manueller Rollback" → „Run workflow".

## Port-Tabelle

| Umgebung | Compose-Projekt | Frontend | API | Postgres |
|---|---|---|---|---|
| Integration | `nextgen-int` | 8001 | 3001 | 5401 |
| Abnahme | `nextgen-abnahme` | 8002 | 3002 | 5402 |
| PROD | `nextgen-prod` | 8003 | 3003 | 5403 |
| Ops (Grafana) | `nextgen-ops` | 8000 | — | 5400 (ops-db) |

## Demo-Szenarien (`workflow_dispatch`-Inputs)

| Workflow | Input | Effekt |
|---|---|---|
| `pipeline.yml` | `demo_break_deploy=true` | Setzt `DEMO_BUG=broken-create` zur Laufzeit auf INT → `POST /api/mitarbeiter` liefert 500 → INT-Gate rot → automatischer Rollback (App + DB) |
| `pipeline.yml` | `demo_flaky=true` | Aktiviert den `@flaky-demo`-Testfall: schlägt im ersten Versuch fehl, besteht im Retry → Status „flaky" (gelb), Step-Summary-Warnung, Gate bleibt grün |
| `rollback-manual.yml` | `environment`, `image_tag` (optional), `restore_db` | Manueller Rollback einer beliebigen Umgebung auf eine Zielversion (Default: `last_green`), optional inklusive DB-Restore aus dem letzten Backup |

Details und das vollständige Vorführ-Drehbuch: [docs/demo-runbook.md](docs/demo-runbook.md).

## Verzeichnis-Struktur

```
NextGen-CICD/
├── Plan.md                    # Umsetzungsplan mit allen Entscheidungen
├── apps/                      # frontend (React/Vite/nginx), backend (Express/Drizzle)
├── packages/shared/           # Zod-Schemas, DTO-Types, data-testid-Konstanten (Single Source of Truth)
├── e2e/                       # eigenständiges Playwright-Package + Dockerfile
├── deploy/
│   ├── compose/                # docker-compose.yml (App-Stacks), docker-compose.ops.yml (Grafana)
│   ├── env/{int,abnahme,prod}.env
│   ├── grafana/                 # Datasources + Dashboard-JSON, provisioniert als Code
│   └── scripts/                 # dev.sh, backup.sh, restore.sh, deploy.sh, state.sh, ops-event.sh, setup-github.sh
├── docs/                       # architecture.md, testkonzept.md, demo-runbook.md, contracts/
└── .github/
    ├── workflows/               # pr.yml, pipeline.yml, _ci.yml, _deploy.yml, rollback-manual.yml
    └── actions/                 # Composite Actions für Deploy, Backup, Restore, E2E-Gate
```

Verbindliche Verträge zwischen Frontend, Backend und E2E-Tests liegen in `docs/contracts/` (`api.md`, `testids.md`).
