# HOWTO: Die Demo vorführen

Schritt-für-Schritt-Anleitung für die Live-Präsentation. Jedes Kommando und jeder Ablauf wurde gegen das reale System verifiziert. Dauer der Kern-Demo: ca. 25–35 Minuten. Ausführliches Drehbuch mit Sprechtexten: [docs/demo-runbook.md](docs/demo-runbook.md).

---

## 1. Checkliste am Vortag

```bash
# Docker Desktop läuft?
docker info --format 'OK {{.ServerVersion}}'

# Self-hosted Runner online? (muss "online" zeigen)
gh api repos/gosim/NextGen-CICD/actions/runners \
  --jq '.runners[] | .name + " → " + .status'

# Alle vier Stacks hochfahren (falls nicht schon laufend)
IMAGE_TAG=$(deploy/scripts/state.sh get int last_green) deploy/scripts/deploy.sh int
IMAGE_TAG=$(deploy/scripts/state.sh get abnahme last_green) deploy/scripts/deploy.sh abnahme
IMAGE_TAG=$(deploy/scripts/state.sh get prod last_green) deploy/scripts/deploy.sh prod
docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml up -d

# Gesundheitscheck aller Umgebungen
for p in 3001 3002 3003; do curl -fsS "http://localhost:$p/api/info" \
  | jq -r '"Port \($ENV.p // "?"): OK"' --arg p "$p"; done
curl -fsS http://localhost:8000/api/health | jq -r .database
```

**Generalprobe:** Einmal Akt 2 (kaputter Commit) komplett durchspielen — danach ist die Umgebung automatisch wieder grün, es bleibt nichts zurück.

## 2. Bildschirm-Setup vor Beginn

| Tab/Fenster | URL | Zweck |
|---|---|---|
| **Beamer-Anker: Grafana** | `http://localhost:8000` | Dashboard „NextGen CICD — Environments" — läuft durchgehend mit |
| GitHub Actions | `https://github.com/gosim/NextGen-CICD/actions` | Pipeline-Läufe live |
| GitHub Environments | `https://github.com/gosim/NextGen-CICD/deployments` | „Welche Version läuft wo" aus GitHub-Sicht |
| App INT | `http://localhost:8001` | Umgebungs-Badge blau „INT" |
| App Abnahme | `http://localhost:8002` | Badge orange „ABNAHME" |
| App PROD | `http://localhost:8003` | Badge grün „PROD" |
| Terminal | Repo-Verzeichnis | für den Demo-Commit in Akt 1 |

## 3. Die vier Akte

### Akt 1 — Der Normalzustand: eine Änderung fließt durch alle Gates (~10 min)

1. Kleine sichtbare Änderung machen (z. B. in `apps/frontend/src/components/AppShell.tsx` den Titel anpassen), dann:
   ```bash
   git add -A && git commit -m "Demo: Titel angepasst" && git push
   ```
