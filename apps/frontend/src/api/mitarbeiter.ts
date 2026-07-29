import type {
  Mitarbeiter,
  MitarbeiterCreate,
  MitarbeiterStatus,
  MitarbeiterUpdate,
} from '@nextgen/shared';
import { request } from './client';

export interface MitarbeiterListParams {
  search?: string;
  status?: MitarbeiterStatus;
  abteilungId?: number;
}

export function listMitarbeiter(params: MitarbeiterListParams = {}): Promise<Mitarbeiter[]> {
  const query = new URLSearchParams();
  if (params.search) {
    query.set('search', params.search);
  }
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.abteilungId !== undefined) {
    query.set('abteilungId', String(params.abteilungId));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<Mitarbeiter[]>(`/mitarbeiter${suffix}`, { method: 'GET' });
}

export function getMitarbeiter(id: string): Promise<Mitarbeiter> {
  return request<Mitarbeiter>(`/mitarbeiter/${encodeURIComponent(id)}`, { method: 'GET' });
}

export function createMitarbeiter(data: MitarbeiterCreate): Promise<Mitarbeiter> {
  return request<Mitarbeiter>('/mitarbeiter', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMitarbeiter(id: string, data: MitarbeiterUpdate): Promise<Mitarbeiter> {
  return request<Mitarbeiter>(`/mitarbeiter/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMitarbeiter(id: string): Promise<void> {
  return request<void>(`/mitarbeiter/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
