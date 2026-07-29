# Testkonzept

## Testpyramide

| Ebene | Werkzeug | Läuft wo / wann | Gegen was |
|---|---|---|---|
| Unit — Backend | Vitest | `_ci.yml`, jeder Push/PR, `ubuntu-latest` | Isolierte Business-Logik, Validierung |
| Unit/Component — Frontend | Vitest + React Testing Library + MSW | `_ci.yml`, jeder Push/PR | Komponenten mit gemockter API (kein echtes Backend) |
| API-Tests | Supertest gegen einen echten Postgres-Service-Container | `_ci.yml`, GitHub-Actions-Service `postgres:16-alpine` | Backend-Routen inkl. Constraint-Verhalten (z. B. Unique-Violation → 409) |
| **E2E-Gate** | Playwright im offiziellen Container (`mcr.microsoft.com/playwright`) | `_deploy.yml`, self-hosted Runner, bei **jedem** Deploy-Versuch | Die **tatsächlich deployte** Umgebung über HTTP — Frontend, nginx-Proxy, Backend, Postgres im Zusammenspiel |
| Smoke | Playwright, Project `smoke`, ausschließlich lesende Assertions | `_deploy.yml`, PROD-Gate | Laufende PROD-Umgebung, ohne sie zu verändern |

Der entscheidende Unterschied zu vielen realen Setups: E2E-Tests laufen hier nicht gegen einen isolierten CI-Preview, sondern **nach dem Deploy gegen die real laufende Umgebung** — inklusive nginx-Proxy, echtem Netzwerkpfad und der Datenbank, die auch die Nutzer später sehen. Das ist bewusst der Kern der Demo, nicht der schnelle PR-Smoke-Test: Ein Quality Gate, das nicht gegen die echte Umgebung prüft, kann Deploy-spezifische Fehler (kaputte Migration, falsche Laufzeit-Config, nginx-Fehlkonfiguration) grundsätzlich nicht finden.

## Drei Gates, drei Zwecke

