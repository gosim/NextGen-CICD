import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { mitarbeiterCreateSchema } from '@nextgen/shared';
import { validate } from './validate.js';

const res = {} as Response;

describe('validate-Middleware', () => {
  it('ersetzt den Body durch geparste Daten und ruft next() ohne Fehler', () => {
    const req = {
      body: {
        personalnummer: 'P-1234',
        vorname: '  Max  ',
        nachname: 'Mustermann',
        email: 'max@example.de',
        abteilungId: 1,
        eintrittsdatum: '2020-01-15',
      },
    } as Request;
    const next = vi.fn() as unknown as NextFunction;

    validate(mitarbeiterCreateSchema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // Trim aus dem Schema greift, Default status='aktiv' wird gesetzt.
    expect(req.body.vorname).toBe('Max');
    expect(req.body.status).toBe('aktiv');
  });

  it('wirft ZodError bei ungültigem Body (→ 400 via Error-Middleware)', () => {
    const req = {
      body: {
        personalnummer: 'FALSCH',
        vorname: '',
        nachname: 'Mustermann',
        email: 'keine-email',
        abteilungId: 0,
        eintrittsdatum: '15.01.2020',
      },
    } as Request;
    const next = vi.fn() as unknown as NextFunction;

    expect(() => validate(mitarbeiterCreateSchema)(req, res, next)).toThrow(ZodError);
    expect(next).not.toHaveBeenCalled();
  });
});
