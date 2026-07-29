# Demo-Runbook

Drehbuch für die Live-Präsentation vor Enterprise-Teilnehmern. Vier Akte, ca. 25–35 Minuten. Jeder Akt hat konkrete Klick-/Kommando-Anweisungen und einen Kasten „Was die Teilnehmer sehen" — nutze ihn als Sprechzettel, wann du auf welchen Bildschirm zeigst.

## Voraussetzungs-Checkliste (vor Beginn der Präsentation)

- [ ] **Docker Desktop läuft** (Icon in der Menüleiste, kein Fehlerzustand)
- [ ] **Self-hosted Runner ist online**: GitHub → Repo → Settings → Actions → Runners → `nextgen-mac` zeigt „Idle" (grün). Alternativ lokal prüfen: `launchctl list | grep actions.runner`
- [ ] **Alle vier Stacks laufen**: `docker ps` zeigt Container aus `nextgen-int`, `nextgen-abnahme`, `nextgen-prod`, `nextgen-ops` — je 4 bzw. 2 Container gesund (`healthy`)
- [ ] **Grafana auf dem Beamer**: Browser-Tab offen auf `http://localhost:8000`, Dashboard „NextGen CICD — Environments" angepinnt (kein Login nötig, anonymer Viewer)
- [ ] **Weitere Tabs offen und griffbereit**:
  - GitHub → Actions → Workflow „Pipeline" (Run-Liste)
  - GitHub → Repo → „Environments"-Seite (zeigt live, welcher Commit wo läuft)
  - `http://localhost:8001`, `:8002`, `:8003` (die drei App-Umgebungen selbst, für Badge-Vergleiche)
- [ ] **Terminal bereit**, `cwd` im Repo-Root, `gh auth status` erfolgreich

---

## Akt 1 — Der Normalzustand

**Ziel:** Zeigen, wie die Pipeline im Erfolgsfall durchläuft — dies ist die Referenz, gegen die die späteren Akte kontrastieren.

1. Eine harmlose, sichtbare Änderung machen (z. B. ein Textbaustein im Frontend-Header) und auf `main` pushen.
2. Im Actions-Tab den neuen „Pipeline"-Run öffnen. Kurz erklären: `ci`-Job baut auf `ubuntu-latest` — Lint, Typecheck, Tests, dann Image-Build + Push nach GHCR mit dem `sha-`-Tag dieses Commits.
3. Die INT-Stufe läuft automatisch an (kein Approval für Integration). Beobachten: **🚀 Deploy** (erste Steps: Backup + last_green) → **🛡 Quality Gate** (`@regression`, 8 Testfälle; bei grün laufen am Ende die Promote-Steps).
4. Sobald `deploy-int` grün ist, wartet `deploy-abnahme` auf **Approval**. Im Run auf „Review deployments" klicken → Umgebung `abnahme` markieren → „Approve and deploy".
5. Abnahme-Gate (`@abnahme`) läuft durch → `promote`.
6. Gleiches Spiel für PROD: Approval erteilen → schlanker `🚀 Deploy` ohne eigenes Gate (die `smoke`-Suite überwacht PROD stündlich im Stabilitäts-Check).

> **Was die Teilnehmer sehen:** Die „Environments"-Seite zeigt für Integration, Abnahme und PROD denselben Commit/dieselbe Version. Auf dem Grafana-Beamer zeigen alle drei Umgebungs-Stat-Panels dieselbe `gitSha`. Im Browser auf Port 8001/8002/8003 ist die neue Textänderung überall sichtbar — bei unterschiedlich farbigem Environment-Badge (INT blau, Abnahme orange, PROD grün).

---

## Akt 2 — Der kaputte Commit (Kern-Demo)

**Ziel:** Zeigen, dass ein fehlerhaftes Deployment niemals liegen bleibt — Workflow wird rot, Umgebung bleibt grün.

1. Actions → Workflow „Pipeline" → „Run workflow" → Branch `main`.
2. Input `demo_break_deploy` auf `true` setzen, `demo_flaky` auf `false` lassen → „Run workflow".
3. **Kurz erklären, bevor der Lauf durch ist**: Es wird kein neuer, kaputter Code committet — `demo_break_deploy=true` setzt zur Laufzeit `DEMO_BUG=broken-create` auf dem Backend-Container der INT-Umgebung. Dieses Flag lässt `POST /api/mitarbeiter` mit `500 INTERNAL` fehlschlagen (sichtbar auch über `GET /api/info` → `demoBug`). Das simuliert einen Bug, der erst nach dem Deploy in der echten Umgebung auffällt — genau der Fall, den ein CI-only-Test nie findet.
4. `CI` läuft normal durch (der Bug ist ein Laufzeit-Flag, kein Build-Defekt). INT-Stufe: **🚀 Deploy** (Backup **vor** dem fehlerhaften Ausrollen!) → Stack läuft jetzt mit `DEMO_BUG=broken-create` → **🛡 Quality Gate**: der Testfall „Anlegen" schlägt fehl → **Gate rot**.
5. Der `rollback`-Job springt automatisch an: DB-Restore aus dem eben erstellten Pre-Deploy-Backup, danach Redeploy auf `last_green`.
6. **Beweis führen**: Workflow-Run zeigt ein rotes ✕ — aber `http://localhost:8001` im Browser öffnen und zeigen: Die Anwendung läuft weiter, das Versions-Badge zeigt die **alte**, funktionierende SHA, nicht die kaputte. „Anlegen" funktioniert dort wieder normal.
7. Grafana: In der Deployment-Historie erscheint der neue Eintrag **rot markiert** als `rolled_back`.
8. **Wow-Moment**: Im fehlgeschlagenen `gate`-Job das Artifact `e2e-report-int-…` herunterladen, entpacken und den Playwright-HTML-Report bzw. Trace-Viewer öffnen. Den fehlgeschlagenen „Anlegen"-Testfall zeigen: Screenshot, Video und Trace mit DOM-Snapshot zum exakten Fehlzeitpunkt.

