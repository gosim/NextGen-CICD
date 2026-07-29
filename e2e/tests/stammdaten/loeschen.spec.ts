import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

// Testfall 5 — Löschen mit Bestätigungs-Modal. Eigener Datensatz per API angelegt.
test('Mitarbeiter löschen: Bestätigungs-Modal bestätigen, Zeile verschwindet @regression @abnahme', async ({
  page,
  testData,
}) => {
  const mitarbeiter = await testData.createMitarbeiter();

  await page.goto('/');

  const zeile = page
    .getByTestId(TESTIDS.mitarbeiterRow)
    .filter({ hasText: mitarbeiter.personalnummer });
  await expect(zeile).toBeVisible();

  await zeile.getByTestId(TESTIDS.mitarbeiterDeleteButton).click();

  // Bestätigungs-Modal erscheint und wird bestätigt.
  const bestaetigen = page.getByTestId(TESTIDS.confirmDeleteButton);
  await expect(bestaetigen).toBeVisible();
  await bestaetigen.click();

  // Zeile ist aus der Tabelle verschwunden.
  await expect(
    page.getByTestId(TESTIDS.mitarbeiterRow).filter({ hasText: mitarbeiter.personalnummer }),
  ).toHaveCount(0);
});
