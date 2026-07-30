import pg from 'pg';
import type { Config } from '../config.js';
import type { StateStore } from '../state.js';
import type { RegistryImage, TickerItem } from '../types.js';

// Ops-DB-Poller (alle 5 s). Liest die letzten 10 Deployments + Testläufe (Ticker)
// sowie die letzten 3 gebauten Versionen (GHCR-Stapel). Ticker: neueste zuerst,
// max. 10, deutsch. DB nicht erreichbar ⇒ letzter Stand friert ein, kein Crash
// (fail-safe).

const { Pool } = pg;

const POLL_INTERVAL_MS = 5000;
const MAX_TICKER = 10;

const ENV_LABELS: Record<string, string> = {
  int: 'INT',
  abnahme: 'Abnahme',
  prod: 'PROD',
};

// Bewusst `type` (nicht `interface`): nur Objekt-Typen mit impliziter Index-Signatur
// erfüllen die pg-Generic-Constraint `R extends QueryResultRow`.
type DeploymentRow = {
  time: Date | string;
  env: string;
  image_tag: string;
  status: string;
  version: string;
};

type TestRunRow = {
  time: Date | string;
  env: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  source: string;
};

type RegistryRow = {
  version: string;
  image_tag: string;
};

type PromotedRow = {
  version: string;
};

interface TickerEntry {
  at: number;
  item: TickerItem;
}

export class OpsDbPoller {
  private readonly pool: InstanceType<typeof Pool>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    config: Config,
    private readonly state: StateStore,
  ) {
    this.pool = new Pool({
      connectionString: config.opsDbUrl,
      connectionTimeoutMillis: 3000,
      max: 2,
    });
    // Idle-Client-Fehler (z. B. DB neu gestartet) dürfen den Prozess nie beenden.
    this.pool.on('error', (error) => {
      console.warn('Ops-DB-Pool-Fehler (ignoriert):', error.message);
    });
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      await this.pool.end();
    } catch {
      // Beim Herunterfahren nicht weiter stören.
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [deployments, testRuns, registry, promoted] = await Promise.all([
        this.pool.query<DeploymentRow>(
          'SELECT time, env, image_tag, status, version FROM deployments ORDER BY time DESC LIMIT 10',
        ),
        this.pool.query<TestRunRow>(
          'SELECT time, env, total, passed, failed, flaky, source FROM test_runs ORDER BY time DESC LIMIT 10',
        ),
        // Letzte 3 distinct Versionen (version <> ''), sortiert nach dem jeweils
        // jüngsten Deployment; image_tag stammt aus dem neuesten Eintrag der Version.
        this.pool.query<RegistryRow>(
          `SELECT version, image_tag FROM (
             SELECT DISTINCT ON (version) version, image_tag, time
             FROM deployments
             WHERE version <> ''
             ORDER BY version, time DESC
           ) latest
           ORDER BY time DESC
           LIMIT 3`,
        ),
        // Menge aller promoteten Versionen (mind. ein Gate bestanden) — je Image
        // wird promoted=true gesetzt, wenn seine Version hier vorkommt.
        this.pool.query<PromotedRow>(
          `SELECT DISTINCT version FROM deployments WHERE status = 'promoted' AND version <> ''`,
        ),
      ]);
      const promotedVersions = new Set(promoted.rows.map((row) => row.version));
      this.state.setTicker(buildTicker(deployments.rows, testRuns.rows));
      this.state.setRegistry(buildRegistry(registry.rows, promotedVersions));
    } catch (error) {
      // DB weg: letzten Ticker behalten (einfrieren), nicht überschreiben.
      console.warn('Ops-DB-Poll fehlgeschlagen (Ticker eingefroren):', (error as Error).message);
    } finally {
      this.running = false;
    }
  }
}

// ── Reine Ticker-Formatierung ────────────────────────────────────────────────

function envLabel(env: string): string {
  return ENV_LABELS[env] ?? env.toUpperCase();
}

function versionLabel(version: string, imageTag: string): string {
  const trimmed = (version ?? '').trim();
  if (trimmed !== '') return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
  return imageTag && imageTag !== '' ? imageTag : '?';
}

function toMillis(time: Date | string): number {
  return time instanceof Date ? time.getTime() : Date.parse(time);
}

function toIso(time: Date | string): string {
  return time instanceof Date ? time.toISOString() : new Date(time).toISOString();
}

function deploymentText(row: DeploymentRow): string {
  const env = envLabel(row.env);
  const version = versionLabel(row.version, row.image_tag);
  switch (row.status) {
    case 'promoted':
    case 'deployed':
      return `${env}: ${version} ausgerollt`;
    case 'rolled_back':
      return `${env}: Rollback auf ${version}`;
    case 'failed':
      return `${env}: Deployment ${version} fehlgeschlagen`;
    default:
      return `${env}: ${version} (${row.status})`;
  }
}

function testRunText(row: TestRunRow): string {
  const prefix = row.source === 'stability' ? 'Check' : 'Gate';
  let text = `${prefix} ${envLabel(row.env)}: ${row.passed}/${row.total} bestanden`;
  if (row.flaky > 0) text += `, ${row.flaky} flaky`;
  if (row.failed > 0) text += `, ${row.failed} fehlgeschlagen`;
  return text;
}

/** Formt die Registry-Zeilen in den GHCR-Stapel (neueste Version zuerst). */
export function buildRegistry(rows: RegistryRow[], promoted: Set<string>): RegistryImage[] {
  return rows.map((row) => ({
    version: row.version,
    imageTag: row.image_tag ?? '',
    promoted: promoted.has(row.version),
  }));
}

export function buildTicker(
  deployments: DeploymentRow[],
  testRuns: TestRunRow[],
): TickerItem[] {
  const entries: TickerEntry[] = [
    ...deployments.map((row) => ({
      at: toMillis(row.time),
      item: { at: toIso(row.time), text: deploymentText(row) },
    })),
    ...testRuns.map((row) => ({
      at: toMillis(row.time),
      item: { at: toIso(row.time), text: testRunText(row) },
    })),
  ];

  return entries
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_TICKER)
    .map((entry) => entry.item);
}