> **Was die Teilnehmer sehen:** Zwei gegensätzliche Signale gleichzeitig — Workflow-Run rot (das Problem wurde erkannt), Browser auf Port 8001 grün und funktional (das Problem hat die Umgebung nie erreicht). Genau diese Diskrepanz ist die Kernbotschaft der gesamten Demo.

---

## Akt 3 — Der flaky Test

**Ziel:** Zeigen, wie instabile Tests sichtbar gemanagt werden, ohne die Pipeline zu blockieren oder das Problem zu verstecken.

1. Actions → „Run workflow" → `demo_flaky` auf `true`, `demo_break_deploy` auf `false` → „Run workflow".
2. Im `gate`-Job von `deploy-int` beobachten: Der `@flaky-demo`-Testfall schlägt im ersten Versuch (Attempt 0) deterministisch fehl, besteht dann im automatischen Retry (`retries: 2`).
3. Playwright markiert den Test als **„flaky"** (gelb) — nicht als „passed", nicht als „failed".
4. Der Step Summary des `gate`-Jobs zeigt eine deutliche Warnung mit dem Namen des flaky Tests.
5. Trotzdem läuft das Deployment weiter: `gate` gilt als bestanden, `promote` läuft.
6. Grafana: Im Panel „Gate-Ergebnisse & Flaky-Trend" steigt der Flaky-Wert für diesen Lauf sichtbar an.

> **Was die Teilnehmer sehen:** Ein gelbes Badge statt eines stillschweigend grünen Hakens. Die Botschaft: Flakiness wird **sichtbar gemanagt statt ignoriert oder rot liegen gelassen** — der Retry sorgt dafür, dass ein einzelner instabiler Test nicht die ganze Pipeline blockiert, aber Step Summary und Dashboard verhindern, dass das Problem in Vergessenheit gerät.

---

## Akt 4 — Quarantäne & manueller Rollback

**Ziel:** Den strukturierten Umgang mit dauerhaft instabilen Tests erklären und den Notfallhebel „manueller Rollback" vorführen.

1. **Quarantäne-Prinzip erklären** (kein Live-Trigger nötig, an Code/Doku zeigen): Ein mit `@quarantine` markierter Test wird von allen drei Gates ausgeschlossen (`--grep-invert @quarantine`) — er kann kein Deployment mehr blockieren. Ein separater, nicht-blockierender Lauf führt ihn weiterhin regelmäßig aus, damit der Fortschritt sichtbar bleibt. Für jeden quarantänisierten Test gibt es ein Issue mit Owner und Frist; die Rückkehr aus der Quarantäne ist erst erlaubt, wenn die Ursache behoben und der Test über mehrere Läufe stabil ist.
2. **Manueller Rollback vorführen**: Actions → Workflow „Manueller Rollback" → „Run workflow".
3. Inputs setzen: `environment = int`, `image_tag` leer lassen (bedeutet: letzte grüne Version), `restore_db = true` → „Run workflow".
4. Beobachten: Der Job läuft auf dem self-hosted Runner, liest `last_green` aus dem State-File, stellt die Datenbank aus dem letzten Backup wieder her und deployt die Zielversion — exakt derselbe Mechanismus wie der automatische Rollback in Akt 2, hier aber bewusst von Hand ausgelöst.
5. Step Summary zeigt die Bestätigung „Rollback int läuft wieder auf …".

> **Was die Teilnehmer sehen:** Grafanas Deployment-Historie bekommt einen weiteren `rolled_back`-Eintrag, die „Environments"-Seite aktualisiert sich. Botschaft: Rollback ist kein Sonderfall, der nur bei einem roten Gate greift — er ist ein jederzeit verfügbarer, dokumentierter Hebel für den Ernstfall.

---

## Abschluss — Kernbotschaften

> **Eine Umgebung ist immer grün, weil eine Version, die das Gate nicht besteht, dort niemals stehen bleibt.**
>
> - **Build once, deploy many**: Ein einziges, unveränderliches Image (`sha-<shortsha>`) wandert byte-identisch durch Integration, Abnahme und PROD — Umgebungsidentität ist reine Laufzeit-Konfiguration.
> - **Gates sind strukturell erzwungen, nicht Konvention**: Die `needs`-Kette macht eine Promotion ohne bestandenes Gate technisch unmöglich — kein „wir vertrauen darauf, dass niemand am Prozess vorbei deployt".
> - **Rollback ist vollständig**: App-Version **und** Datenbank werden gemeinsam auf den letzten bewiesenen guten Stand zurückgesetzt — kein inkonsistenter Zwischenzustand.
> - **Flakiness wird gemanagt, nicht toleriert und nicht versteckt**: sichtbar im Step Summary, trendbar im Dashboard, mit einem klaren Quarantäne-Prozess für alles, was mehr als einen Retry braucht.
