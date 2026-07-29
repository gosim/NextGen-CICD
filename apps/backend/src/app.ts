import express, { type Express } from 'express';
import type { Database, DbPool } from './db/client.js';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { abteilungRouter } from './modules/abteilung/routes.js';
import { mitarbeiterRouter } from './modules/mitarbeiter/routes.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';
import { infoRouter } from './routes/info.js';

export interface AppDeps {
  db: Database;
  pool: DbPool;
  env: Env;
}

/**
 * Baut die Express-App aus injizierten Abhängigkeiten — bewusst ohne listen(),
 * damit sie in Supertest-Tests direkt verwendet werden kann.
 */
export function createApp({ db, pool, env }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', healthRouter(pool));
  app.use('/api/info', infoRouter(env));
  app.use('/api/abteilungen', abteilungRouter(db));
  app.use('/api/mitarbeiter', mitarbeiterRouter(db, env));
  app.use('/api/admin', adminRouter(db, env));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
