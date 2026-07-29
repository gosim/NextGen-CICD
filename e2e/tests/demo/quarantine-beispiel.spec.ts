import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

/**
 * Quarantäne-Beispiel: simuliert einen echten, zufällig fehlschlagenden Legacy-Test.
 *
 * Trägt AUSSCHLIESSLICH das Tag @quarantine und läuft daher nur im 'quarantine'-Projekt.
 * Das Quality-Gate schließt ihn strukturell aus:
 *   - int-regression/abnahme greppen @regression/@abnahme — dieses Tag fehlt hier
 *   - das Script test:gate ergänzt zusätzlich --grep-invert @quarantine
 * Der Quarantäne-Prozess (Owner, Frist, Tracking-Issue) ist in docs/testkonzept.md
 * beschrieben. Fehlerwahrscheinlichkeit über FLAKY_FAIL_RATE steuerbar (Default 0.5).
 */
test('Quarantäne-Beispiel: instabiler Legacy-Test @quarantine', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId(TESTIDS.envBadge)).toBeVisible();

  const failRate = Number(process.env.FLAKY_FAIL_RATE ?? '0.5');
  // Schlägt fehl, wenn Math.random() < failRate — sonst besteht der Test.
  expect(Math.random(), 'Zufälliger Fehlschlag (simulierter Legacy-Flake)').toBeGreaterThanOrEqual(
    failRate,
  );
});
