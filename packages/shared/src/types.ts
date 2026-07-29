import type { z } from 'zod';
import type {
  mitarbeiterCreateSchema,
  mitarbeiterStatusSchema,
  mitarbeiterUpdateSchema,
} from './schemas.js';

export type MitarbeiterStatus = z.infer<typeof mitarbeiterStatusSchema>;
export type MitarbeiterCreate = z.infer<typeof mitarbeiterCreateSchema>;
export type MitarbeiterUpdate = z.infer<typeof mitarbeiterUpdateSchema>;

export interface Mitarbeiter {
  id: string;
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number;
  /** Im Listen-Endpunkt mitgeliefert (Join), sonst optional. */
  abteilungName?: string;
  eintrittsdatum: string;
  status: MitarbeiterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Abteilung {
  id: number;
  name: string;
  kostenstelle: string;
}

export type AppEnvironment = 'local' | 'int' | 'abnahme' | 'prod';
export type DemoBug = 'none' | 'broken-create';

/** Antwort von GET /api/info — Kern der Rollback-Demo. */
export interface AppInfo {
  name: string;
  version: string;
  gitSha: string;
  environment: AppEnvironment;
  buildTime: string;
  demoBug: DemoBug;
}

export interface FieldError {
  field: string;
  message: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL';

/** Einheitliches Fehlerformat aller API-Endpunkte. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: FieldError[];
  };
}
