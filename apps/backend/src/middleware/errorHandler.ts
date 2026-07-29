import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody, FieldError } from '@nextgen/shared';
import { AppError } from '../errors.js';

/** Postgres-Fehler haben code/constraint/detail — schmales Typ-Interface dafür. */
interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/** Ordnet benannte Unique-Constraints (siehe drizzle/0000_init.sql) einem Feld zu. */
const CONSTRAINT_FIELD_MAP: Record<string, string> = {
  mitarbeiter_personalnummer_unique: 'personalnummer',
  mitarbeiter_email_unique: 'email',
};

function mapZodError(err: ZodError): { body: ApiErrorBody; status: number } {
  const details: FieldError[] = err.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return {
    status: 400,
    body: { error: { code: 'VALIDATION_ERROR', message: 'Validierung fehlgeschlagen', details } },
  };
}

function mapUniqueViolation(err: PgError): { body: ApiErrorBody; status: number } {
  const field = err.constraint ? CONSTRAINT_FIELD_MAP[err.constraint] : undefined;
  const details: FieldError[] = field
    ? [{ field, message: `${field} ist bereits vergeben` }]
    : [];
  const message = field
    ? `Der Wert für ${field} ist bereits vergeben`
    : 'Datensatz existiert bereits';
  return { status: 409, body: { error: { code: 'CONFLICT', message, details } } };
}

/**
 * Zentrale Error-Middleware. Übersetzt bekannte Fehler in das einheitliche Format.
 * Unerwartete Fehler werden geloggt und als 500 INTERNAL ohne Detail-Leak beantwortet.
 * Die vier Parameter sind für Express zwingend, damit es die Middleware als
 * Error-Handler erkennt.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    const { status, body } = mapZodError(err);
    res.status(status).json(body);
    return;
  }

  if (err instanceof AppError) {
    const errorBody: ApiErrorBody['error'] = { code: err.code, message: err.message };
    if (err.details) {
      errorBody.details = err.details;
    }
    res.status(err.status).json({ error: errorBody });
    return;
  }

  if (isPgError(err) && err.code === '23505') {
    const { status, body } = mapUniqueViolation(err);
    res.status(status).json(body);
    return;
  }

  console.error('Unerwarteter Fehler:', err);
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL', message: 'Interner Serverfehler' },
  };
  res.status(500).json(body);
}