2. **Actions-Tab:** Der Run startet — erklären: Lint/Tests/Image-Build auf GitHub-Runnern („build once"), dann `deploy-int` **automatisch** auf dem self-hosted Runner.
3. Wenn das INT-Gate läuft: erklären, dass hier echte Playwright-Tests **gegen die real deployte Umgebung** laufen — nicht gegen einen Mock. Danach im Job „Quality Gate" die **Step Summary** mit der Testtabelle zeigen.
4. INT grün → der Run **pausiert** vor Abnahme. → **Environments-Tab**: `abnahme` wartet auf Review. Freigeben (Review deployments → abnahme → Approve). Gleiches Spiel später für PROD (dort läuft nur ein read-only Smoke-Test).
5. **Zeigen:** App-Tabs — die neue Version (Badge mit neuer SHA) ist jetzt überall; Grafana-Historie hat drei neue Deploy-Events.

**Kernbotschaft:** Promotion ist strukturell unmöglich ohne grünes Gate — und was auf PROD geht, ist byte-identisch das, was die Gates überlebt hat.

### Akt 2 — Der kaputte Commit: Gate rot, automatischer Rollback (~8 min) — das Herzstück

1. **Actions → Pipeline → Run workflow** → Haken bei **`demo_break_deploy`** → Run workflow. Erklären: Das simuliert einen Bug — `POST /api/mitarbeiter` liefert 500 (im UI: `DEMO-BUG AKTIV`-Badge auf INT nach dem Deploy).
2. Live verfolgen: Deploy auf INT läuft durch (die App startet ja — der Bug zeigt sich erst funktional!), dann wird das **Gate rot** (Test „Mitarbeiter anlegen" schlägt fehl).
3. **Der Moment:** Der Job **„⛑ Automatischer Rollback"** springt an — er stellt die Datenbank aus dem Pre-Deploy-Backup wieder her und deployt die letzte grüne Version.
4. **Beweis führen:**
   - App INT (`:8001`) neu laden → altes Badge, kein Demo-Bug-Badge, Anlegen funktioniert
   - Workflow-Run ist **rot** (das Signal!), die **Umgebung ist grün** — genau andersherum als im Ist-Zustand vieler Projekte
   - Grafana: Rollback-Event rot in der Historie
   - Aus dem fehlgeschlagenen Gate-Job das **Artifact** herunterladen → `npx playwright show-trace <trace.zip>` → Trace-Viewer: Zeitreise durch den fehlgeschlagenen Test (DOM, Netzwerk, Screenshots) — der Wow-Moment
5. Erwähnen: Die Kette wurde gestoppt — Abnahme und PROD haben die kaputte Version **nie gesehen**.

### Akt 3 — Der flaky Test: sichtbar machen statt ignorieren (~5 min)

1. **Actions → Pipeline → Run workflow** → Haken bei **`demo_flaky`**.
2. Im INT-Gate: Ein Test schlägt in Versuch 1 fehl, besteht im Retry → Playwright-Status **„flaky"** (gelb). Das Gate bleibt grün, das Deployment läuft weiter.
3. **Zeigen:** Step Summary mit dem Warnblock „⚠️ 1 flaky Test(s) — bestanden erst im Retry" und dem Testnamen; in Grafana steigt der Flaky-Zähler.

**Kernbotschaft:** Retries kaufen Zeit, sie heilen nichts. Flakiness wird gelb und laut — nicht rot und ignoriert, nicht grün und versteckt.

### Akt 4 — Quarantäne & manueller Rollback (~5 min)

1. **Quarantäne erklären:** Ein dauerhaft flaky Test bekommt das Tag `@quarantine` → er ist per `grepInvert` **strukturell** aus allen Gates ausgeschlossen (Config zeigen: `e2e/playwright.config.ts`), läuft aber im separaten, nicht-blockierenden Quarantäne-Projekt weiter. Prozess: Issue + Owner + Frist (docs/testkonzept.md).
2. **Manueller Rollback:** Actions → **„Manueller Rollback"** → Run workflow → Umgebung `int`, optional `restore_db` → zeigen, wie die Umgebung auf die letzte grüne Version zurückgeht. Botschaft: Der Notfallhebel ist derselbe geübte, automatisierte Pfad — kein Handstand um 3 Uhr nachts.

## 4. Abschluss-Folie (Kernbotschaften)

1. **Eine Umgebung ist immer grün** — weil eine Version, die das Gate nicht besteht, dort niemals stehen bleibt. Rot ist der Workflow-Run (das Signal), nie die Umgebung.
2. **Build once, deploy many** — ein unveränderliches Image durch alle Umgebungen; Konfiguration zur Laufzeit.
3. **Gates sind Struktur, nicht Konvention** — Promotion ohne grünes Gate ist technisch unmöglich (`needs`-Kette), nicht verboten.
4. **Rollback heißt auch Daten** — pg_dump vor jedem Deployment, pg_restore beim Rollback. Migrationsschäden inklusive.
5. **Flakiness managen statt ertragen** — erkennen (Retry ⇒ gelb), laut machen (Summary/Dashboard), isolieren (Quarantäne mit Frist), beheben.

## 5. Troubleshooting während der Demo

| Symptom | Sofortmaßnahme |
|---|---|
| Runner offline | `cd ~/actions-runner && ./svc.sh start` |
| Umgebung antwortet nicht | `IMAGE_TAG=$(deploy/scripts/state.sh get int last_green) deploy/scripts/deploy.sh int` |
| Grafana-Panels leer | Ops-Stack neu starten: `docker compose -p nextgen-ops -f deploy/compose/docker-compose.ops.yml restart` |
| Run hängt im Approval | Environments-Tab → Review deployments → Approve |
| Alles kaputt, 2 min bis Auftritt | Alle App-Stacks laufen unabhängig von GitHub weiter — Demo mit lokalen Tabs + Grafana beginnen, Pipeline später zeigen |
