import { defineConfig, devices } from '@playwright/test';
import type { ReporterDescription } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8001';
const CI = !!process.env.CI;

// list + html + json immer; github-Annotation nur im CI.
const reporter: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }],
];
if (CI) {
  reporter.push(['github']);
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  // In CI decken 2 Retries Flakiness auf (Fail -> Pass = Status "flaky"), lokal 0.
  retries: CI ? 2 : 0,
  // 2 Worker teilen sich die eine real deployte DB der Umgebung.
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter,
  use: {
    baseURL: BASE_URL,
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // Stellt die Seed-Baseline her (POST /api/admin/reset), bevor schreibende
      // Projekte laufen. Nur Dateien tests/setup/*.setup.ts.
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Volles Regressions-Gate gegen Integration (8 Tests + Flaky-Demo).
      // grepInvert direkt in der Config: ein quarantänisierter Test (@quarantine
      // ZUSÄTZLICH zum bestehenden Tag) fällt damit garantiert aus dem Gate,
      // egal wie der Runner aufgerufen wird.
      name: 'int-regression',
      grep: /@regression/,
      grepInvert: /@quarantine/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Kritische Geschäftsprozesse als Abnahme-Gate (Anlegen/Bearbeiten/Löschen).
      name: 'abnahme',
      grep: /@abnahme/,
      grepInvert: /@quarantine/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Read-only Smoke gegen PROD — bewusst OHNE setup-Dependency (kein Reset auf PROD).
      name: 'smoke',
      grep: /@smoke/,
      grepInvert: /@quarantine/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Quarantäne: bekannte instabile Tests, nicht-blockierend, separates Projekt.
      name: 'quarantine',
      grep: /@quarantine/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
