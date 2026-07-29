import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@nextgen/shared';

/**
 * Fängt alle nicht gematchten Routen ab und liefert das einheitliche 404-Format.
 */
export function notFound(_req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: 'Route nicht gefunden',
    },
  };
  res.status(404).json(body);
}
