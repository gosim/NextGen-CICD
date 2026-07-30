import type { EnvKey } from './types.js';

// Server-Konfiguration aus der Umgebung (CONTRACT §6). Defaults sind so gewählt,
// dass der Server ohne jede ENV startet (Container-Netz). Fail-fast nur bei echtem
// Unsinn (unbrauchbarer Port, keine einzige gültige Env-Zielangabe).

export interface EnvTarget {
  env: EnvKey;
  /** host:port des Backends dieser Umgebung, z. B. "host.docker.internal:3001". */
  host: string;
}

export interface Config {
  port: number;
  githubRepository: string;
  /** null = kein Token → github.available bleibt false, Rest läuft weiter. */
  githubToken: string | null;
  opsDbUrl: string;
  envTargets: EnvTarget[];
  /** Host-Mount mit den pg_dump-Dateien (read-only), Unterordner je Umgebung. */
  backupsDir: string;
}

const DEFAULT_ENV_TARGETS =
  'int=host.docker.internal:3001,abnahme=host.docker.internal:3002,prod=host.docker.internal:3003';

const ENV_KEYS: readonly EnvKey[] = ['int', 'abnahme', 'prod'];

function isEnvKey(value: string): value is EnvKey {
  return (ENV_KEYS as readonly string[]).includes(value);
}

/** Bricht mit Exit-Code 1 und klarer deutscher Meldung ab. */
function fail(message: string): never {
  console.error(`Ungültige Mission-Control-Konfiguration: ${message}`);
  process.exit(1);
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 9100;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`PORT="${raw}" ist keine gültige Portnummer.`);
  }
  return port;
}

/**
 * Parst ENV_TARGETS ("int=host:port,abnahme=host:port,…"). Unbrauchbare Segmente
 * werden mit Warnung übersprungen; bleibt am Ende keine gültige Angabe übrig, ist
 * das Unsinn → fail-fast.
 */
function parseEnvTargets(raw: string | undefined): EnvTarget[] {
  const source = raw && raw.trim() !== '' ? raw : DEFAULT_ENV_TARGETS;
  const targets: EnvTarget[] = [];
  const seen = new Set<EnvKey>();

  for (const segment of source.split(',')) {
    const trimmed = segment.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      console.warn(`ENV_TARGETS: Segment "${trimmed}" ohne "env=host:port" ignoriert.`);
      continue;
    }
    const env = trimmed.slice(0, eq).trim();
    const host = trimmed.slice(eq + 1).trim();
    if (!isEnvKey(env)) {
      console.warn(`ENV_TARGETS: unbekanntes Umgebungs-Kürzel "${env}" ignoriert.`);
      continue;
    }
    if (host === '') {
      console.warn(`ENV_TARGETS: leeres Ziel für "${env}" ignoriert.`);
      continue;
    }
    if (seen.has(env)) {
      console.warn(`ENV_TARGETS: doppeltes Umgebungs-Kürzel "${env}" ignoriert.`);
      continue;
    }
    seen.add(env);
    targets.push({ env, host });
  }

  if (targets.length === 0) {
    fail(`ENV_TARGETS="${source}" enthält keine gültige Zielangabe.`);
  }
  return targets;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const token = source.GITHUB_TOKEN?.trim();
  return {
    port: parsePort(source.PORT),
    githubRepository:
      source.GITHUB_REPOSITORY && source.GITHUB_REPOSITORY.trim() !== ''
        ? source.GITHUB_REPOSITORY.trim()
        : 'gosim/NextGen-CICD',
    githubToken: token && token !== '' ? token : null,
    opsDbUrl:
      source.OPS_DB_URL && source.OPS_DB_URL.trim() !== ''
        ? source.OPS_DB_URL.trim()
        : 'postgres://ops:ops@ops-db:5432/ops',
    envTargets: parseEnvTargets(source.ENV_TARGETS),
    backupsDir:
      source.BACKUPS_DIR && source.BACKUPS_DIR.trim() !== ''
        ? source.BACKUPS_DIR.trim()
        : '/backups',
  };
}
