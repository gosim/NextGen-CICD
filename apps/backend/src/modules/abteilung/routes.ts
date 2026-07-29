import { Router } from 'express';
import type { Database } from '../../db/client.js';
import { listAbteilungen } from './service.js';

/**
 * GET /api/abteilungen — read-only Liste, sortiert nach Name.
 */
export function abteilungRouter(db: Database): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const abteilungen = await listAbteilungen(db);
      res.status(200).json(abteilungen);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
