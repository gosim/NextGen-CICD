import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

// Testfall 1 — read-only, läuft auch als PROD-Smoke (Projekt 'smoke', ohne Reset).
test('App lädt: Umgebungs- und Versions-Badge sichtbar, Tabelle oder Empty-State @smoke @regression', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId(TESTIDS.envBadge)).toBeVisible();
  await expect(page.getByTestId(TESTIDS.versionBadge)).toBeVisible();

  // Entweder die Tabelle oder der Empty-State ist sichtbar (nie beides fehlend).
  const tabelleOderLeer = page
    .getByTestId(TESTIDS.mitarbeiterTable)
    .or(page.getByTestId(TESTIDS.mitarbeiterEmptyState));
  await expect(tabelleOderLeer.first()).toBeVisible();
});
