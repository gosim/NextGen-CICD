# data-testid-Vertrag — Frontend ⇄ E2E

Quelle: `packages/shared/src/testids.ts` (Frontend importiert `TESTIDS`), das E2E-Package hält eine Kopie in `e2e/src/testids.ts`. Änderungen immer an allen drei Stellen (shared, e2e, dieses Dokument).

Regeln: kebab-case; jedes interaktive oder assertionsrelevante Element bekommt ein `data-testid`; Tests selektieren **nie** über sichtbaren Text oder CSS-Klassen.

| testid | Element |
|---|---|
| `env-badge` | Badge im Header mit Umgebungsname (Text: `INT` / `ABNAHME` / `PROD` / `LOCAL`, aus `/api/info.environment` uppercased) |
| `version-badge` | Badge im Header mit Version/SHA (Text enthält `gitSha` aus `/api/info`) |
| `mitarbeiter-table` | Tabelle der Mitarbeiterliste |
| `mitarbeiter-row` | Eine Tabellenzeile (mehrfach); enthält sichtbar personalnummer, vorname+nachname, email, abteilungName, status |
| `mitarbeiter-empty-state` | Platzhalter, wenn Liste leer |
| `mitarbeiter-search-input` | Suchfeld (filtert vorname/nachname/personalnummer, serverseitig) |
| `mitarbeiter-status-filter` | Statusfilter (alle/aktiv/inaktiv) |
| `mitarbeiter-create-button` | Button „Neuer Mitarbeiter" (öffnet Formular-Modal) |
| `mitarbeiter-edit-button` | Bearbeiten-Button in der Zeile |
| `mitarbeiter-delete-button` | Löschen-Button in der Zeile (öffnet Bestätigungs-Modal) |
| `mitarbeiter-form` | Formular im Modal (Anlegen + Bearbeiten) |
| `field-personalnummer`, `field-vorname`, `field-nachname`, `field-email`, `field-abteilung`, `field-eintrittsdatum`, `field-status` | Eingabefelder. `field-abteilung` und `field-status` sind Selects; `field-eintrittsdatum` ist `<input type="date">` |
| `field-error-<feld>` | Sichtbarer Validierungs-/API-Fehlertext zum Feld, z.B. `field-error-email`. Auch Server-409 wird dem Feld zugeordnet (Duplikat personalnummer/email) |
| `mitarbeiter-form-submit` | Speichern-Button im Formular |
| `mitarbeiter-form-cancel` | Abbrechen-Button im Formular |
| `confirm-delete-button` | Bestätigen im Lösch-Modal |
| `cancel-delete-button` | Abbrechen im Lösch-Modal |

Verhaltensvertrag für Tests:
- Nach erfolgreichem Anlegen/Bearbeiten schließt das Modal und die Tabelle ist aktualisiert (Tests asserten auf Tabellenzustand, nicht auf Toasts).
- Bei Server-Fehler 500 (DEMO_BUG) bleibt das Modal offen und ein sichtbarer Fehlerhinweis mit `data-testid="mitarbeiter-form-error"` erscheint.
- Suche/Filter lösen serverseitige Requests aus; Tabelle zeigt danach nur Treffer.
