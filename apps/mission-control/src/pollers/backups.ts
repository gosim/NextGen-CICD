import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../config.js';
import type { StateStore } from '../state.js';
import type { BackupsState, BackupSummary, EnvKey } from '../types.js';

// Backups-Poller (alle 10 s). Liest den read-only Host-Mount `BACKUPS_DIR` mit je
// einem Unterordner pro Umgebung (`/backups/<env>/*.dump`) und stellt je Umgebung
// den NEUESTEN Dump plus Gesamtanzahl bereit (Backup-Bank unter den Env-Boxen).
// Verzeichnis fehlt/Lesefehler ⇒ null je Umgebung, kein Crash (fail-safe).

const POLL_INTERVAL_MS = 10000;
const DUMP_SUFFIX = '.dump';

const ENV_KEYS: readonly EnvKey[] = ['int', 'abnahme', 'prod'];

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
      this.state.setBackups({ int: null, abnahme: null, prod: null });
    } finally {
      this.running = false;
    }
  }
}

/**
 * Durchsucht `<baseDir>/<env>/*.dump` und liefert je Umgebung den neuesten Dump
 * plus Gesamtanzahl. Fehlt der Basisordner oder ein Unterordner, ist der Eintrag
 * null — nie geworfen.
 */
export async function scanBackups(baseDir: string): Promise<BackupsState> {
  const result: BackupsState = { int: null, abnahme: null, prod: null };

  for (const env of ENV_KEYS) {
    const dir = join(baseDir, env);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue; // Ordner fehlt/nicht lesbar → Umgebung bleibt null.
    }

    let newest: (BackupSummary & { mtimeMs: number }) | null = null;
    let count = 0;
    for (const file of files) {
      if (!file.endsWith(DUMP_SUFFIX)) continue;
      try {
        const info = await stat(join(dir, file));
        if (!info.isFile()) continue;
        count += 1;
        if (!newest || info.mtimeMs > newest.mtimeMs) {
          newest = {
            at: info.mtime.toISOString(),
            sizeBytes: info.size,
            tag: parseTag(file),
            count: 0, // wird unten gesetzt
            mtimeMs: info.mtimeMs,
          };
        }
      } catch {
        // Datei zwischen readdir und stat verschwunden → ignorieren.
      }
    }

    if (newest) {
      result[env] = { at: newest.at, sizeBytes: newest.sizeBytes, tag: newest.tag, count };
    }
  }

  return result;
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
