import { hostname } from 'node:os';
import { Router } from 'express';
import type { AppInfo } from '@nextgen/shared';
import type { Env } from '../config/env.js';

/**
 * GET /api/info — Kern der Rollback-Demo: liefert die zur Laufzeit aktive Version,
 * SHA, Umgebung, Build-Zeit und den Demo-Bug-Status.
 */
export function infoRouter(env: Env): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const info: AppInfo = {
      name: 'nextgen-stammdaten',
      version: env.APP_VERSION,
      gitSha: env.GIT_SHA,
      environment: env.APP_ENV,
      buildTime: env.BUILD_TIME,
      demoBug: env.DEMO_BUG,
      instance: hostname(),
    };
    res.status(200).json(info);
  });

  return router;
}
