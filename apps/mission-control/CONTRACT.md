# Mission Control — Schnittstellen-Vertrag (Server ⇄ Frontend ⇄ Reporter)

Verbindlich für alle drei Bausteine. Änderungen nur mit Anpassung aller Konsumenten.

## 1. SSE: `GET /stream`

- `event: state` — vollständiger Snapshot als JSON (bei Connect sofort, danach bei jeder Änderung, gedrosselt auf max. 1/s). **Das Frontend muss allein mit `state` voll funktionieren.**
- `event: test` — einzelnes Live-Test-Event (Zusatzsignal für flüssige Animation, gleiche Struktur wie `tests.cases[n]`).
- Zusätzlich REST-Fallback `GET /api/state` (identischer Snapshot, für Debugging).

### Snapshot-Schema (`state`)

```jsonc
{
  "generatedAt": "2026-07-30T10:00:00Z",
  "github": {
    "available": true,              // false = kein Token/API-Fehler → Frontend zeigt Hinweis, Rest läuft weiter
    "run": {                        // null wenn kein relevanter Run
      "id": 123, "url": "https://github.com/…", "title": "Commit-Titel",
      "workflow": "pipeline" | "stability",
      "status": "queued" | "in_progress" | "waiting" | "completed",
      "conclusion": null | "success" | "failure" | "cancelled",
      "version": "1.0.16",          // = 1.0.<run_number> (nur bei workflow=pipeline, sonst null)
      "startedAt": "ISO"
    },
    "stages": [                     // feste Reihenfolge, IMMER alle 8 Einträge (pipeline-Läufe); bei stability stattdessen 3 Check-Stages
      { "key": "ci",              "label": "CI",                "status": "…", "currentStep": null, "url": null },
      { "key": "int-deploy",      "label": "🚀 INT",            "status": "…", "currentStep": "Datenbank-Backup …", "url": "…" },
      { "key": "int-gate",        "label": "🛡 INT-Gate",       "status": "…", "currentStep": null, "url": null },
      { "key": "abnahme-approval","label": "⏸ Freigabe",        "status": "…", "currentStep": null, "url": null },
      { "key": "abnahme-deploy",  "label": "🚀 Abnahme",        "status": "…", "currentStep": null, "url": null },
      { "key": "abnahme-gate",    "label": "🛡 Abnahme-Gate",   "status": "…", "currentStep": null, "url": null },
      { "key": "prod-approval",   "label": "⏸ Freigabe",        "status": "…", "currentStep": null, "url": null },
      { "key": "prod-deploy",     "label": "🚀 PROD",           "status": "…", "currentStep": null, "url": null }
    ],
    // stage.status: "idle" | "running" | "waiting" | "success" | "failure" | "skipped" | "cancelled"
    "pendingApprovals": ["abnahme"]  // Environments, die auf Freigabe warten
  },
  "choreography": {
    "active": ["int-db", "backup-store"],   // ComponentIds, die pulsieren sollen
    "flows": ["int-backup"],                 // FlowIds, deren Punkte-Animation läuft
    "alarm": null | { "env": "int", "reason": "Rollback läuft" }  // roter Alarm-Rahmen um die Env-Box
  },
  "registry": {
    "images": [ { "version": "1.0.18", "imageTag": "sha-ebbc70c" } ]   // letzte 3 gebaute Versionen, neueste zuerst
  },
  "environments": {
    "int":     { "health": "up"|"down", "version": "1.0.15", "gitSha": "sha-…", "demoBug": "none", "instances": ["abc123","def456"] },
    "abnahme": { … }, "prod": { … }
  },
  "tests": {
    "active": false,                 // true solange eine Suite läuft
    "env": "int" | null, "suite": "int-regression" | null, "source": "gate" | "stability" | null,
    "cases": [ { "id": "…", "title": "Mitarbeiter anlegen …", "status": "running"|"passed"|"failed"|"flaky"|"skipped", "durationMs": 1234, "error": "gekürzter Fehlertext" | null } ],
    "summary": { "total": 10, "passed": 9, "failed": 0, "flaky": 1 }
  },
  "ticker": [ { "at": "ISO", "text": "INT: v1.0.16 ausgerollt" } ]   // neueste zuerst, max. 10, deutsch
}
```

## 2. ComponentIds (Architektur-Karte, v2 — bewusst vereinfachte Zuschauer-Sicht)

Global: `github-ci`, `ghcr` (Image-STAPEL, letzte 3 Versionen als Karten), `runner`, `backup-store`, `playwright`.
Je Umgebung (`int` | `abnahme` | `prod`): `<env>-frontend`, `<env>-backend`, `<env>-db`.
Die drei Env-Boxen sind als Promotionskette links→rechts angeordnet: INT → Abnahme → PROD, verbunden über Kettenpfeile mit ⏸-Freigabe-Symbol.

## 3. FlowIds (animierte Datenflüsse, v2)

