import { deriveChoreography } from './choreography.js';
import { idlePipelineStages } from './stages.js';
import type {
  BackupDump,
  EnvKey,
  EnvironmentState,
  GithubJobView,
  RegistryImage,
  RunInfo,
  Snapshot,
  Stage,
  TestCase,
  TestEventInput,
  TickerItem,
} from './types.js';

// Zentraler In-Memory-Store. Hält den Snapshot (CONTRACT §1) und broadcastet
// Änderungen an Listener (SSE). State-Events werden auf max. 1/s gedrosselt;
// einzelne Test-Events gehen ungedrosselt raus (flüssige Animation).

type StateListener = (snapshot: Snapshot) => void;
type TestListener = (testCase: TestCase) => void;

const STATE_THROTTLE_MS = 1000;
/** Suite gilt als beendet: 20 s ohne neue Events UND kein Case mehr running. */
const SUITE_IDLE_MS = 20000;

export interface GithubUpdate {
  available: boolean;
  run: RunInfo | null;
  stages: Stage[];
  pendingApprovals: string[];
  jobs: GithubJobView[];
}

function emptyEnvironment(): EnvironmentState {
  return { health: 'down', version: null, gitSha: null, demoBug: null, instances: [] };
}

function initialSnapshot(): Snapshot {
  return {
    generatedAt: new Date().toISOString(),
    github: {
      available: false,
      run: null,
      stages: idlePipelineStages(),
      pendingApprovals: [],
    },
    choreography: { active: [], flows: [], alarm: null },
    registry: { images: [] },
    backups: { dumps: [] },
    environments: {
      int: emptyEnvironment(),
      abnahme: emptyEnvironment(),
      prod: emptyEnvironment(),
    },
    tests: {
      active: false,
      env: null,
      suite: null,
      source: null,
      cases: [],
      summary: { total: 0, passed: 0, failed: 0, flaky: 0 },
    },
    ticker: [],
  };
}

export class StateStore {
  private snapshot = initialSnapshot();
  private githubJobs: GithubJobView[] = [];

  private readonly stateListeners = new Set<StateListener>();
  private readonly testListeners = new Set<TestListener>();

  private lastEmit = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  private currentSuiteKey: string | null = null;
  private suiteIdleTimer: NodeJS.Timeout | null = null;

