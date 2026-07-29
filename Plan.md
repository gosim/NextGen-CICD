# NextGen-CICD — Umsetzungsplan

## Kontext

Im echten Projekt des Users sind Umgebungen dauerhaft rot: flaky Playwright-Tests, kein Quality-Gate-Prinzip, kein Rollback bei fehlgeschlagenen Tests nach Deployments auf Integration. Dieses Demo-Projekt zeigt Enterprise-Teilnehmern, **wie man es richtig macht**: eine State-of-the-Art GitHub-Actions-Pipeline mit Quality Gates (INT-E2E-Tests gaten Integration, Abnahmetests gaten Abnahme), automatischem Rollback von App **und** Datenbank, und vorbildlichem Umgang mit flaky Tests. Kernbotschaft: *Eine Umgebung ist immer grün, weil eine Version, die das Gate nicht besteht, dort niemals stehen bleibt.*

Das Repo ist Greenfield (nur README.md, Remote: `github.com/gosim/NextGen-CICD`). Die Präsentation entscheidet über die Karriere des Users — Qualität und Demo-Wirkung haben Priorität.

**Hinweis:** Erster Umsetzungs-Task ist, diesen Plan als `Plan.md` ins Repo-Root zu übernehmen (explizite Anforderung des Users).

## Getroffene Entscheidungen (mit User abgestimmt)

| Thema | Entscheidung |
|---|---|
| Tech-Stack | React (Vite) + Node.js/Express, alles TypeScript, Postgres |
| Deploy-Ziel | Self-hosted GitHub Runner auf dem Mac, 3 Umgebungen als Docker-Compose-Stacks |
| DB-Rollback | `pg_dump`-Backup vor jedem Deployment, `pg_restore` bei Rollback |
| Demo-Szenarien | Flaky-Test-Demo, kaputtes Deployment + Rollback, manuelle Approval-Gates, Präsentations-Doku |
| Docker-Runtime | Docker Desktop (Installation per Homebrew erlaubt) |
| Host-Footprint | **Minimal**: nur Docker Desktop + zwei kleine CLIs (gh, jq) + Runner-Ordner. Kein Node/pnpm auf dem Host — alles läuft in Containern (Details unten) |
| Dashboard | **Grafana** (Docker, eigener Ops-Stack): Umgebungsstände live, Deployment-Historie, Gate-/Flaky-Trends, Rollback-Events |

Technologie-Entscheidungen aus der Planungsphase (Rollen-Agenten: CI/CD-Architekt, Fullstack-Dev, Quality Engineer):

- **pnpm workspaces** (deterministische Installs, `pnpm deploy --filter` für schlanke Runtime-Images)
- **Drizzle ORM + drizzle-kit** (versionierte plain-SQL-Migrationen, kein Query-Engine-Binary, idempotenter Migrations-Runner)
- **Mantine + TanStack Query** im Frontend (professioneller Look ohne Custom-CSS-Aufwand)
- **Zod-Schemas in `packages/shared`** — eine Validierungs-Quelle für Frontend + Backend
- **Domäne: Mitarbeiterverwaltung** — Entitäten `Mitarbeiter` (CRUD: personalnummer unique, vorname, nachname, email unique, abteilungId, eintrittsdatum, status) und `Abteilung` (geseedet, read-only). Genug Fläche für aussagekräftige E2E-Tests (Validierung, Duplikat→409, Lösch-Bestätigung, Suche/Filter), nicht mehr.
- **Build once, deploy many**: Images einmal gebaut, mit `sha-<shortsha>` getaggt (GHCR), byte-identisch durch INT→Abnahme→PROD promoted. Umgebungs-Identität ist reine Laufzeit-Config — nie Build-Arg.

## Host-Footprint & Isolation (Anforderung: Rechner nicht überladen)

Auf dem Mac selbst landet **nur das Notwendigste** — alles andere läuft isoliert in Docker:

