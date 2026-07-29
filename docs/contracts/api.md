# API-Vertrag — NextGen Stammdaten

Verbindlicher Vertrag zwischen Backend, Frontend und E2E-Tests. Änderungen nur mit Anpassung aller drei Konsumenten.

## Konventionen

- Alle Endpunkte unter `/api`, JSON, UTF-8.
- Fehlerformat (immer): `{ "error": { "code": ApiErrorCode, "message": string, "details"?: [{ "field": string, "message": string }] } }`
  - Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `FORBIDDEN` (403), `INTERNAL` (500)
- Validierung: Zod-Schemas aus `@nextgen/shared` (`mitarbeiterCreateSchema`, `mitarbeiterUpdateSchema`). `details[].field` = Zod-Pfad (z.B. `email`).
- Datumsformat `eintrittsdatum`: `YYYY-MM-DD` (String). `createdAt`/`updatedAt`: ISO-8601.

## Endpunkte

| Methode & Pfad | Erfolg | Fehler | Beschreibung |
|---|---|---|---|
| `GET /api/health` | 200 `{"status":"ok"}` | — | Liveness (Docker HEALTHCHECK) |
| `GET /api/health/ready` | 200 `{"status":"ready"}` | 503 `{"status":"not_ready"}` | Readiness inkl. DB-Ping (`SELECT 1`) |
| `GET /api/info` | 200 `AppInfo` | — | `{name:"nextgen-stammdaten", version, gitSha, environment, buildTime, demoBug}` |
| `GET /api/abteilungen` | 200 `Abteilung[]` | — | Sortiert nach `name` asc |
| `GET /api/mitarbeiter` | 200 `Mitarbeiter[]` | — | Query: `search` (ilike auf vorname/nachname/personalnummer), `status` (`aktiv`\|`inaktiv`), `abteilungId`. Sortiert `nachname` asc. Enthält `abteilungName` (Join) |
| `POST /api/mitarbeiter` | 201 `Mitarbeiter` | 400, 409 | Body: `MitarbeiterCreate`. 409 bei Duplikat `personalnummer` ODER `email` (`CONFLICT`, message nennt das Feld in `details`). **Bei `DEMO_BUG=broken-create`: 500 `INTERNAL`** + Log-Zeile `DEMO_BUG active: broken-create` |
| `GET /api/mitarbeiter/:id` | 200 `Mitarbeiter` | 404 | — |
| `PUT /api/mitarbeiter/:id` | 200 `Mitarbeiter` | 400, 404, 409 | Body: `MitarbeiterUpdate` (vollständig) |
| `DELETE /api/mitarbeiter/:id` | 204 | 404 | — |
| `POST /api/admin/reset` | 204 | 403 | Nur wenn `ENABLE_TEST_RESET=true`, sonst 403 `FORBIDDEN`. Löscht alle Mitarbeiter und spielt den Seed-Baseline-Datensatz neu ein (idempotent) |

## Backend-ENV-Variablen (Zod-validiert, fail-fast)

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port im Container |
| `DATABASE_URL` | — (Pflicht) | Postgres-Connection-String |
| `APP_ENV` | `local` | `local` \| `int` \| `abnahme` \| `prod` |
| `APP_VERSION` | `dev` | Wird beim Docker-Build als Build-Arg gesetzt |
| `GIT_SHA` | `unknown` | Kurz-SHA, Build-Arg |
| `BUILD_TIME` | `unknown` | ISO-Zeitstempel, Build-Arg |
| `ENABLE_TEST_RESET` | `false` | `true` nur auf INT/Abnahme |
| `DEMO_BUG` | `none` | `none` \| `broken-create` (Laufzeit-Flag, Demo) |

## Seed-Baseline (deterministisch, idempotent — Upsert)

Abteilungen (feste IDs): 1 `IT` (K-1000), 2 `Personal` (K-2000), 3 `Vertrieb` (K-3000), 4 `Buchhaltung` (K-4000).

Mitarbeiter (Upsert über `personalnummer`):
| personalnummer | vorname | nachname | email | abteilungId | eintrittsdatum | status |
|---|---|---|---|---|---|---|
| P-1001 | Max | Mustermann | max.mustermann@example.de | 1 | 2020-01-15 | aktiv |
| P-1002 | Erika | Musterfrau | erika.musterfrau@example.de | 2 | 2019-06-01 | aktiv |
| P-1003 | Hans | Schmidt | hans.schmidt@example.de | 1 | 2021-03-10 | aktiv |
| P-1004 | Anna | Weber | anna.weber@example.de | 3 | 2022-11-01 | aktiv |
| P-1005 | Peter | Wagner | peter.wagner@example.de | 4 | 2018-02-20 | inaktiv |

E2E-Tests legen eigene Datensätze ausschließlich mit Personalnummern `P-9<runId-Suffix>…` und E-Mails `e2e-…@example.de` an und räumen sie selbst auf; der Seed-Baseline-Bestand wird von Tests nie verändert.

## Umgebungen & Ports (Host)

| Umgebung | APP_ENV | Frontend | API (Host→Container 3000) | Postgres |
|---|---|---|---|---|
| Integration | `int` | 8001 | 3001 | 5401 |
| Abnahme | `abnahme` | 8002 | 3002 | 5402 |
| PROD | `prod` | 8003 | 3003 | 5403 |
| Ops (Grafana) | — | 8000 | — | 5400 (ops-db) |

Frontend-nginx proxied `/api` → `backend:3000` im Compose-Netz (same-origin, kein CORS).
