import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validiert req.body gegen ein Zod-Schema aus @nextgen/shared und ersetzt den
 * Body durch die geparsten (getrimmten/defaultierten) Daten. Bei Fehlern wird ein
 * ZodError geworfen, den die zentrale Error-Middleware in 400 VALIDATION_ERROR
 * übersetzt.
 */
export function validate<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req.body) as z.infer<T>;
    req.body = parsed;
    next();
  };
}
