import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { EnvPoller } from './pollers/envs.js';
import { GithubPoller } from './pollers/github.js';
import { OpsDbPoller } from './pollers/opsdb.js';
import { createServer } from './server.js';
import { StateStore } from './state.js';

// Bootstrap: Konfiguration laden, Store + Poller aufsetzen, HTTP-Server starten,
// Graceful Shutdown (SIGTERM/SIGINT) einrichten.
function main(): void {
  const config = loadConfig();
  const state = new StateStore();

  const publicDir = fileURLToPath(new URL('../public', import.meta.url));
  const app = createServer({ state, config, publicDir });

  const github = new GithubPoller(config, state);
  const envs = new EnvPoller(config, state);
  const opsdb = new OpsDbPoller(config, state);
  github.start();
  envs.start();
  opsdb.start();

  const server = app.listen(config.port, () => {
    console.log(
      `Mission-Control läuft auf Port ${config.port} ` +
        `(repo=${config.githubRepository}, github=${config.githubToken ? 'mit Token' : 'ohne Token'}, ` +
        `envs=${config.envTargets.map((target) => target.env).join('/')})`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} empfangen — fahre herunter …`);
    github.stop();
    envs.stop();
    state.stop();
    server.close(() => {
      void opsdb.stop().finally(() => {
        console.log('Mission-Control beendet. Bye.');
        process.exit(0);
      });
    });
    // Not-Aus, falls offene SSE-Verbindungen server.close() blockieren.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
