/**
 * Schlanker fetch-basierter API-Client gegen `BASE_URL` + `/api`.
 *
 * Wird von den Fixtures für Testdaten-Setup/Teardown und vom Seed-Setup-Projekt
 * genutzt. Bewusst ohne Abhängigkeit auf @nextgen/shared — nur die für die Tests
 * benötigten Felder sind hier lokal typisiert (siehe API-Vertrag docs/contracts/api.md).
 */

export type MitarbeiterStatus = 'aktiv' | 'inaktiv';

export interface MitarbeiterCreateInput {
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number;
  eintrittsdatum: string;
  status?: MitarbeiterStatus;
}

export interface Mitarbeiter {
  id: string;
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number;
  abteilungName?: string;
  eintrittsdatum: string;
  status: MitarbeiterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListMitarbeiterParams {
  search?: string;
  status?: MitarbeiterStatus;
  abteilungId?: number;
}

/** Fehler eines API-Aufrufs — trägt den HTTP-Status für gezielte Behandlung (z.B. 403). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, context: string) {
    super(`${context} fehlgeschlagen (HTTP ${status}): ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  private readonly apiBase: string;

  constructor(baseURL: string) {
    this.apiBase = `${baseURL.replace(/\/$/, '')}/api`;
  }

  async createMitarbeiter(input: MitarbeiterCreateInput): Promise<Mitarbeiter> {
    const response = await fetch(`${this.apiBase}/mitarbeiter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ApiError(response.status, await safeText(response), 'createMitarbeiter');
    }
    return (await response.json()) as Mitarbeiter;
  }

  async listMitarbeiter(params: ListMitarbeiterParams = {}): Promise<Mitarbeiter[]> {
    const url = new URL(`${this.apiBase}/mitarbeiter`);
    if (params.search) {
      url.searchParams.set('search', params.search);
    }
    if (params.status) {
      url.searchParams.set('status', params.status);
    }
    if (params.abteilungId !== undefined) {
      url.searchParams.set('abteilungId', String(params.abteilungId));
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError(response.status, await safeText(response), 'listMitarbeiter');
    }
    return (await response.json()) as Mitarbeiter[];
  }

  async deleteMitarbeiter(id: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/mitarbeiter/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new ApiError(response.status, await safeText(response), 'deleteMitarbeiter');
    }
  }

  /** Löscht alle Datensätze mit exakt dieser Personalnummer (für UI-Cleanup). */
  async deleteByPersonalnummer(personalnummer: string): Promise<void> {
    const treffer = await this.listMitarbeiter({ search: personalnummer });
    for (const mitarbeiter of treffer) {
      if (mitarbeiter.personalnummer === personalnummer) {
        await this.deleteMitarbeiter(mitarbeiter.id);
      }
    }
  }

  /** POST /api/admin/reset — stellt die Seed-Baseline her (nur bei ENABLE_TEST_RESET=true). */
  async reset(): Promise<void> {
    const response = await fetch(`${this.apiBase}/admin/reset`, { method: 'POST' });
    if (!response.ok) {
      throw new ApiError(response.status, await safeText(response), 'admin/reset');
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<kein Body>';
  }
}
