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

// ── Architektur-Karte: Komponenten & Flüsse (CONTRACT §2/§3, v2) ─────────────

/** Globale Komponenten der Architektur-Karte (CONTRACT §2, v3: `runner` entfällt). */
export type GlobalComponentId = 'github-ci' | 'ghcr' | 'backup-store' | 'playwright';

/** Komponenten je Umgebung — bewusst vereinfachte Zuschauer-Sicht (CONTRACT §2). */
export type EnvComponentId = `${EnvKey}-frontend` | `${EnvKey}-backend` | `${EnvKey}-db`;

/** Alle ComponentIds, die pulsieren können. */
export type ComponentId = GlobalComponentId | EnvComponentId;

/** Alle animierten Datenflüsse (CONTRACT §3). */
export type FlowId =
  | 'ci-build'
  | `${EnvKey}-pull`
  | `${EnvKey}-backup`
  | `${EnvKey}-test`
  | `${EnvKey}-restore`
  | `${EnvKey}-rollback-pull`
  | 'registry-push'
  | 'promote-int-abnahme'
  | 'promote-abnahme-prod';

export interface ChoreographyState {
  /** ComponentIds, die pulsieren sollen. */
  active: ComponentId[];
  /** FlowIds, deren Punkte-Animation läuft. */
  flows: FlowId[];
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

/** Ein gebautes Image im GHCR-Stapel (CONTRACT §1 „registry"). */
export interface RegistryImage {
  version: string;
  imageTag: string;
  /** true = hat mind. ein Gate bestanden (Promotion). Neueste promotete = „LATEST ✓". */
  promoted: boolean;
}

/** Der GHCR-Stapel: die letzten drei gebauten Versionen, neueste zuerst. */
export interface RegistryState {
  images: RegistryImage[];
}

/** Eine pg_dump-Datei im Dump-Stapel (CONTRACT §1 „backups"). */
export interface BackupDump {
  /** Umgebung aus dem Ordnernamen (`/backups/<env>/…`); null bei unbekanntem Ordner. */
  env: EnvKey | null;
  at: string;
  sizeBytes: number;
  /** Tag aus dem Dateinamen-Muster `<timestamp>_<tag>.dump`; null wenn nicht ableitbar. */
  tag: string | null;
}

/** Der Dump-Stapel: die letzten drei pg_dump-Dateien, neueste zuerst. */
export interface BackupsState {
  dumps: BackupDump[];
}

export interface Snapshot {
  generatedAt: string;
  github: GithubState;
  choreography: ChoreographyState;
  registry: RegistryState;
  backups: BackupsState;
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
