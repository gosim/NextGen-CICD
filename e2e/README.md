# @nextgen/e2e — Playwright End-to-End-Tests

Eigenständiges Playwright-Package. Es testet eine **real deployte Umgebung** über
ihre HTTP-URL — das ist die Kern-Demo-Botschaft (das Gate prüft den echten Stand,
nicht einen PR-Mock). Das Package importiert bewusst **nicht** aus `@nextgen/shared`,
damit das Test-Image ohne Workspace-Abhängigkeiten baubar bleibt; die `data-testid`s
liegen als Kopie in `src/testids.ts` (Vertrag: `docs/contracts/testids.md`).

## Ausführen gegen eine Umgebung

Die Ziel-URL kommt aus `BASE_URL` (Default `http://localhost:8001` = Integration).

```bash
# lokal (Node nur im Container – siehe Dockerfile; hier nur zur Illustration)
BASE_URL=http://localhost:8001 pnpm --filter @nextgen/e2e test --project=int-regression

# im Container (so läuft das Gate in der Pipeline), Build-Kontext = Repo-Root:
docker build -f e2e/Dockerfile -t nextgen-e2e .
docker run --rm \
  -e BASE_URL=http://host.docker.internal:8001 \
  nextgen-e2e --project=int-regression
```

Auf macOS erreichen Container die Host-Ports über `host.docker.internal` (kein
`--network host`). Die Umgebungs-Ports sind: INT 8001 / Abnahme 8002 / PROD 8003.

## Projekte (Playwright `--project`)

| Projekt | Grep | Setup? | Zweck |
|---|---|---|---|
| `setup` | — (nur `*.setup.ts`) | — | `POST /api/admin/reset`, stellt die Seed-Baseline her |
| `int-regression` | `@regression` | ja | Volles Gate für Integration (8 Tests + Flaky-Demo) |
| `abnahme` | `@abnahme` | ja | Kritische Geschäftsprozesse (Anlegen/Bearbeiten/Löschen) |
| `smoke` | `@smoke` | **nein** | Read-only Smoke gegen PROD (kein Reset!) |
| `quarantine` | `@quarantine` | — | Bekannte instabile Tests, nicht-blockierend |

`setup` läuft als Dependency der schreibenden Projekte automatisch vorweg. `smoke`
hat bewusst **keine** setup-Dependency, weil gegen PROD kein Reset erlaubt ist.

## Tags

| Tag | Bedeutung |
|---|---|
| `@smoke` | Read-only, PROD-tauglich |
| `@regression` | Teil des Integrations-Gates |
| `@abnahme` | Teil des Abnahme-Gates (kritische Prozesse) |
| `@flaky-demo` | Deterministische Flaky-Demo, nur mit `DEMO_FLAKY=true` |
| `@quarantine` | Aus dem Gate ausgeschlossen (separates Projekt) |

Das Script `test:gate` (`playwright test --grep-invert @quarantine`) schließt
Quarantäne-Tests zusätzlich explizit aus.

## Fixture-Prinzip (Testisolation)

Jeder Test ist unabhängig und beliebig wiederholbar gegen dieselbe Umgebung:

- **`apiClient`** — fetch-basierter Client gegen `BASE_URL` + `/api`.
- **`testData`** — erzeugt eindeutige Schlüssel (`P-9…` / `e2e-…@example.de`, siehe
  `docs/contracts/api.md`) und räumt im Teardown automatisch auf:
  - `createMitarbeiter()` legt per API an (schnell, UI-unabhängig) → Teardown löscht per ID.
  - `trackPersonalnummer()` registriert einen über die UI angelegten Datensatz →
    Teardown sucht ihn per API und löscht ihn.

  Eindeutigkeit: `RUN_ID`/`Date.now()`-Suffix × `workerIndex` × prozessweiter Zähler.
  Die Seed-Baseline (`P-1001…P-1005`) wird von Tests nie verändert.

## Report & Flaky-Handling

- Reporter: `list` + `html` + `json` (immer), `github` zusätzlich im CI.
- `pnpm --filter @nextgen/e2e report-summary` parst `test-results/results.json` und
  schreibt eine Markdown-Tabelle nach `$GITHUB_STEP_SUMMARY`. **Flaky-Tests werden
  prominent geflaggt** (bestanden erst im Retry → Ursache analysieren, Trace im
  Artifact). Setzt außerdem `GITHUB_OUTPUT` (`flaky`, `failed`, `passed`, `total`).
  Exit-Code immer 0 — der Gate-Status kommt vom Playwright-Exit.

## Flaky- & Quarantäne-Prozess

- Flaky = fürs Gate bestanden, aber laut geflaggt (siehe oben). Kein Ignorieren.
- Quarantäne: instabile Tests bekommen `@quarantine`, verlassen das Gate und laufen
  nur noch im `quarantine`-Projekt weiter (nicht-blockierend). Owner/Frist/Issue
  regelt der Prozess in `docs/testkonzept.md`.