`ci-build` (github-ci→ghcr-Stapel) · `<env>-pull` (ghcr-Stapel→Env-Box) · `<env>-backup` (db→backup-store) · `<env>-test` (playwright→Env-Box) · `<env>-restore` (backup-store→db, ROT) · `<env>-rollback-pull` (ghcr-Stapel-SPITZE→Env-Box; die oberste Karte glüht dabei) · `registry-push` (INT-Gate/Env→ghcr-Stapel-Spitze — „Image hat die Gates bestanden und landet oben auf dem Stapel") · `promote-int-abnahme` / `promote-abnahme-prod` (Kettenpfeile, animiert wenn die Folgestufe deployt).

## 4. Choreografie-Ableitung (Server, aus GitHub-Job-/Step-Namen)

Job-Namen kommen als `"<Stage> / <Jobname>"` (z. B. `"INT / 🚀 Deploy"`). Stage-Präfixe: `CI`, `INT`, `Abnahme`, `PROD`, `🔍 INT|Abnahme|PROD` (Stability). Step-Name-Substrings (deutsch, exakt aus unseren Workflows) → Choreografie:

| Job/Step enthält | active | flows |
|---|---|---|
| Job `🧪` oder `📦` (running) | `github-ci` (+`ghcr` bei 📦) | `ci-build` bei 📦 |
| Step `Letzte grüne Version` / `GHCR-Login` / `State & Ops-Event` | `runner` | — |
| Step `Datenbank-Backup` | `<env>-db`, `backup-store` | `<env>-backup` |
| Step `Rolling-Deployment` / `Stack deployen` | `<env>-frontend`, `<env>-backend`, `ghcr` | `<env>-pull`; zusätzlich `promote-int-abnahme` wenn env=abnahme bzw. `promote-abnahme-prod` wenn env=prod |
| Job `🛡 Quality Gate` bzw. `🔍`-Job running (Test-Steps) | `playwright`, `<env>-frontend`, `<env>-backend`, `<env>-db` | `<env>-test` |
| Step `Promote` (im Gate-Job, nach grünen Tests) | `ghcr` | `registry-push` |
| Job `⛑ Rollback` running | `<env>-db`, `backup-store`, `ghcr` | `<env>-restore`, `<env>-rollback-pull` + `alarm={env}` |
| Run `waiting` + pending approval | — (Stage-Status `waiting` reicht; ⏸ auf dem Kettenpfeil pulsiert) | — |

## 5. Test-Ingest: `POST /events/test` (vom Playwright-Live-Reporter)

```jsonc
{ "runId": "30459…",             // GitHub-Run-ID oder lokaler Marker
  "source": "gate" | "stability" | "local",
  "project": "int-regression" | "abnahme" | "smoke" | "quarantine",
  "env": "int" | "abnahme" | "prod" | null,
  "testId": "stabil-hash",       // eindeutig je Testfall (z. B. file:line:title)
  "title": "Mitarbeiter anlegen …",
  "status": "running" | "passed" | "failed" | "flaky" | "skipped",
  "durationMs": 1234,             // nur bei Abschluss
  "error": "max. 500 Zeichen" }   // nur bei failed/flaky
```

Antwort immer `204` (auch bei Parse-Fehlern — Reporter ist fire-and-forget). Erste `running`-Meldung einer neuen `runId+project`-Kombination setzt `tests.cases` zurück und `tests.active=true`; `suite`-Ende (Reporter sendet `{status:"suite-finished"}` als Spezialwert im Feld `status`? NEIN —) Suite-Ende erkennt der Server selbst: 20 s ohne neue Events UND kein Case mehr `running` ⇒ `tests.active=false` (Cases bleiben bis zur nächsten Suite sichtbar).

## 6. Server-ENV

| Variable | Default | Zweck |
|---|---|---|
| `PORT` | `9100` | HTTP-Port |
| `GITHUB_REPOSITORY` | `gosim/NextGen-CICD` | API-Ziel |
| `GITHUB_TOKEN` | — (optional) | ohne Token: `github.available=false`, Rest läuft |
| `OPS_DB_URL` | `postgres://ops:ops@ops-db:5432/ops` | Historie/Ticker |
| `ENV_TARGETS` | `int=host.docker.internal:3001,abnahme=…:3002,prod=…:3003` | Live-Polling |

## 7. Versions-Farblogik (Frontend)

Identisch zu Grafana: Farbe = f(letzte Ziffer der Version), Palette (0–9): `#3274D9, #A352CC, #1F60C4, #C77EEA, #8F3BB8, #6ED0E0→nein — nutze: blue #3274D9, purple #A352CC, dark-blue #1F60C4, light-purple #C77EEA, semi-dark-purple #8F3BB8, light-blue #5794F2, dark-purple #7C2EA3, super-light-blue #8AB8FF, semi-dark-blue #3274D9→#2A5698, super-light-purple #DEB6F2` — verbindlich: Blau-/Violett-Töne, KEIN Rot/Orange/Gelb/Grün. Rot/Grün ausschließlich für Status (Health, Testfälle, Alarm).
