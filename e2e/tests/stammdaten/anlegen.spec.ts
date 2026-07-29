import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

// Testfall 3 — Anlegen über die UI.
test('Mitarbeiter anlegen: Formular ausfüllen, Modal schließt, neue Zeile sichtbar @regression @abnahme', async ({
  page,
  testData,
}) => {
  const key = testData.uniqueKey();
  testData.trackPersonalnummer(key.personalnummer); // Auto-Cleanup im Teardown

  await page.goto('/');
  await page.getByTestId(TESTIDS.mitarbeiterCreateButton).click();

  const form = page.getByTestId(TESTIDS.mitarbeiterForm);
  await expect(form).toBeVisible();

  await page.getByTestId(TESTIDS.fieldPersonalnummer).fill(key.personalnummer);
  await page.getByTestId(TESTIDS.fieldVorname).fill('Neu');
  await page.getByTestId(TESTIDS.fieldNachname).fill('Angelegt');
  await page.getByTestId(TESTIDS.fieldEmail).fill(key.email);
  await page.getByTestId(TESTIDS.fieldAbteilung).selectOption('1');
  await page.getByTestId(TESTIDS.fieldEintrittsdatum).fill('2023-05-01');
  await page.getByTestId(TESTIDS.fieldStatus).selectOption('aktiv');

  await page.getByTestId(TESTIDS.mitarbeiterFormSubmit).click();

  // Nach Erfolg schließt das Modal und die Tabelle enthält die neue Zeile.
  await expect(form).toBeHidden();
  const zeile = page.getByTestId(TESTIDS.mitarbeiterRow).filter({ hasText: key.personalnummer });
  await expect(zeile).toBeVisible();
  await expect(zeile).toContainText('Angelegt');
});

// Testfall 6 — Validierung: leeres Formular zeigt deutsche Pflichtfeld-Fehler.
test('Validierung: leeres Formular zeigt Fehler an Pflichtfeldern, kein Netzwerk-Erfolg @regression', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId(TESTIDS.mitarbeiterCreateButton).click();

  const form = page.getByTestId(TESTIDS.mitarbeiterForm);
  await expect(form).toBeVisible();

  // Wächter: die clientseitige Validierung darf keinen POST auslösen.
  let anlageRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/mitarbeiter')) {
      anlageRequests += 1;
    }
  });

  await page.getByTestId(TESTIDS.mitarbeiterFormSubmit).click();

  // Deutsche Fehlermeldungen an den Pflichtfeldern.
  await expect(page.getByTestId(TESTIDS.fieldError('personalnummer'))).toBeVisible();
  await expect(page.getByTestId(TESTIDS.fieldError('vorname'))).toBeVisible();
  await expect(page.getByTestId(TESTIDS.fieldError('nachname'))).toBeVisible();
  await expect(page.getByTestId(TESTIDS.fieldError('email'))).toBeVisible();

  // Modal bleibt offen, es wurde kein Anlage-Request abgeschickt.
  await expect(form).toBeVisible();
  expect(anlageRequests).toBe(0);
});

// Testfall 7 — Duplikat-Personalnummer -> 409 wird dem Feld personalnummer zugeordnet.
test('Duplikat: personalnummer P-1001 erzeugt 409-Feldfehler, Modal bleibt offen @regression', async ({
  page,
  testData,
}) => {
  // Eindeutige E-Mail, damit der Konflikt eindeutig aus der Personalnummer stammt.
  const key = testData.uniqueKey();

  await page.goto('/');
  await page.getByTestId(TESTIDS.mitarbeiterCreateButton).click();

  const form = page.getByTestId(TESTIDS.mitarbeiterForm);
  await expect(form).toBeVisible();

  await page.getByTestId(TESTIDS.fieldPersonalnummer).fill('P-1001'); // existiert im Seed
  await page.getByTestId(TESTIDS.fieldVorname).fill('Doppelt');
  await page.getByTestId(TESTIDS.fieldNachname).fill('Konflikt');
  await page.getByTestId(TESTIDS.fieldEmail).fill(key.email);
  await page.getByTestId(TESTIDS.fieldAbteilung).selectOption('1');
  await page.getByTestId(TESTIDS.fieldEintrittsdatum).fill('2023-01-01');
  await page.getByTestId(TESTIDS.fieldStatus).selectOption('aktiv');

  await page.getByTestId(TESTIDS.mitarbeiterFormSubmit).click();

  // Server-409 wird am Feld personalnummer angezeigt, das Modal bleibt offen.
  await expect(page.getByTestId(TESTIDS.fieldError('personalnummer'))).toBeVisible();
  await expect(form).toBeVisible();
});
