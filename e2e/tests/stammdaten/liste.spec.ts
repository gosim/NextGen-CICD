import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

// Testfall 2 — Seed-Baseline sichtbar.
test('Baseline sichtbar: Seed-Mitarbeiter P-1001 Mustermann in der Tabelle @regression', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId(TESTIDS.mitarbeiterTable)).toBeVisible();

  const zeile = page.getByTestId(TESTIDS.mitarbeiterRow).filter({ hasText: 'P-1001' });
  await expect(zeile).toBeVisible();
  await expect(zeile).toContainText('Mustermann');
});

// Testfall 8 — serverseitige Suche filtert die Tabelle, Zurücksetzen zeigt wieder mehr.
test('Suche: nach Mustermann filtert, Zurücksetzen zeigt mehr Zeilen @regression', async ({
  page,
}) => {
  await page.goto('/');

  const zeilen = page.getByTestId(TESTIDS.mitarbeiterRow);
  await expect(page.getByTestId(TESTIDS.mitarbeiterTable)).toBeVisible();
  // Ausgangslage: der Seed-Datensatz Musterfrau (P-1002) ist vorhanden.
  await expect(zeilen.filter({ hasText: 'Musterfrau' })).toHaveCount(1);

  // Suche nach 'Mustermann' -> nur der passende Seed-Datensatz bleibt (ilike, serverseitig).
  await page.getByTestId(TESTIDS.mitarbeiterSearchInput).fill('Mustermann');
  await expect(zeilen).toHaveCount(1);
  await expect(zeilen.first()).toContainText('Mustermann');

  // Filter zurücksetzen -> Musterfrau ist wieder da (also mehr Treffer als nur Mustermann).
  await page.getByTestId(TESTIDS.mitarbeiterSearchInput).fill('');
  await expect(zeilen.filter({ hasText: 'Musterfrau' })).toHaveCount(1);
});
