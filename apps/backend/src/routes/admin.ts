import { Router } from 'express';
import type { Database } from '../db/client.js';
import type { Env } from '../config/env.js';
import { mitarbeiter } from '../db/schema.js';
import { ForbiddenError } from '../errors.js';
import { seedAbteilungen, seedMitarbeiterBaseline } from '../seed/seed.js';

/**
 * POST /api/admin/reset — nur wenn ENABLE_TEST_RESET=true. Löscht alle Mitarbeiter
 * und spielt die Baseline idempotent neu ein (für E2E-Tests). Sonst 403 FORBIDDEN.
 */
export function adminRouter(db: Database, env: Env): Router {
  const router = Router();

  router.post('/reset', async (_req, res, next) => {
    try {
      if (!env.ENABLE_TEST_RESET) {
        throw new ForbiddenError('Test-Reset ist in dieser Umgebung deaktiviert');
      }
      await db.delete(mitarbeiter);
      await seedAbteilungen(db);
      await seedMitarbeiterBaseline(db);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