| Auf dem Host | Zweck | Größe / Entfernbar durch |
|---|---|---|
| Docker Desktop | Container-Runtime (unvermeidbar) | App; alle Images/Volumes liegen **in der Docker-VM**, nicht verstreut im Dateisystem; RAM/CPU in Docker Desktop begrenzbar (z.B. 4 GB) |
| `gh` + `jq` (Homebrew) | GitHub-Setup per API, JSON in Deploy-Skripten | je wenige MB, reine CLIs ohne Hintergrunddienste; `brew uninstall gh jq` |
| `~/actions-runner/` | Self-hosted GitHub Runner (inhärent nötig, damit die Pipeline lokal deployen kann) | ~200 MB Ordner, läuft als User-LaunchAgent, idlet bei ~0 % CPU; `./svc.sh uninstall` + Ordner löschen |
| `~/deployments/{state,backups}` | State-Files (KB) + pg_dump-Backups (Demo-DB: wenige MB, Retention 10) | Ordner löschen |

**Nicht auf dem Host installiert:** Node.js, pnpm, Playwright, Postgres-Client — sämtliche Node-/Test-/DB-Werkzeuge laufen ausschließlich in Containern:
- Entwicklung/Builds lokal: Wegwerf-Container `docker run --rm -v "$PWD":/work -w /work node:22 …` (gekapselt in `deploy/scripts/dev.sh`, z.B. `dev.sh pnpm install`, `dev.sh pnpm test`)
- CI-Builds: auf GitHub-hosted Runnern (`ubuntu-latest`), nie auf dem Mac
- E2E: offizieller Playwright-Container; `pg_dump`/`pg_restore`: via `docker exec` im jeweiligen db-Container

Ressourcenlast im Betrieb: 3 Compose-Stacks à 3 schlanke Alpine-Container (Postgres/Backend/nginx) + Ops-Stack (Grafana + Mini-Postgres, 2 Container) ≈ 1,5–2,5 GB RAM gesamt; Stacks lassen sich außerhalb der Demo mit `docker compose stop` schlafen legen. Komplett-Rückbau: `docker compose -p nextgen-… down -v` ×4 + Docker Desktop deinstallieren.

## Zielarchitektur

### Repo-Struktur

```
NextGen-CICD/
├── Plan.md                         # dieser Plan
├── apps/
│   ├── frontend/                   # React+Vite+TS, Mantine, nginx-Container (proxied /api)
│   └── backend/                    # Express+TS, Drizzle, drizzle/-Migrationen, migrate.ts
├── packages/shared/                # Zod-Schemas, DTO-Types (Single Source of Truth)
├── e2e/                            # eigenständiges Playwright-Package + Dockerfile
├── deploy/
│   ├── compose/docker-compose.yml  # EINE parametrisierte Compose-Datei (App-Stacks)
│   ├── compose/docker-compose.ops.yml  # Ops-Stack: Grafana + ops-db
│   ├── env/{int,abnahme,prod}.env  # Port-Matrix, ENV-Name, IMAGE_TAG
│   ├── grafana/                    # provisioning/ (Datasources, Dashboards-as-Code JSON)
│   └── scripts/                    # backup.sh, restore.sh, deploy.sh, ops-event.sh
├── docs/                           # architecture.md (Mermaid), demo-runbook.md, testkonzept.md
├── .github/
│   ├── workflows/                  # pr.yml, pipeline.yml, _ci.yml, _deploy.yml, rollback-manual.yml
│   └── actions/                    # deploy-stack, db-backup, db-restore, run-e2e, release-state
├── pnpm-workspace.yaml, tsconfig.base.json, package.json
```

### App-Kernpunkte

