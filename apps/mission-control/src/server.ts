import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { actionsRouter } from './actions.js';
import type { Config } from './config.js';
import { ingestRouter } from './ingest.js';
import { sseRouter } from './sse.js';
import type { StateStore } from './state.js';

// Express-App-Factory. Bewusst ohne listen() (Bootstrap in index.ts), damit sie
// auch in Tests direkt verwendet werden kann.

export interface ServerDeps {
  state: StateStore;
  config: Config;
  /** Absoluter Pfad zum Static-Verzeichnis; Default: <Paketwurzel>/public. */
  publicDir?: string;
}

/** Löst <Paketwurzel>/public relativ zur kompilierten dist/server.js auf. */
function defaultPublicDir(): string {
  return fileURLToPath(new URL('../public', import.meta.url));
}

export function createServer({ state, config, publicDir }: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Live-Kanäle zuerst (kein Body-Parsing nötig / eigenes im Ingest-Router).
  app.use('/stream', sseRouter(state));
  app.use('/events/test', ingestRouter(state));

  // Demo-Steuerung (workflow_dispatch + Freigaben) — nur mit Token wirksam.
  app.use('/actions', actionsRouter(config, state));

  app.get('/api/state', (_req, res) => {
    res.status(200).json(state.getSnapshot());
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Statisches Frontend (public wird vom Frontend-Agenten befüllt).
  app.use(express.static(publicDir ?? defaultPublicDir()));

  return app;
}
