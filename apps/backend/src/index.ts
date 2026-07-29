import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createDb } from './db/client.js';

/**
 * Bootstrap: ENV validieren, DB verbinden, App starten und Graceful Shutdown
 * (SIGTERM/SIGINT) einrichten.
 */
function main(): void {
  const env = getEnv();
  const { pool, db } = createDb(env.DATABASE_URL);
  const app = createApp({ db, pool, env });

  const server = app.listen(env.PORT, () => {
    console.log(
      `nextgen-stammdaten backend läuft auf Port ${env.PORT} (env=${env.APP_ENV}, version=${env.APP_VERSION}, sha=${env.GIT_SHA})`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`${signal} empfangen — fahre herunter …`);
    server.close(() => {
      pool
        .end()
        .then(() => {
          console.log('DB-Pool geschlossen. Bye.');
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error('Fehler beim Schließen des DB-Pools:', err);
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