- Backend: `GET /api/health` (+`/ready` mit DB-Ping), **`GET /api/info` → `{version, gitSha, environment, buildTime, demoBug}`** (Kern der Rollback-Demo), CRUD `/api/mitarbeiter`, `/api/abteilungen`, `POST /api/admin/reset` (env-guarded, für E2E). Zod-Validierung per Middleware, zentrale Error-Middleware (Unique-Violation 23505 → 409).
- Frontend: AppShell mit **farbcodiertem Environment-Badge** (INT blau, Abnahme orange, PROD grün) + Versions-Badge — Umgebungsname kommt zur **Laufzeit** aus `/api/info` (Vite-Falle: nichts Umgebungsspezifisches einbacken). `data-testid` auf jedem interaktiven Element (Konvention `{entity}-{bereich}-{element}`, dokumentiert als Vertrag in `e2e/README.md`).
- Migrationen: im Backend-Image enthalten (`dist/migrate.js`), laufen als **One-Shot-Compose-Service** `migrate` (`depends_on: db healthy`; Backend startet erst nach `service_completed_successfully`).
- **Demo-Flags** (Laufzeit-ENV, kein Build-Arg): `DEMO_BUG=broken-create` → `POST /api/mitarbeiter` liefert 500 + Log-Zeile + sichtbar in `/api/info`; `DEMO_FLAKY=true` aktiviert den flaky Demo-Test.

### Umgebungen (3 Compose-Stacks auf einem Host)

| Umgebung | Projekt (`-p`) | Frontend | API | Postgres | Approval |
|---|---|---|---|---|---|
| Integration | `nextgen-int` | 8001 | 3001 | 5401 | automatisch |
| Abnahme | `nextgen-abnahme` | 8002 | 3002 | 5402 | Required Reviewer |
| PROD | `nextgen-prod` | 8003 | 3003 | 5403 | Required Reviewer |
| Ops (Grafana) | `nextgen-ops` | 8000 (Grafana) | — | 5400 (ops-db) | — |

Getrennte Projektnamen ⇒ getrennte Netzwerke, Container **und Volumes**. Start je: `docker compose -p nextgen-<env> --env-file deploy/env/<env>.env -f deploy/compose/docker-compose.yml up -d`.

### Observability-Dashboard (Grafana, Ops-Stack)

Eigener vierter Compose-Stack `nextgen-ops` (bewusst schlank, 2 Container):