| Gate | Playwright-Project | Umfang | Tags | Warum genau dieser Umfang |
|---|---|---|---|---|
| **INT** | `int-regression` | Volle Suite (8 Testfälle) | `@regression` | INT wird automatisch deployt, ohne menschliche Freigabe — hier will man das größtmögliche Sicherheitsnetz, weil hier die meisten Deployments passieren und Regressionen am billigsten zu fangen sind. |
| **Abnahme** | `abnahme` | Kritische Geschäftsprozesse: Mitarbeiter anlegen, ändern, löschen, Anzeige | `@abnahme` | Abnahme ist die fachliche Freigabestufe mit Required Reviewer. Das Gate bildet bewusst nur die Prozesse ab, die für die Geschäftsentscheidung „freigeben oder nicht" zählen — nicht jede UI-Randbedingung, die schon auf INT geprüft wurde. |
| **PROD** | `smoke` | Health + Sichtbarkeit, **rein lesend** | `@smoke` | PROD trägt echte (bzw. demo-„echte") Daten. Ein Gate, das hier schreibt, würde Produktivdaten verändern oder Testartefakte hinterlassen. Der Smoke-Test beweist ausschließlich: Die Umgebung läuft, die erwartete Version ist aktiv, die Kernseite lädt. |

Alle drei Gates laufen mit `--grep-invert @quarantine` — quarantänisierte Tests können naturgemäß keines der drei Gates blockieren (siehe unten).

## Flaky-Strategie

Das ist das Herzstück dieses Testkonzepts, weil es genau das Problem adressiert, das die Ausgangssituation prägt: dauerhaft rote Umgebungen durch flaky Tests, die entweder ignoriert oder — schlimmer — durch endloses Neu-Anstoßen „grün geprügelt" werden.

### Grundprinzip: erkennen, nicht heilen

Playwright läuft im Gate mit `retries: 2`. Ein Test, der im ersten Versuch fehlschlägt und im Retry besteht, bekommt **nicht** den Status „passed", sondern den eigenen Status **„flaky"**. Das ist eine bewusste Entscheidung: Retries sind ein Diagnose-Werkzeug, kein Reparatur-Werkzeug. Sie unterscheiden einen tatsächlich kaputten Test/Feature (schlägt auch im Retry fehl → Gate rot) von einem instabilen Test (besteht im Retry → Gate grün, aber mit Warnsignal). Ein „flaky" wird **niemals** stillschweigend zu „passed" umetikettiert.

### Flaky = gelb + laut

Ein flaky-Ergebnis darf ein Deployment nicht blockieren (sonst wäre INT wieder so rot wie in der Ausgangslage), aber es darf auch nicht spurlos verschwinden:

- Playwrights JSON-Reporter (`results.json`) wird nach dem Gate-Lauf von einem Skript ausgewertet, das eine Warnung mit der Liste der flaky Tests in den **GitHub Step Summary** schreibt — sichtbar direkt auf der Workflow-Run-Seite, ohne Artefakte öffnen zu müssen.
- Dieselbe Auswertung liefert die Kennzahlen (`total`, `passed`, `failed`, `flaky`, `skipped`), die per `ops-event.sh test_run` in die `test_runs`-Tabelle der Ops-DB geschrieben werden — Grundlage für den **Flaky-Trend** in Grafana.
- Trace (`on-first-retry`), Video und Screenshot (`on-failure`) werden für jeden fehlgeschlagenen Versuch aufgezeichnet und als Workflow-Artifact (`e2e-report-<env>-<run>-<attempt>`, 14 Tage Aufbewahrung) hochgeladen — genau die Aufnahmen, die den ersten, fehlgeschlagenen Versuch eines flaky Tests dokumentieren und im Trace-Viewer nachvollziehbar machen.

Ergebnis: Flakiness wird sichtbar gemanagt statt entweder das Gate zu blockieren (dann wäre man wieder bei „Umgebung ständig rot") oder unter den Teppich zu kehren (dann würde niemand je etwas reparieren).

### Quarantäne-Prozess

Für Tests, die wiederholt oder aus bekannter, noch ungelöster Ursache instabil sind — nicht nur „ein Retry reicht" instabil, sondern strukturell —, gibt es die Quarantäne:

1. **Tag `@quarantine`** auf dem Testfall setzen.
2. Alle drei Gates laufen mit `--grep-invert @quarantine` — der Test kann ab diesem Moment kein Deployment mehr blockieren.
3. Ein separater, **nicht-blockierender** Lauf (eigenes Playwright-Project `quarantine`) führt quarantänisierte Tests weiterhin regelmäßig aus und reported das Ergebnis — Sichtbarkeit bleibt erhalten, ohne dass die Pipeline davon abhängt.
4. Für jeden quarantänisierten Test wird ein **Issue** angelegt: Owner (wer kümmert sich), Frist (bis wann), Verweis auf den Testfall.
5. **Definition of Done** für die Rückkehr aus der Quarantäne: Ursache identifiziert und behoben, Test läuft über mehrere aufeinanderfolgende Läufe stabil (kein weiteres „flaky"), `@quarantine`-Tag entfernt, Issue geschlossen.

Quarantäne ist damit ein befristeter, dokumentierter Zustand — kein Ort, an dem Tests für immer verschwinden.

### Anti-Flake-Hygiene

Um die Zahl der Kandidaten für „flaky" von vornherein klein zu halten, gelten für alle Testfälle feste Regeln:

- **Web-first Assertions** (`expect(locator).toBeVisible()` u. Ä.) statt manueller Wartezeiten — Playwright pollt und retried die Assertion selbst, bis Timeout.
- **Keine `sleep`/`waitForTimeout`** — jede feste Wartezeit ist entweder zu kurz (flaky) oder zu lang (langsam) und verschleiert das eigentliche Warteziel.
- **Eindeutige, ephemere Testdaten** statt geteilter State zwischen Testfällen — notwendig, weil das Gate mit `workers: 2` parallel gegen dieselbe deployte Datenbank läuft.
- **Ausschließlich `data-testid`-Selektoren**, nie sichtbarer Text oder CSS-Klassen (Playwright-Config `testIdAttribute: 'data-testid'`) — Text und Styling ändern sich, das `data-testid`-Vertrag in `docs/contracts/testids.md` ist stabil und verbindlich zwischen Frontend und E2E-Package.

## Testdaten-Strategie

Zwei getrennte, nie vermischte Datenbestände:

- **Seed-Baseline** (`P-1001`–`P-1005`, siehe `docs/contracts/api.md`): deterministisch, idempotent per Upsert über `personalnummer` eingespielt (Migrations-/Seed-Schritt bzw. `POST /api/admin/reset` auf INT/Abnahme). Dieser Bestand ist für Testfälle **unveränderlich** — Tests lesen ihn (z. B. „Liste + Seed sichtbar"), verändern ihn aber nie. Das macht die Baseline zu einem stabilen Fixpunkt, gegen den beliebig oft und beliebig parallel getestet werden kann, ohne dass sich Tests gegenseitig die Grundlage entziehen.
- **Ephemere Testdaten**: Jeder Testfall, der Daten anlegt, verwendet eindeutige Personalnummern im Namensraum `P-9…` sowie E-Mail-Adressen `e2e-…@example.de`, eindeutig gemacht über Lauf- und Worker-ID (`{runId}-{worker}-{n}`). Eine Cleanup-Fixture räumt diese Datensätze über den `apiClient` nach dem Test wieder auf — unabhängig davon, ob der Test bestanden hat oder fehlgeschlagen ist. Dadurch bleibt die Umgebung nach jedem Lauf im Ausgangszustand und ist beliebig oft wiederholbar, ohne dass sich Datenreste ansammeln oder künftige Läufe (z. B. Duplikat-Prüfungen) verfälschen.

`ENABLE_TEST_RESET` ist nur auf INT und Abnahme `true` — `POST /api/admin/reset` ist auf PROD grundsätzlich mit 403 gesperrt (`FORBIDDEN`), passend zum rein lesenden PROD-Smoke-Gate.

## Definition: „Die Umgebung ist grün"

Eine Umgebung gilt in diesem Konzept genau dann als grün, wenn drei Bedingungen gleichzeitig erfüllt sind:

1. **Alle Healthchecks sind grün.** `docker compose up --wait` wartet auf den erfolgreichen Abschluss des `migrate`-One-Shot-Service und auf gesunde Backend-/Frontend-Container — ein Deploy, der hier nicht durchläuft, wird nicht einmal als „deployed" gewertet.
2. **Die laufende Version hat ihr Gate bestanden.** Der `promote`-Job schreibt `last_green` ausschließlich nach einem erfolgreichen Gate-Lauf fort — es gibt keinen Codepfad, der `current` ohne bestandenes Gate zu `last_green` macht.
3. **Die Rollback-Garantie steht.** Sollte eine zukünftige Version das Gate nicht bestehen, garantiert der automatische Rollback-Mechanismus (App-Redeploy auf `last_green` **und** DB-Restore aus dem Pre-Deploy-Backup), dass die Umgebung binnen Minuten wieder auf dem zuletzt bewiesenen guten Stand ist — App und Daten konsistent zueinander.

Diese dritte Bedingung ist der eigentliche Unterschied zur Ausgangssituation: Nicht „die Umgebung ist gerade grün", sondern „die Umgebung kann strukturell gar nicht dauerhaft rot werden", weil jeder Fehlschlag automatisch in einen bewiesenen guten Zustand zurückführt.
