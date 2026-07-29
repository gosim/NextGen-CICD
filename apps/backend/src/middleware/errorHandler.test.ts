import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { ApiErrorBody } from '@nextgen/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors.js';
import { errorHandler } from './errorHandler.js';

/** Minimaler Response-Mock, der Status und JSON-Body festhält. */
function createMockResponse(): Response & {
  statusCode: number;
  body: ApiErrorBody | undefined;
} {
  const res = {
    statusCode: 0,
    body: undefined as ApiErrorBody | undefined,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: ApiErrorBody) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: ApiErrorBody | undefined };
}

const req = {} as Request;
const next: NextFunction = vi.fn();

describe('errorHandler', () => {
  it('mappt ZodError auf 400 VALIDATION_ERROR mit details', () => {
    const schema = z.object({ email: z.string().email('Ungültige E-Mail-Adresse') });
    const result = schema.safeParse({ email: 'keine-email' });
    expect(result.success).toBe(false);
    const res = createMockResponse();

    errorHandler(result.success ? null : result.error, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error.code).toBe('VALIDATION_ERROR');
    expect(res.body?.error.details).toEqual([
      { field: 'email', message: 'Ungültige E-Mail-Adresse' },
    ]);
  });

  it('mappt NotFoundError auf 404 NOT_FOUND', () => {
    const res = createMockResponse();
    errorHandler(new NotFoundError('Mitarbeiter nicht gefunden'), req, res, next);
    expect(res.statusCode).toBe(404);
    expect(res.body?.error.code).toBe('NOT_FOUND');
    expect(res.body?.error.message).toBe('Mitarbeiter nicht gefunden');
  });

  it('mappt ConflictError auf 409 CONFLICT', () => {
    const res = createMockResponse();
    errorHandler(new ConflictError(), req, res, next);
    expect(res.statusCode).toBe(409);
    expect(res.body?.error.code).toBe('CONFLICT');
  });

  it('mappt ForbiddenError auf 403 FORBIDDEN', () => {
    const res = createMockResponse();
    errorHandler(new ForbiddenError(), req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error.code).toBe('FORBIDDEN');
  });

  it('mappt pg 23505 (email-Constraint) auf 409 CONFLICT mit Feld email', () => {
    const res = createMockResponse();
    const pgError = { code: '23505', constraint: 'mitarbeiter_email_unique' };
    errorHandler(pgError, req, res, next);
    expect(res.statusCode).toBe(409);
    expect(res.body?.error.code).toBe('CONFLICT');
    expect(res.body?.error.details).toEqual([
      { field: 'email', message: 'email ist bereits vergeben' },
    ]);
  });

  it('mappt pg 23505 (personalnummer-Constraint) auf 409 CONFLICT mit Feld personalnummer', () => {
    const res = createMockResponse();
    const pgError = { code: '23505', constraint: 'mitarbeiter_personalnummer_unique' };
    errorHandler(pgError, req, res, next);
    expect(res.statusCode).toBe(409);
    expect(res.body?.error.details?.[0]?.field).toBe('personalnummer');
  });

  it('mappt unbekannte Fehler auf 500 INTERNAL ohne Message-Leak', () => {
    const res = createMockResponse();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('geheime interne Details'), req, res, next);
    expect(res.statusCode).toBe(500);
    expect(res.body?.error.code).toBe('INTERNAL');
    expect(res.body?.error.message).toBe('Interner Serverfehler');
    expect(res.body?.error.message).not.toContain('geheime');
    spy.mockRestore();
  });

  it('tut nichts, wenn Header bereits gesendet wurden', () => {
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = true;
    errorHandler(new Error('zu spät'), req, res, next);
    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();
  });
});
