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
    "images": [ { "version": "1.0.18", "imageTag": "sha-ebbc70c", "promoted": true } ]
    // letzte 3 gebaute Versionen, neueste zuerst; promoted = hat mind. ein Gate bestanden.
    // Frontend: „LATEST ✓"-Band auf der NEUESTEN promoteten Karte (die zieht der Rollback),
    // „NEU" auf noch nicht promoteten; während CI läuft: gestrichelte Geister-Karte mit
    // github.run.version über Slot 0, verfestigt sich beim Erscheinen in images[0].
  },
  "backups": {
    "int":     { "at": "ISO", "sizeBytes": 8500, "tag": "sha-…", "count": 10 },
    "abnahme": null,
    "prod":    { … }
    // je Umgebung: neuester pg_dump (Host-Mount /backups, ro) + Gesamtanzahl; null = keine Dumps.
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

Global: `github-ci`, `ghcr` (Image-STAPEL, letzte 3 Versionen als Karten, oberste grün-promotete trägt das „LATEST ✓"-Band), Backup-Bank UNTER den Umgebungen: `backup-int` / `backup-abnahme` / `backup-prod` (je Umgebung ein Dump-Stapel exakt mittig unter seiner Env-Box; pulsiert bei Backup/Restore der Umgebung), `playwright`. (v3: `runner` entfällt — Verwaltungsdetail ohne Zuschauer-Mehrwert.)
Je Umgebung (`int` | `abnahme` | `prod`): `<env>-frontend`, `<env>-backend`, `<env>-db`.
Die drei Env-Boxen sind als Promotionskette links→rechts angeordnet: INT → Abnahme → PROD, verbunden über Kettenpfeile mit ⏸-Freigabe-Symbol.

## 3. FlowIds (animierte Datenflüsse, v2)

`ci-build` (github-ci→Geister-Karte auf der ghcr-Stapel-Spitze) · `<env>-pull` (ghcr-Stapel→Env-Box) · `<env>-backup` (kurzer vertikaler Fluss db→eigener Dump-Stapel darunter) · `<env>-test` (playwright→Env-Box) · `<env>-restore` (eigener Dump-Stapel→db, ROT, kurz vertikal; Karte glüht) · `<env>-rollback-pull` (ghcr-Stapel→Env-Box; dabei pulsiert die LATEST-✓-Karte — die neueste promotete Version ist das Rollback-Ziel, NICHT die Stapel-Spitze mit der fehlgeschlagenen Version. Bewusste Vereinfachung: sicher korrekt für INT-Rollbacks, den Demo-Pfad; bei Abnahme/PROD kann die fehlgeschlagene Version selbst schon INT-promotet sein) · `registry-push` (INT-Gate/Env→ghcr-Stapel-Spitze — „Image hat die Gates bestanden und landet oben auf dem Stapel") · `promote-int-abnahme` / `promote-abnahme-prod` (Kettenpfeile, animiert wenn die Folgestufe deployt).

## 4. Choreografie-Ableitung (Server, aus GitHub-Job-/Step-Namen)

Job-Namen kommen als `"<Stage> / <Jobname>"` (z. B. `"INT / 🚀 Deploy"`). Stage-Präfixe: `CI`, `INT`, `Abnahme`, `PROD`, `🔍 INT|Abnahme|PROD` (Stability), `Rollback <env>` (manueller Rollback, rollback-manual.yml — eigener Lauf mit einer einzelnen `⛑ Rollback`-Band-Stage). Step-Name-Substrings (deutsch, exakt aus unseren Workflows) → Choreografie:

| Job/Step enthält | active | flows |
|---|---|---|
| Job `🧪` oder `📦` (running) | `github-ci` (+`ghcr` bei 📦) | `ci-build` bei 📦 |
| Step `Letzte grüne Version` / `GHCR-Login` / `State & Ops-Event` | — (bewusst effektfrei, Verwaltungsrauschen) | — |
| Step `Datenbank-Backup` (running ODER Nachleuchten, s. u.) | `<env>-db`, `backup-<env>` | `<env>-backup` |
| Step `Rolling-Deployment` / `Stack deployen` | `<env>-frontend`, `<env>-backend`, `ghcr` | `<env>-pull`; zusätzlich `promote-int-abnahme` wenn env=abnahme bzw. `promote-abnahme-prod` wenn env=prod |
| Job `🛡 Quality Gate` bzw. `🔍`-Job running (Test-Steps) | `playwright`, `<env>-frontend`, `<env>-backend`, `<env>-db` | `<env>-test` |
| Step `Promote` (im Gate-Job, nach grünen Tests) | `ghcr` | `registry-push` |
| Job `⛑ Rollback` / `Rollback <env>` (running ODER Nachleuchten) | `<env>-db`, `backup-<env>`, `ghcr` | `<env>-restore`, `<env>-rollback-pull`; `alarm={env}` NUR solange der Job läuft |
| Run `waiting` + pending approval | — (Stage-Status `waiting` reicht; ⏸ auf dem Kettenpfeil pulsiert) | — |

**Nachleucht-Fenster (`AFTERGLOW_MS` = 15 s):** Backup-Step und Rollback-Jobs erzeugen ihre Effekte auch noch, wenn sie vor ≤ 15 s ERFOLGREICH endeten (`completed_at`, conclusion=success — skipped zählt nicht). Grund: Ein pg_dump von 2–3 s läge sonst komplett zwischen zwei 5-s-Polls und würde nie sichtbar; so sind Backup/Restore garantiert ≥ 10 s zu sehen (15 s Fenster − 5 s Poll-Slack; typisch 15–20 s inkl. Broadcast-Drossel). Der Alarm-Banner nimmt am Nachleuchten NICHT teil („Rollback läuft" wäre nach Abschluss falsch). Alle übrigen Effekte bleiben strikt an laufende Jobs/Steps gebunden. Annahme: NTP-synchrone Host-Uhr (Vergleich GitHub-Serverzeit ↔ lokale Uhr).

**Sequenz-Regeln (kausale Erzählung, keine Parallel-Effekte):**
1. **Erst sichern, dann ausrollen:** Solange die Backup-Erzählung einer Umgebung sichtbar ist (Step läuft oder Nachleuchten), wird der Deploy-Pull DERSELBEN Umgebung unterdrückt (`<env>-pull`, frontend/backend/ghcr, Promote-Kettenpfeil). Real ist die Reihenfolge ohnehin sequenziell (pg_dump → Rolling); ohne die Regel überlappte das Backup-Nachleuchten mit dem laufenden Deploy-Step. Pro Umgebung — Backup INT unterdrückt nicht den Abnahme-Pull.
2. **Rollback-Phasen (`RESTORE_PHASE_MS` = 15 s):** Die Jobs-API zeigt den Rollback als EINEN Step, real läuft erst restore.sh, dann deploy.sh. Erzähl-Konvention: erste 15 s ab Job-Start NUR Restore (`<env>-restore`, db + Dump-Stapel), danach NUR Rollback-Pull (`<env>-rollback-pull`, ghcr); das Nachleuchten nach Job-Ende zeigt die Pull-Phase. Ohne brauchbares `started_at` defensiv beide.

**Registry-Hervorhebung beim Rollback (Frontend):** Die fehlgeschlagene Version (`run.version` des Pipeline-Laufs; beim manuellen Rollback null → entfällt) wird ROT umrahmt, das Rollback-Ziel — die LATEST-✓-Karte — pulsiert GRÜN.

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