- **`ops-db`** (postgres:16-alpine): Mini-Datenbank mit zwei Tabellen — `deployments` (time, env, image_tag, git_sha, actor, status: deployed/promoted/rolled_back/failed, dauer) und `test_runs` (time, env, suite, total, passed, failed, **flaky**, skipped, run_url). Befüllt von der Pipeline: die Composite Actions (`release-state`, Rollback-Schritt, Flaky-Report-Parser) schreiben Events via `deploy/scripts/ops-event.sh` (`docker exec ops-db psql -c "INSERT …"`). Fail-safe: Ops-Stack down ⇒ Event wird verworfen, Deployment läuft trotzdem (Dashboard ist nie Single Point of Failure).
- **`grafana`** (grafana/grafana-oss): vollständig **als Code provisioniert** (Datasources + Dashboard-JSON committed unter `deploy/grafana/` — State-of-the-Art-Punkt „Dashboards as Code"). Anonymer Viewer-Zugriff aktiviert, damit in der Demo kein Login nötig ist.

**Dashboard-Panels** (ein Haupt-Dashboard „NextGen CICD — Environments"):
1. **Umgebungs-Status live** — 3 Stat-Panels (INT/Abnahme/PROD): laufende Version/SHA + Health (grün/rot), via Grafana **Infinity-Datasource** direkt gegen `http://host.docker.internal:300x/api/info` und `/api/health` gepollt — zeigt den echten Ist-Zustand ohne Zusatzdienste
2. **Deployment-Historie** — Tabelle/Timeline aus `deployments`: wer hat wann welche Version wohin deployed, Promotions, **Rollback-Events rot markiert**
3. **Gate-Ergebnisse & Flaky-Trend** — Zeitreihe aus `test_runs`: passed/failed/flaky pro Lauf; der Flaky-Trend ist das Kern-Demo-Panel („Flakiness wird sichtbar gemanagt, nicht ignoriert")
4. **Rollback-Zähler & letzte Gate-Dauer** — kleine Stats für den „Umgebungen sind immer grün"-Beweis

Das Dashboard ist der visuelle Anker der Präsentation: Beamer zeigt Grafana, während die Pipeline läuft — Deploy erscheint, Gate läuft, bei der Bad-Commit-Demo springt der Rollback-Event sichtbar ins Dashboard und der Umgebungs-Status bleibt grün auf der alten Version.

### Pipeline (GitHub Actions)

```
pr.yml (pull_request, ubuntu-latest)  → _ci.yml ohne Image-Push (Branch-Protection-Check)

pipeline.yml (push main + workflow_dispatch mit Demo-Inputs):
ci (_ci.yml, ubuntu-latest: lint, typecheck, unit, build+push GHCR, Output: sha-Tag)
 └─► deploy-int     (_deploy.yml, environment: integration)  — auto
      └─► deploy-abnahme (_deploy.yml, environment: abnahme) — ⏸ Approval
           └─► deploy-prod (_deploy.yml, environment: prod)  — ⏸ Approval
```

`_deploy.yml` (Herzstück, Jobs auf `[self-hosted, macOS, deploy]`):

```
prepare ──► deploy ──► gate ──► promote        (nur wenn Gate grün)
   └───────────┴─────────┴──► rollback         (if: failure())
```

- **prepare**: State-File lesen, `pg_dump -Fc` → `~/deployments/backups/<env>/<timestamp>_<sha>.dump` (Retention 10)
- **deploy**: GitHub Deployment (API) `in_progress`; `compose up -d` mit `IMAGE_TAG`; `migrate`-One-Shot; Healthcheck-Wait (Timeout ~60s)
- **gate**: Playwright-Container gegen Env-URL (`host.docker.internal:<port>`), Testset per Playwright-Project (`int-regression` / `abnahme` / `smoke` für PROD), `--grep-invert @quarantine`; HTML-Report + Traces als Artifact
- **promote**: State-File `last_green = sha`; Deployment-Status `success`; Green-Image lokal zusätzlich taggen (Schutz vor `docker prune`)
- **rollback**: Backend stoppen → `pg_terminate_backend` → `pg_restore --clean --if-exists` → `compose up` mit `last_green` (Image aus lokalem Cache) → Healthcheck → State + Deployment-Status `failure` + Job-Summary. Bootstrap-Fall (kein `last_green`): Warnung statt Crash. **Ergebnis-Bild: Workflow-Run rot, Umgebung grün — genau die Demo-Botschaft.**

Quality-Gate-Mechanik: Promotion ist strukturell unmöglich ohne grünes Gate (`needs`-Kette, kein `if: always()` an Promotion-Jobs). `last_green` wird ausschließlich im promote-Job fortgeschrieben.

Zusätzlich: `rollback-manual.yml` (workflow_dispatch: environment, image_tag=default last_green, restore_db) als Notfallhebel + Demo.

**State-Tracking (2 Ebenen):** operative Wahrheit im Host-State-File `~/deployments/state/<env>.json` (`current`, `last_green`, `last_backup` — Rollback funktioniert ohne GitHub-API); Sichtbarkeit über GitHub Deployments API (Repo-Seite „Environments" zeigt live, welcher Commit wo läuft — Demo-Wow-Effekt).

**Concurrency:** `pipeline.yml`: `group: cd-pipeline, cancel-in-progress: true`; in `_deploy.yml` pro Env: `group: deploy-<env>, cancel-in-progress: false` (laufendes Deploy/Rollback nie abbrechen — halb restaurierte DB!).

**Sicherheit self-hosted Runner:** CI/PR ausschließlich auf `ubuntu-latest` (nie Fremdcode auf dem Mac), self-hosted nur für CD auf `main`, Repo privat halten empfohlen, „Require approval for outside collaborators". Ein Runner = 1 Job parallel ⇒ Deployments serialisieren sich automatisch.

### Test- & Flaky-Strategie

Testpyramide: Unit Backend (Vitest) + Component Frontend (Vitest+RTL+MSW) + API-Tests (Supertest, im CI-Container gegen Postgres-Service) im PR/CI; **E2E-Gate läuft gegen die real deployte Umgebung** (das ist die Demo-Botschaft, nicht der PR-Smoke).

Playwright-Config: `baseURL` per ENV, `testIdAttribute: data-testid`, **`retries: 2` in CI** (erkennen Flakiness — Fail→Pass = Status „flaky"/gelb — beheben sie nicht), `trace: on-first-retry`, `video/screenshot: on-failure`, Reporter `list+html+github+json`, `workers: 2` (geteilte deployte DB), Projects: `int-regression` (@regression, 8 Tests), `abnahme` (@abnahme, kritische Geschäftsprozesse: Anlegen/Ändern/Löschen/Anzeige), `smoke` (@smoke, read-only für PROD), `quarantine`.

8 Testfälle (Mitarbeiter-CRUD): Smoke/Health, Liste+Seed sichtbar, Anlegen (@abnahme), Bearbeiten (@abnahme), Löschen mit Bestätigung (@abnahme), Validierungsfehler, Duplikat-Personalnummer→409 im UI, Suche/Filter. Testdaten: Seed-Baseline (idempotent, `setup`-Project) + ephemere Unique-Keys `E2E-{runId}-{worker}-{n}` mit Auto-Cleanup-Fixture über `apiClient` — beliebig wiederholbar gegen dieselbe Umgebung.

Flaky-Handling (Herzstück): flaky = bestanden fürs Gate, aber **laut geflaggt** (JSON-Report parsen → Warnung im Step Summary, optional Auto-Issue); Quarantäne via `@quarantine`-Tag (Gate exkludiert, separater non-blocking Job läuft sie weiter + Report; Prozess mit Issue/Owner/Frist in docs). Demo-Test `@flaky-demo`: nur bei `DEMO_FLAKY=true`, deterministisch via `testInfo.retry` (Attempt 0 rot, Retry grün ⇒ garantiert gelbes „flaky"-Badge bei jeder Vorführung).

### GitHub-Konfiguration

Environments `integration` (keine Reviewer) / `abnahme` / `prod` (Required Reviewer: gosim, **kein** „prevent self-review" — Solo-Demo!), Deployment branches: nur `main`. Env-Variables: Ports + BASE_URL; Secret: `POSTGRES_PASSWORD`. GHCR via `GITHUB_TOKEN` (`packages: write/read`), kein PAT. Branch Protection auf `main` mit pr.yml-Checks. Einrichtung soweit möglich per `gh api`, Rest dokumentiert.

## Tasks

### Phase 0 — Voraussetzungen & Setup (minimaler Host-Footprint)
- [x] `Plan.md` (dieser Plan) ins Repo-Root committen
- [x] Homebrew-Installationen: `brew install --cask docker` (Docker Desktop), `brew install gh jq` — **kein** Node/pnpm auf dem Host
- [x] Docker Desktop starten + Ressourcen-Limit setzen, `gh auth login` (User-Interaktion nötig), Repo-Visibility prüfen (privat empfohlen)
- [x] `deploy/scripts/dev.sh` (Node-Wegwerf-Container-Wrapper) anlegen; Verzeichnisse `~/deployments/{state,backups}` anlegen

### Phase 1 — Monorepo-Gerüst + Shared
- [x] pnpm-workspace, `tsconfig.base.json` (strict), Root-Scripts, ESLint/Prettier
- [x] `packages/shared`: Zod-Schemas Mitarbeiter/Abteilung, DTO-Types, Fehlerformat

### Phase 2 — Backend (parallel zu Phase 3 möglich)
- [x] Express-App-Factory, Zod-validierte ENV (fail-fast), Drizzle-Schema + generierte SQL-Migrationen + `migrate.ts`, Seed (deterministisch, idempotent)
- [x] Routen: health/ready, **info**, CRUD Mitarbeiter, Abteilungen, admin/reset (guarded); Error-Middleware; `DEMO_BUG`-Mechanik
- [x] Unit-Tests (Vitest) + API-Tests (Supertest)

### Phase 3 — Frontend
- [x] Mantine-AppShell mit Env-/Versions-Badge (aus `/api/info`), Mitarbeiter-Tabelle mit Suche/Filter, Formular-Modal (Zod-Resolver aus shared), Lösch-Bestätigung, Toasts, Empty-State
- [x] `data-testid`-Vertrag umsetzen + dokumentieren; Component-Tests

### Phase 4 — Docker & Deploy-Basis
- [x] Multi-stage Dockerfiles (Backend: node:22-alpine, non-root, HEALTHCHECK; Frontend: nginx + `/api`-Proxy; Build-Args nur für Version/SHA)
- [x] Parametrisierte `docker-compose.yml` (db/migrate/backend/frontend), drei env-Files mit Port-Matrix
- [x] `backup.sh`, `restore.sh`, `deploy.sh` (Backup → migrate → up → Healthcheck-Wait)

### Phase 5 — E2E-Package
- [x] Playwright-Package mit eigenem Dockerfile (`mcr.microsoft.com/playwright`), Config (Projects/Retries/Reporter wie oben), `apiClient`- + Cleanup-Fixtures, Seed-Setup-Project
- [x] Die 8 CRUD-Tests mit Tags, `@flaky-demo`-Test, ein `@quarantine`-Beispiel
- [x] Flaky-Report-Parser (results.json → Step Summary)

### Phase 6 — Pipeline
- [x] Composite Actions: deploy-stack, db-backup, db-restore, run-e2e, release-state
- [x] `_ci.yml` (lint, typecheck, unit/API-Tests, buildx build+push GHCR, sha-Tag als Output), `pr.yml`
- [x] `_deploy.yml` (prepare→deploy→gate→promote | rollback; environment per Input; concurrency pro Env)
- [x] `pipeline.yml` (needs-Kette, workflow_dispatch mit Demo-Inputs), `rollback-manual.yml`

### Phase 7 — Observability-Dashboard (Grafana)
- [x] `docker-compose.ops.yml`: Grafana (anonymer Viewer, provisioniert) + ops-db (Schema `deployments`, `test_runs` via Init-SQL)
- [x] `deploy/grafana/provisioning`: Datasources (ops-Postgres, Infinity) + Dashboard-JSON („NextGen CICD — Environments" mit den 4 Panel-Gruppen)
- [x] `ops-event.sh` + Pipeline-Integration: Events aus deploy/promote/rollback + Testergebnisse (inkl. flaky-Zahl) fail-safe einspeisen

### Phase 8 — GitHub- & Runner-Setup
- [ ] Environments + Protection Rules + Variables/Secrets via `gh api` anlegen
- [ ] Self-hosted Runner installieren (`~/actions-runner`, Labels `self-hosted,macOS,deploy`, als LaunchAgent-Dienst), Actions-Sicherheitseinstellungen
- [ ] Branch Protection `main`

### Phase 9 — Doku & Präsentation
- [x] `docs/architecture.md` (Architektur- + Pipeline-Flow als Mermaid), `docs/testkonzept.md` (Pyramide, Flaky-/Quarantäne-Prozess), `docs/demo-runbook.md` (Drehbuch in 4 Akten: Normalzustand grün → Bad Commit → Gate rot → Trace-Viewer → Auto-Rollback → Flaky-Demo → Quarantäne; Grafana als durchgehender Beamer-Anker)
- [x] README neu schreiben (Projektüberblick, Quickstart, Badges, Environments-Link)

### Phase 10 — Verifikation & Qualitäts-Pass
- [ ] Siehe Verifikation unten; danach Multi-Agent-Code-Review (adversarial verify) + Simplify-Pass

## Ausführungsstrategie (parallele Rollen-Agenten)

Ultracode/Workflow-Orchestrierung mit Modell-Zuordnung nach Aufgabenschwere:

| Arbeitspaket | Rolle | Modell |
|---|---|---|
| Orchestrierung, `_deploy.yml` + Rollback-Mechanik, finale Verifikation | CI/CD-Architekt (Hauptloop) | **Fable** |
| Backend, Frontend, E2E-Package (parallel, worktree-isoliert) | Fullstack-Dev / Quality Engineer | **Opus** |
| Grafana-Dashboard (Provisioning, Panels, ops-Schema) | Observability-Engineer | **Opus** |
| Doku, env-Files, Boilerplate, README | Tech Writer | **Sonnet** |
| Review-Pass (mehrere Finder + adversarial Verify) | Reviewer-Panel | Opus/Fable |

Reihenfolge: Phase 0–1 sequenziell (Fundament), Phasen 2/3/5 parallel per Workflow (gemeinsamer Vertrag: shared-Schemas + data-testid-Liste + API-Spec aus Phase 1), Phase 4/6 danach durch Fable, Phase 7 parallel zu 6 (Dashboard braucht nur das ops-Schema + Event-Skript-Vertrag), Phase 8 mit User-Interaktion (Logins/Passwörter), Phase 9 parallel zu 8, Phase 10 zum Schluss.

## Verifikation (End-to-End)

1. **Lokal (alles im Container):** `dev.sh pnpm lint && dev.sh pnpm typecheck && dev.sh pnpm test` grün; alle drei Compose-Stacks parallel hochfahren; UI je Umgebung im Browser: korrektes Badge (INT/Abnahme/PROD) + Version; E2E-Container gegen INT laufen lassen → grün.
2. **Rollback lokal beweisen:** Mit `DEMO_BUG=broken-create` deployen → Gate rot → `restore.sh` + `last_green`-Redeploy → Datenstand und Version wiederhergestellt (Badge zeigt alte SHA), Umgebung grün.
3. **Pipeline live:** Push auf `main` → Run beobachten: CI → INT auto → Approval Abnahme → Approval PROD; „Environments"-Seite zeigt Versionen; Step Summary mit Testübersicht.
4. **Dashboard:** Grafana unter `localhost:8000` zeigt live die drei Umgebungsstände (Version + Health), die Deployment-Historie des Pipeline-Laufs und die Gate-Ergebnisse; Ops-Stack gestoppt ⇒ Pipeline läuft trotzdem fehlerfrei durch (Fail-safe-Beweis).
5. **Demo-Szenarien durchspielen:** (a) Bad Commit pushen → INT-Gate rot → Rollback-Job grün → Umgebung weiter auf alter Version, Rollback-Event erscheint rot in Grafana; (b) `DEMO_FLAKY=true`-Dispatch → gelbes flaky-Badge + Step-Summary-Warnung + Flaky-Trend im Dashboard; (c) Quarantäne-Lauf nicht-blockierend; (d) manueller Rollback via `rollback-manual.yml`.
6. Demo-Runbook einmal komplett gegen die echte Pipeline durchgehen (Generalprobe).

## Bekannte Stolpersteine (in Umsetzung beachten)

- Playwright-Container → Host-Ports auf macOS: `host.docker.internal` verwenden (kein `--network host`)
- `pg_restore` nur nach Backend-Stop + `pg_terminate_backend`
- `environment:` muss **innerhalb** von `_deploy.yml` am Job stehen (sonst greifen Protection Rules nicht); `secrets: inherit` + explizite `permissions`
- Vite backt `VITE_*` zur Buildzeit ein — Umgebungsname strikt zur Laufzeit via `/api/info`
- Rollback-Images vor `docker prune` schützen (Green-Tag lokal pinnen)
- Erstdeployment: leerer State → alle Rollback-Pfade müssen Bootstrap-Fall abfangen
- State/Backups außerhalb des Runner-`_work`-Verzeichnisses (`~/deployments/`)
