import { test as setup } from '@playwright/test';
import { ApiClient, ApiError } from '../../src/api-client';

const DEFAULT_BASE_URL = 'http://localhost:8001';

/**
 * Stellt vor den schreibenden Projekten (int-regression, abnahme) die
 * Seed-Baseline her: POST /api/admin/reset löscht alle Mitarbeiter und spielt
 * den deterministischen Seed neu ein (idempotent).
 *
 * Bewusst OHNE Tag — läuft nur im 'setup'-Projekt (testMatch *.setup.ts) bzw. als
 * Dependency, nie im Regressions-/Abnahme-Grep.
 */
setup('Seed-Baseline herstellen', async ({ baseURL }) => {
  const api = new ApiClient(baseURL ?? DEFAULT_BASE_URL);

  try {
    await api.reset();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new Error(
        'Seed-Reset abgelehnt (403 FORBIDDEN). Die Ziel-Umgebung muss mit ' +
          'ENABLE_TEST_RESET=true laufen (nur INT/Abnahme). Gegen PROD dürfen ' +
          'keine schreibenden Projekte ausgeführt werden.',
      );
    }
    throw new Error(
      `Seed-Reset fehlgeschlagen. Läuft die Umgebung unter ${baseURL ?? DEFAULT_BASE_URL} ` +
        `und ist POST /api/admin/reset erreichbar? Ursprungsfehler: ${(error as Error).message}`,
    );
  }
});
