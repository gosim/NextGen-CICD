import type { Config, EnvTarget } from '../config.js';
import type { StateStore } from '../state.js';
import type { EnvKey, EnvironmentState } from '../types.js';

// Umgebungs-Poller (alle 3 s). Fragt je Ziel /api/info + /api/health mit 2 s-Timeout
// ab. Nicht erreichbar ⇒ health "down" und Felder null. Über mehrere Polls gesehene
// .instance-Hostnamen der letzten 60 s werden gesammelt (macht Load-Balancing über
// mehrere Replicas sichtbar).

const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 2000;
const INSTANCE_WINDOW_MS = 60000;

interface AppInfoResponse {
  version?: unknown;
  gitSha?: unknown;
  demoBug?: unknown;
  instance?: unknown;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function downState(): EnvironmentState {
  return { health: 'down', version: null, gitSha: null, demoBug: null, instances: [] };
}

export class EnvPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Je Umgebung: zuletzt gesehene Instanz-Hostnamen mit Zeitstempel. */
  private readonly instanceWindows = new Map<EnvKey, Map<string, number>>();

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
      const environments: Record<EnvKey, EnvironmentState> = {
        int: downState(),
        abnahme: downState(),
        prod: downState(),
      };
      await Promise.all(
        this.config.envTargets.map(async (target) => {
          environments[target.env] = await this.probe(target);
        }),
      );
      this.state.setEnvironments(environments);
    } catch (error) {
      console.warn('Umgebungs-Poll fehlgeschlagen:', (error as Error).message);
    } finally {
      this.running = false;
    }
  }

  private async probe(target: EnvTarget): Promise<EnvironmentState> {
    const base = `http://${target.host}`;
    const [info, healthOk] = await Promise.all([
      this.fetchInfo(`${base}/api/info`),
      this.fetchHealthOk(`${base}/api/health`),
    ]);

    const instances = this.trackInstances(target.env, stringOrNull(info?.instance));
    const reachable = healthOk || info !== null;

    if (!reachable) {
      return { ...downState(), instances };
    }
    return {
      health: 'up',
      version: stringOrNull(info?.version),
      gitSha: stringOrNull(info?.gitSha),
      demoBug: stringOrNull(info?.demoBug),
      instances,
    };
  }

  /** Aktualisiert das 60-s-Fenster der Instanz-Hostnamen und gibt die aktuellen zurück. */
  private trackInstances(env: EnvKey, instance: string | null): string[] {
    let window = this.instanceWindows.get(env);
    if (!window) {
      window = new Map<string, number>();
      this.instanceWindows.set(env, window);
    }
    const now = Date.now();
    if (instance) window.set(instance, now);
    for (const [host, seen] of window) {
      if (now - seen > INSTANCE_WINDOW_MS) window.delete(host);
    }
    return [...window.keys()].sort();
  }

  private async fetchInfo(url: string): Promise<AppInfoResponse | null> {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) return null;
      return (await response.json()) as AppInfoResponse;
    } catch {
      return null;
    }
  }

  private async fetchHealthOk(url: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}
