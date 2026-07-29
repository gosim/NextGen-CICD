import { test as base } from '@playwright/test';
import { ApiClient } from '../src/api-client';
import type { Mitarbeiter, MitarbeiterCreateInput } from '../src/api-client';
import { makeUniqueKeyFactory } from '../src/test-data';
import type { UniqueKey } from '../src/test-data';

const DEFAULT_BASE_URL = 'http://localhost:8001';

export interface TestDataFixture {
  /** Erzeugt einen frischen eindeutigen Schlüssel (Personalnummer + E-Mail). */
  uniqueKey: () => UniqueKey;
  /**
   * Legt einen Mitarbeiter direkt über die API an (schnell, UI-unabhängig) und
   * merkt ihn zum automatischen Aufräumen im Teardown vor.
   */
  createMitarbeiter: (overrides?: Partial<MitarbeiterCreateInput>) => Promise<Mitarbeiter>;
  /**
   * Registriert eine über die UI angelegte Personalnummer, damit der Teardown sie
   * per API sucht und löscht (Tests bleiben unabhängig und wiederholbar).
   */
  trackPersonalnummer: (personalnummer: string) => void;
}

interface Fixtures {
  apiClient: ApiClient;
  testData: TestDataFixture;
}

export const test = base.extend<Fixtures>({
  apiClient: async ({ baseURL }, use) => {
    const client = new ApiClient(baseURL ?? DEFAULT_BASE_URL);
    await use(client);
  },

  testData: async ({ apiClient }, use, testInfo) => {
    const createdIds: string[] = [];
    const trackedPersonalnummern: string[] = [];
    const nextKey = makeUniqueKeyFactory(testInfo.workerIndex);

    const fixture: TestDataFixture = {
      uniqueKey: () => nextKey(),

      createMitarbeiter: async (overrides = {}) => {
        const key = nextKey();
        const mitarbeiter = await apiClient.createMitarbeiter({
          personalnummer: key.personalnummer,
          vorname: 'E2E',
          nachname: 'Testperson',
          email: key.email,
          abteilungId: 1,
          eintrittsdatum: '2023-01-01',
          status: 'aktiv',
          ...overrides,
        });
        createdIds.push(mitarbeiter.id);
        return mitarbeiter;
      },

      trackPersonalnummer: (personalnummer: string) => {
        trackedPersonalnummern.push(personalnummer);
      },
    };

    await use(fixture);

    // Teardown: best-effort. Bereits gelöschte Datensätze (z.B. durch den Lösch-Test)
    // dürfen den Teardown nicht scheitern lassen.
    for (const id of createdIds) {
      try {
        await apiClient.deleteMitarbeiter(id);
      } catch {
        // schon entfernt — ignorieren
      }
    }
    for (const personalnummer of trackedPersonalnummern) {
      try {
        await apiClient.deleteByPersonalnummer(personalnummer);
      } catch {
        // nicht auffindbar/schon entfernt — ignorieren
      }
    }
  },
});

export { expect } from '@playwright/test';
