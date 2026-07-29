import { Router } from 'express';
import type { DbPool } from '../db/client.js';

const READINESS_TIMEOUT_MS = 2000;

/** Wirft nach ms Millisekunden ab, falls der DB-Ping hängt. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Readiness-Timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * GET /api/health  — Liveness, immer 200 (Docker HEALTHCHECK).
 * GET /api/health/ready — Readiness inkl. DB-Ping (SELECT 1), 503 bei Fehler/Timeout.
 */
export function healthRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    try {
      await withTimeout(pool.query('SELECT 1'), READINESS_TIMEOUT_MS);
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  return router;
}
