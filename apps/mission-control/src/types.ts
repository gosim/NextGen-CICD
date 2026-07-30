// Zentrale Typen für den Mission-Control-Server. Der Snapshot ist der verbindliche
// Vertrag gegenüber Frontend und Reporter (siehe CONTRACT.md §1).

export type EnvKey = 'int' | 'abnahme' | 'prod';

export type StageStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'success'
  | 'failure'
  | 'skipped'
  | 'cancelled';

export type Health = 'up' | 'down';

export type WorkflowKind = 'pipeline' | 'stability';

export interface RunInfo {
  id: number;
  url: string;
  title: string;
  workflow: WorkflowKind;
  status: 'queued' | 'in_progress' | 'waiting' | 'completed';
  conclusion: string | null;
  /** = 1.0.<run_number> (nur bei workflow=pipeline, sonst null). */
  version: string | null;
  startedAt: string;
}

export interface Stage {
  key: string;
  label: string;
  status: StageStatus;
  currentStep: string | null;
  url: string | null;
}

export interface GithubState {
  /** false = kein Token oder API-Fehler → Frontend zeigt Hinweis, Rest läuft weiter. */
  available: boolean;
  run: RunInfo | null;
  stages: Stage[];
  /** Environments (GitHub-Namen), die auf manuelle Freigabe warten. */
  pendingApprovals: string[];
}

export interface Alarm {
  env: string;
  reason: string;
}

export interface ChoreographyState {
  /** ComponentIds, die pulsieren sollen. */
  active: string[];
  /** FlowIds, deren Punkte-Animation läuft. */
  flows: string[];
  alarm: Alarm | null;
}

export interface EnvironmentState {
  health: Health;
  version: string | null;
  gitSha: string | null;
  demoBug: string | null;
  instances: string[];
}

export type TestStatus = 'running' | 'passed' | 'failed' | 'flaky' | 'skipped';

export interface TestCase {
  id: string;
  title: string;
  status: TestStatus;
  durationMs: number | null;
  error: string | null;
}

export type TestSource = 'gate' | 'stability' | 'local';

export interface TestsSummary {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
}

export interface TestsState {
  active: boolean;
  env: EnvKey | null;
  suite: string | null;
  source: TestSource | null;
  cases: TestCase[];
  summary: TestsSummary;
}

export interface TickerItem {
  at: string;
  text: string;
}

export interface Snapshot {
  generatedAt: string;
  github: GithubState;
  choreography: ChoreographyState;
  environments: Record<EnvKey, EnvironmentState>;
  tests: TestsState;
  ticker: TickerItem[];
}

// ── Rohdaten für die Choreografie-Ableitung (aus der GitHub-Jobs-API) ────────

export interface GithubStepView {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface GithubJobView {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
  steps: GithubStepView[];
}

/** Eingangssignal des Test-Ingest an die Choreografie (CONTRACT §5). */
export interface TestEventInput {
  runId: string;
  source: TestSource;
  project: string;
  env: EnvKey | null;
  testId: string;
  title: string;
  status: TestStatus;
  durationMs?: number;
  error?: string;
}
