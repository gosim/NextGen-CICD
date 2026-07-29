import { test, expect } from '../../fixtures/fixtures';
import { TESTIDS } from '../../src/testids';

/**
 * Flaky-Demo: garantiert gelbes "flaky"-Badge bei jeder Vorführung.
 *
 * Deterministisch über testInfo.retry: der erste Versuch (Attempt 0) schlägt fehl,
 * der Retry besteht -> Playwright meldet Status "flaky". Voraussetzung: retries >= 1
 * (im CI = 2). Nur aktiv mit DEMO_FLAKY=true.
 */
test('Flaky-Demo: instabiler Test @flaky-demo @regression', async ({ page }, testInfo) => {
  test.skip(process.env.DEMO_FLAKY !== 'true', 'nur mit DEMO_FLAKY=true');

  await page.goto('/');
  await expect(page.getByTestId(TESTIDS.envBadge)).toBeVisible();

  if (testInfo.retry === 0) {
    expect(false, 'Simulierter Flaky-Fehlschlag (Attempt 0)').toBe(true);
  }

  // Im Retry: normale Smoke-Assertion -> besteht.
  await expect(page.getByTestId(TESTIDS.versionBadge)).toBeVisible();
});
