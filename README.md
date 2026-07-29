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

- **Docker Desktop** (`brew install --cask docker-desktop` — fragt nach dem Admin-Passwort; alternativ DMG von docker.com)
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

Jede Umgebung ist ein eigenes Compose-Projekt mit eigenem env-File. `deploy.sh` kapselt Pull, Migrations-One-Shot und Healthcheck-Wait (IMAGE_TAG ist Pflicht — die Pipeline setzt ihn auf den Commit-Tag, lokal tut es jeder gebaute Tag):

```bash
IMAGE_TAG=sha-local deploy/scripts/deploy.sh int
IMAGE_TAG=sha-local deploy/scripts/deploy.sh abnahme
IMAGE_TAG=sha-local deploy/scripts/deploy.sh prod

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

## URLs & Zugänge auf einen Blick

### Anwendungen (lokal)

| Umgebung | Frontend | API-Info | Health | Compose-Projekt | Postgres |
|---|---|---|---|---|---|
| Integration | http://localhost:8001 | http://localhost:3001/api/info | http://localhost:3001/api/health | `nextgen-int` | `localhost:5401` |
| Abnahme | http://localhost:8002 | http://localhost:3002/api/info | http://localhost:3002/api/health | `nextgen-abnahme` | `localhost:5402` |
| PROD | http://localhost:8003 | http://localhost:3003/api/info | http://localhost:3003/api/health | `nextgen-prod` | `localhost:5403` |

DB-Zugang je Umgebung: User/DB `app`, Passwort im jeweiligen [deploy/env/*.env](deploy/env/). Ops-DB: `localhost:5400` (User/DB/Passwort `ops`).

### Dashboard (Grafana)

| Was | URL |
|---|---|
| Grafana (anonymer Viewer) | http://localhost:8000 |
| Haupt-Dashboard „NextGen CICD — Environments" | http://localhost:8000/d/nextgen-environments/ |
| Editier-Login | `admin` / `admin` |
| Portainer (Container-GUI, alle Stacks/Logs/Konsolen) | http://localhost:9000 — beim ersten Aufruf Admin-Passwort setzen |

### GitHub

| Was | URL |
|---|---|
| Repository | https://github.com/gosim/NextGen-CICD |
| Actions (alle Läufe) | https://github.com/gosim/NextGen-CICD/actions |
| Pipeline manuell starten (Demo-Inputs) | https://github.com/gosim/NextGen-CICD/actions/workflows/pipeline.yml |
| Manueller Rollback | https://github.com/gosim/NextGen-CICD/actions/workflows/rollback-manual.yml |
| Stabilitäts-Check (stündlich + manuell) | https://github.com/gosim/NextGen-CICD/actions/workflows/stability-check.yml |
| Testreports (Playwright, GitHub Pages) | https://gosim.github.io/NextGen-CICD/ |
| Environments-Übersicht („was läuft wo") | https://github.com/gosim/NextGen-CICD/deployments |
| Environments-Einstellungen (Reviewer) | https://github.com/gosim/NextGen-CICD/settings/environments |
| Self-hosted Runner | https://github.com/gosim/NextGen-CICD/settings/actions/runners |

### Artifact-Repository (GHCR)

| Image | Web-Ansicht | Pull-Referenz |
|---|---|---|
| Backend | https://github.com/gosim/NextGen-CICD/pkgs/container/nextgen-cicd%2Fbackend | `ghcr.io/gosim/nextgen-cicd/backend:sha-<commit>` |
| Frontend | https://github.com/gosim/NextGen-CICD/pkgs/container/nextgen-cicd%2Ffrontend | `ghcr.io/gosim/nextgen-cicd/frontend:sha-<commit>` |
| E2E-Tests | https://github.com/gosim/NextGen-CICD/pkgs/container/nextgen-cicd%2Fe2e | `ghcr.io/gosim/nextgen-cicd/e2e:sha-<commit>` |

Hinweis: Die Pakete sind aktuell **privat** (Sichtbarkeit wurde beim ersten Push aus dem damals privaten Repo geerbt) — die Web-Ansichten funktionieren im eingeloggten Browser; die Pipeline zieht sie per `GITHUB_TOKEN`. Öffentlich machen (optional, für die Demo nicht nötig): Paketseite → Package settings → Change visibility.

Testreports/Traces der Quality Gates: als **Artifacts** am jeweiligen Actions-Lauf (14 Tage Retention). Lokale Wiederherstellungs-Ablagen (State, DB-Dumps, green-Pins): siehe [docs/architecture.md → Artefakt-Ablagen](docs/architecture.md).

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
