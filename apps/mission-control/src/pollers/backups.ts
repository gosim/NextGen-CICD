import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../config.js';
import type { StateStore } from '../state.js';
import type { BackupDump, EnvKey } from '../types.js';

// Backups-Poller (alle 10 s). Liest den read-only Host-Mount `BACKUPS_DIR` mit je
// einem Unterordner pro Umgebung (`/backups/<env>/*.dump`), sammelt alle pg_dump-
// Dateien und stellt die global neuesten drei als Dump-Stapel bereit. Verzeichnis
// fehlt/Lesefehler ⇒ leere Liste, kein Crash (fail-safe).

const POLL_INTERVAL_MS = 10000;
const DUMP_SUFFIX = '.dump';
const MAX_DUMPS = 3;

const ENV_KEYS: readonly EnvKey[] = ['int', 'abnahme', 'prod'];

function isEnvKey(value: string): value is EnvKey {
  return (ENV_KEYS as readonly string[]).includes(value);
}

export class BackupsPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: Config,
    private readonly state: StateStore,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.state.setBackups(await scanBackups(this.config.backupsDir));
    } catch (error) {
      // Sollte dank interner Absicherung nicht auftreten — zur Sicherheit leerer
      // Stapel statt Crash.
      console.warn('Backups-Poll fehlgeschlagen:', (error as Error).message);
      this.state.setBackups([]);
    } finally {
      this.running = false;
    }
  }
}

/** Interner Träger für die Sortierung nach Änderungszeit. */
interface ScannedDump extends BackupDump {
  mtimeMs: number;
}

/**
 * Durchsucht `<baseDir>/<env>/*.dump` und gibt die global neuesten drei Dumps
 * zurück (neueste zuerst). Fehlt der Basisordner oder ist er nicht lesbar, wird
 * eine leere Liste geliefert — nie geworfen.
 */
export async function scanBackups(baseDir: string): Promise<BackupDump[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return []; // Verzeichnis fehlt o. Ä. → leerer Dump-Stapel.
  }

  const found: ScannedDump[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const env: EnvKey | null = isEnvKey(entry.name) ? entry.name : null;
    const dir = join(baseDir, entry.name);

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue; // Unterordner nicht lesbar → überspringen.
    }

    for (const file of files) {
      if (!file.endsWith(DUMP_SUFFIX)) continue;
      try {
        const info = await stat(join(dir, file));
        if (!info.isFile()) continue;
        found.push({
          env,
          at: info.mtime.toISOString(),
          sizeBytes: info.size,
          tag: parseTag(file),
          mtimeMs: info.mtimeMs,
        });
      } catch {
        // Datei zwischen readdir und stat verschwunden → ignorieren.
      }
    }
  }

  return found
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_DUMPS)
    .map(({ mtimeMs: _mtimeMs, ...dump }) => dump);
}

/**
 * Leitet den Tag aus dem Dateinamen-Muster `<timestamp>_<tag>.dump` ab: der Teil
 * nach dem letzten `_`, ohne die `.dump`-Endung. Ohne `_` gibt es keinen Tag.
 */
export function parseTag(fileName: string): string | null {
  const base = fileName.endsWith(DUMP_SUFFIX)
    ? fileName.slice(0, -DUMP_SUFFIX.length)
    : fileName;
  const underscore = base.lastIndexOf('_');
  if (underscore < 0) return null;
  const tag = base.slice(underscore + 1);
  return tag !== '' ? tag : null;
}
