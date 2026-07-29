import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

// Testfall 4 — Bearbeiten. Eigener Datensatz wird per API angelegt (schnell, isoliert),
// dann über die UI der Nachname geändert.
test('Mitarbeiter bearbeiten: Nachname ändern, Änderung in der Tabelle sichtbar @regression @abnahme', async ({
  page,
  testData,
}) => {
  const mitarbeiter = await testData.createMitarbeiter({ nachname: 'Original' });

  await page.goto('/');

  const zeile = page
    .getByTestId(TESTIDS.mitarbeiterRow)
    .filter({ hasText: mitarbeiter.personalnummer });
  await expect(zeile).toBeVisible();

  await zeile.getByTestId(TESTIDS.mitarbeiterEditButton).click();

  const form = page.getByTestId(TESTIDS.mitarbeiterForm);
  await expect(form).toBeVisible();

  const neuerNachname = 'Geaendert';
  await page.getByTestId(TESTIDS.fieldNachname).fill(neuerNachname);
  await page.getByTestId(TESTIDS.mitarbeiterFormSubmit).click();

  await expect(form).toBeHidden();

  const aktualisierteZeile = page
    .getByTestId(TESTIDS.mitarbeiterRow)
    .filter({ hasText: mitarbeiter.personalnummer });
  await expect(aktualisierteZeile).toContainText(neuerNachname);
});
