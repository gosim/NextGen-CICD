import type { Abteilung } from '@nextgen/shared';
import { request } from './client';

export function listAbteilungen(): Promise<Abteilung[]> {
  return request<Abteilung[]>('/abteilungen', { method: 'GET' });
}
