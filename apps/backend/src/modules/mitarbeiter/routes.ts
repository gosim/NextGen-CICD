import { Router } from 'express';
import {
  mitarbeiterCreateSchema,
  mitarbeiterUpdateSchema,
  type ApiErrorBody,
  type MitarbeiterCreate,
  type MitarbeiterStatus,
  type MitarbeiterUpdate,
} from '@nextgen/shared';
import type { Database } from '../../db/client.js';
import type { Env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import {
  createMitarbeiter,
  deleteMitarbeiter,
  getMitarbeiterOrThrow,
  listMitarbeiter,
  updateMitarbeiter,
  type MitarbeiterFilter,
} from './service.js';

function parseFilter(query: Record<string, unknown>): MitarbeiterFilter {
  const filter: MitarbeiterFilter = {};

  const search = query.search;
  if (typeof search === 'string' && search.trim().length > 0) {
    filter.search = search.trim();
  }

  const status = query.status;
  if (status === 'aktiv' || status === 'inaktiv') {
    filter.status = status as MitarbeiterStatus;
  }

  const abteilungId = query.abteilungId;
  if (typeof abteilungId === 'string' && abteilungId.trim().length > 0) {
    const parsed = Number.parseInt(abteilungId, 10);
    if (Number.isInteger(parsed)) {
      filter.abteilungId = parsed;
    }
  }

  return filter;
}

/**
 * CRUD-Routen für /api/mitarbeiter. DEMO_BUG=broken-create lässt POST vor jeder
 * Verarbeitung mit 500 INTERNAL fehlschlagen (Rollback-Demo).
 */
export function mitarbeiterRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = await listMitarbeiter(db, parseFilter(req.query as Record<string, unknown>));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    (req, res, next) => {
      if (env.DEMO_BUG === 'broken-create') {
        console.warn('⚠ DEMO_BUG active: broken-create');
        const body: ApiErrorBody = {
          error: { code: 'INTERNAL', message: 'Interner Serverfehler' },
        };
        res.status(500).json(body);
        return;
      }
      next();
    },
    validate(mitarbeiterCreateSchema),
    async (req, res, next) => {
      try {
        const created = await createMitarbeiter(db, req.body as MitarbeiterCreate);
        res.status(201).json(created);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const found = await getMitarbeiterOrThrow(db, id);
      res.status(200).json(found);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', validate(mitarbeiterUpdateSchema), async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const updated = await updateMitarbeiter(db, id, req.body as MitarbeiterUpdate);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id as string;
      await deleteMitarbeiter(db, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