  /** Aktueller Snapshot (mit frischem Zeitstempel) — für SSE-Connect und /api/state. */
  getSnapshot(): Snapshot {
    this.snapshot.generatedAt = new Date().toISOString();
    return this.snapshot;
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onTest(listener: TestListener): () => void {
    this.testListeners.add(listener);
    return () => this.testListeners.delete(listener);
  }

  // ── GitHub ────────────────────────────────────────────────────────────────

  setGithub(update: GithubUpdate): void {
    const github = this.snapshot.github;
    github.available = update.available;
    github.run = update.run;
    github.stages = update.stages;
    github.pendingApprovals = update.pendingApprovals;
    this.githubJobs = update.jobs;
    this.recomputeChoreography();
    this.scheduleBroadcast();
  }

  /**
   * API-Fehler/Token weg: nur available=false setzen, letzten bekannten Zustand
   * (run/stages/jobs/choreography) bewusst stehen lassen.
   */
  setGithubUnavailable(): void {
    if (!this.snapshot.github.available) return;
    this.snapshot.github.available = false;
    this.scheduleBroadcast();
  }

  // ── Umgebungen & Ticker ─────────────────────────────────────────────────────

  setEnvironments(environments: Record<EnvKey, EnvironmentState>): void {
    this.snapshot.environments = environments;
    this.scheduleBroadcast();
  }

  setTicker(ticker: TickerItem[]): void {
    this.snapshot.ticker = ticker;
    this.scheduleBroadcast();
  }

  /** GHCR-Stapel setzen (vom Ops-DB-Poller): letzte 3 gebaute Versionen, neueste zuerst. */
  setRegistry(images: RegistryImage[]): void {
    this.snapshot.registry = { images };
    this.scheduleBroadcast();
  }

  /** Dump-Stapel setzen (vom Backups-Poller): letzte 3 pg_dump-Dateien, neueste zuerst. */
  setBackups(dumps: BackupDump[]): void {
    this.snapshot.backups = { dumps };
    this.scheduleBroadcast();
  }

  // ── Test-Ingest (CONTRACT §5) ────────────────────────────────────────────────

  /**
   * Verarbeitet ein einzelnes Test-Event: Suite-Reset bei neuer runId+project,
   * Upsert nach testId, Summary-Neuberechnung, ungedrosseltes Live-Event und
   * Nachziehen des Inaktivitäts-Timers.
   */
  ingestTestEvent(event: TestEventInput): void {
    const tests = this.snapshot.tests;
    const key = `${event.runId}|${event.project}`;

    // Erste running-Meldung einer neuen Kombination setzt die Suite zurück.
    if (event.status === 'running' && key !== this.currentSuiteKey) {
      this.currentSuiteKey = key;
      tests.cases = [];
      tests.active = true;
      tests.env = event.env;
      tests.suite = event.project;
      tests.source = event.source;
    } else if (this.currentSuiteKey === null) {
      // Robust gegen eine verpasste erste running-Meldung: erste Suite adoptieren.
      this.currentSuiteKey = key;
      tests.active = true;
      tests.env = event.env;
      tests.suite = event.project;
      tests.source = event.source;
    } else if (key !== this.currentSuiteKey) {
      // Event eines fremden/veralteten Laufs — ignorieren (Router antwortet dennoch 204).
      return;
    }

    const testCase: TestCase = {
      id: event.testId,
      title: event.title,
      status: event.status,
      durationMs: event.durationMs ?? null,
      error: event.error ?? null,
    };

    const index = tests.cases.findIndex((existing) => existing.id === testCase.id);
    if (index >= 0) {
      tests.cases[index] = testCase;
    } else {
      tests.cases.push(testCase);
    }

    tests.active = true;
    this.recomputeSummary();
    this.recomputeChoreography();

    this.emitTest(testCase);
    this.scheduleBroadcast();
    this.armSuiteIdleTimer();
  }

  private recomputeSummary(): void {
    const cases = this.snapshot.tests.cases;
    this.snapshot.tests.summary = {
      total: cases.length,
      passed: cases.filter((testCase) => testCase.status === 'passed').length,
      failed: cases.filter((testCase) => testCase.status === 'failed').length,
      flaky: cases.filter((testCase) => testCase.status === 'flaky').length,
    };
  }

  private armSuiteIdleTimer(): void {
    if (this.suiteIdleTimer) clearTimeout(this.suiteIdleTimer);
    this.suiteIdleTimer = setTimeout(() => {
      this.suiteIdleTimer = null;
      const tests = this.snapshot.tests;
      const anyRunning = tests.cases.some((testCase) => testCase.status === 'running');
      if (tests.active && !anyRunning) {
        tests.active = false;
        this.recomputeChoreography();
        this.scheduleBroadcast();
      }
    }, SUITE_IDLE_MS);
    this.suiteIdleTimer.unref?.();
  }

  // ── Choreografie ────────────────────────────────────────────────────────────

  private recomputeChoreography(): void {
    this.snapshot.choreography = deriveChoreography({
      jobs: this.githubJobs,
      tests: {
        active: this.snapshot.tests.active,
        env: this.snapshot.tests.env,
        source: this.snapshot.tests.source,
      },
    });
  }

  // ── Broadcast (gedrosselt, Leading + Trailing Edge) ─────────────────────────

  private scheduleBroadcast(): void {
    if (this.flushTimer) return; // Ein Trailing-Broadcast ist bereits eingeplant.
    const wait = STATE_THROTTLE_MS - (Date.now() - this.lastEmit);
    if (wait <= 0) {
      this.broadcastNow();
    } else {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.broadcastNow();
      }, wait);
      this.flushTimer.unref?.();
    }
  }

  private broadcastNow(): void {
    this.lastEmit = Date.now();
    this.snapshot.generatedAt = new Date().toISOString();
    for (const listener of this.stateListeners) {
      try {
        listener(this.snapshot);
      } catch (error) {
        console.error('State-Listener-Fehler:', error);
      }
    }
  }

  private emitTest(testCase: TestCase): void {
    for (const listener of this.testListeners) {
      try {
        listener(testCase);
      } catch (error) {
        console.error('Test-Listener-Fehler:', error);
      }
    }
  }

  /** Timer beim Herunterfahren freigeben. */
  stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.suiteIdleTimer) {
      clearTimeout(this.suiteIdleTimer);
      this.suiteIdleTimer = null;
    }
  }
}
