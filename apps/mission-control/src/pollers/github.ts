import type { Config } from '../config.js';
import { parseJobName } from '../choreography.js';
import { PIPELINE_STAGE_META, STABILITY_STAGE_META } from '../stages.js';
import type { StateStore } from '../state.js';
import type {
  EnvKey,
  GithubJobView,
  RunInfo,
  Stage,
  StageStatus,
  WorkflowKind,
} from '../types.js';

// GitHub-Actions-Poller (alle 5 s, nur mit Token). Ermittelt den relevanten Lauf
// (pipeline.yml ODER stability-check.yml), dessen Jobs/Steps und wartende Freigaben
// und leitet daraus die Stages (CONTRACT §1) ab. Bei jedem API-Fehler bleibt der
// letzte bekannte Zustand erhalten und github.available wird false.

const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;
const API_BASE = 'https://api.github.com';
const PIPELINE_PATH = 'pipeline.yml';
const STABILITY_PATH = 'stability-check.yml';

interface ApiRun {
  id: number;
  name: string;
  display_title?: string;
  html_url: string;
  path: string;
  run_number: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  run_started_at?: string;
  head_commit?: { message?: string } | null;
}

interface ApiStep {
  name: string;
  status: string;
  conclusion: string | null;
}

interface ApiJob {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  steps?: ApiStep[];
}

export class GithubPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: Config,
    private readonly state: StateStore,
  ) {}

  start(): void {
    if (!this.config.githubToken) {
      console.log('GitHub-Poller inaktiv: kein GITHUB_TOKEN gesetzt (github.available=false).');
      return;
    }
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
      await this.poll();
    } catch (error) {
      // API-Fehler: letzten bekannten Zustand behalten, nur Verfügbarkeit senken.
      console.warn('GitHub-Poll fehlgeschlagen:', (error as Error).message);
      this.state.setGithubUnavailable();
    } finally {
      this.running = false;
    }
  }

  private async poll(): Promise<void> {
    const runs = await this.fetchJson<{ workflow_runs: ApiRun[] }>(
      `/repos/${this.config.githubRepository}/actions/runs?per_page=10`,
    );
    const relevant = (runs.workflow_runs ?? []).filter((run) => isRelevantPath(run.path));

    if (relevant.length === 0) {
      // Kein passender Lauf — verfügbar, aber nichts aktiv.
      this.state.setGithub({
        available: true,
        run: null,
        stages: PIPELINE_STAGE_META.map(idleStage),
        pendingApprovals: [],
        jobs: [],
      });
      return;
    }

    const chosen = chooseRun(relevant);
    const workflow = workflowKindOf(chosen.path);

    const jobsResponse = await this.fetchJson<{ jobs: ApiJob[] }>(
      `/repos/${this.config.githubRepository}/actions/runs/${chosen.id}/jobs?per_page=100`,
    );
    const jobs: GithubJobView[] = (jobsResponse.jobs ?? []).map(toJobView);

    let pendingApprovals: string[] = [];
    if (chosen.status !== 'completed') {
      pendingApprovals = await this.fetchPendingApprovals(chosen.id);
    }

    const run = toRunInfo(chosen, workflow);
    const stages =
      workflow === 'stability'
        ? buildStabilityStages(jobs)
        : buildPipelineStages(jobs, pendingApprovals);

    this.state.setGithub({ available: true, run, stages, pendingApprovals, jobs });
  }

  private async fetchPendingApprovals(runId: number): Promise<string[]> {
    try {
      const pending = await this.fetchJson<Array<{ environment?: { name?: string } }>>(
        `/repos/${this.config.githubRepository}/actions/runs/${runId}/pending_deployments`,
      );
      return pending
        .map((entry) => entry.environment?.name)
        .filter((name): name is string => typeof name === 'string' && name !== '');
    } catch {
      // Freigaben sind Zusatzinfo — Fehler hier darf den Rest nicht kippen.
      return [];
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'nextgen-mission-control',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} bei ${path}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── Reine Hilfsfunktionen (rund um die GitHub-Antworten) ─────────────────────

function isRelevantPath(path: string): boolean {
  return path.endsWith(PIPELINE_PATH) || path.endsWith(STABILITY_PATH);
}

function workflowKindOf(path: string): WorkflowKind {
  return path.endsWith(STABILITY_PATH) ? 'stability' : 'pipeline';
}

/** Aktiver Lauf (in_progress/waiting/queued) bevorzugt, sonst neuester abgeschlossener. */
function chooseRun(runs: ApiRun[]): ApiRun {
  const byNewest = [...runs].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const active = byNewest.find((run) => run.status !== 'completed');
  return active ?? byNewest[0]!;
}

function toJobView(job: ApiJob): GithubJobView {
  return {
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    url: job.html_url,
    steps: (job.steps ?? []).map((step) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
    })),
  };
}

function toRunInfo(run: ApiRun, workflow: WorkflowKind): RunInfo {
  const commitTitle = run.head_commit?.message?.split('\n')[0];
  return {
    id: run.id,
    url: run.html_url,
    title: run.display_title || commitTitle || run.name,
    workflow,
    status: mapRunStatus(run.status),
    conclusion: run.conclusion,
    version: workflow === 'pipeline' ? `1.0.${run.run_number}` : null,
    startedAt: run.run_started_at || run.created_at,
  };
}

function mapRunStatus(status: string): RunInfo['status'] {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'waiting':
      return 'waiting';
    default:
      // queued | requested | pending | action_required → als "queued" darstellen.
      return 'queued';
  }
}

function idleStage(meta: { key: string; label: string }): Stage {
  return { key: meta.key, label: meta.label, status: 'idle', currentStep: null, url: null };
}

function jobToStageStatus(job: GithubJobView): StageStatus {
  switch (job.status) {
    case 'completed':
      switch (job.conclusion) {
        case 'success':
          return 'success';
        case 'failure':
        case 'timed_out':
        case 'startup_failure':
          return 'failure';
        case 'cancelled':
          return 'cancelled';
        case 'skipped':
          return 'skipped';
        default:
          return job.conclusion ? 'failure' : 'success';
      }
    case 'in_progress':
      return 'running';
    case 'queued':
    case 'requested':
    case 'pending':
      return 'running';
    case 'waiting':
      return 'waiting';
    default:
      return 'idle';
  }
}

function currentStepOf(job: GithubJobView): string | null {
  const running = job.steps.find((step) => step.status === 'in_progress');
  return running ? running.name : null;
}

/** Verdichtet mehrere Job-Status zu einem Stage-Status (z. B. CI aus mehreren Jobs). */
function aggregateStatus(statuses: StageStatus[]): StageStatus {
  if (statuses.length === 0) return 'idle';
  if (statuses.includes('failure')) return 'failure';
  if (statuses.includes('cancelled')) return 'cancelled';
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('waiting')) return 'waiting';
  if (statuses.every((status) => status === 'success' || status === 'skipped')) {
    return statuses.includes('success') ? 'success' : 'skipped';
  }
  return 'idle';
}

interface ParsedJobEntry {
  env: EnvKey | null;
  kind: ReturnType<typeof parseJobName>['kind'];
  job: GithubJobView;
}

function parseJobs(jobs: GithubJobView[]): ParsedJobEntry[] {
  return jobs.map((job) => {
    const { env, kind } = parseJobName(job.name);
    return { env, kind, job };
  });
}

function buildPipelineStages(jobs: GithubJobView[], pendingApprovals: string[]): Stage[] {
  const parsed = parseJobs(jobs);

  const findDeploy = (env: EnvKey): GithubJobView | undefined =>
    parsed.find((entry) => entry.kind === 'deploy' && entry.env === env)?.job;
  const findGate = (env: EnvKey): GithubJobView | undefined =>
    parsed.find((entry) => entry.kind === 'gate' && entry.env === env)?.job;

  const ciStatuses = parsed
    .filter((entry) => entry.kind === 'ci-quality' || entry.kind === 'ci-build')
    .map((entry) => jobToStageStatus(entry.job));

  const stage = (key: string, patch: Partial<Stage> = {}): Stage => {
    const meta = PIPELINE_STAGE_META.find((item) => item.key === key)!;
    return {
      key: meta.key,
      label: meta.label,
      status: patch.status ?? 'idle',
      currentStep: patch.currentStep ?? null,
      url: patch.url ?? null,
    };
  };

  const deployStage = (key: string, env: EnvKey): Stage => {
    const job = findDeploy(env);
    if (!job || job.status === 'waiting') {
      return stage(key, { status: 'idle', url: job?.url ?? null });
    }
    return stage(key, {
      status: jobToStageStatus(job),
      currentStep: currentStepOf(job),
      url: job.url,
    });
  };

  const gateStage = (key: string, env: EnvKey): Stage => {
    const job = findGate(env);
    return stage(key, { status: job ? jobToStageStatus(job) : 'idle', url: job?.url ?? null });
  };

  const approvalStage = (key: string, env: EnvKey): Stage => {
    const job = findDeploy(env);
    const waiting = pendingApprovals.includes(env) || job?.status === 'waiting';
    const status: StageStatus = waiting ? 'waiting' : job ? 'success' : 'idle';
    return stage(key, { status });
  };

  return [
    stage('ci', { status: aggregateStatus(ciStatuses) }),
    deployStage('int-deploy', 'int'),
    gateStage('int-gate', 'int'),
    approvalStage('abnahme-approval', 'abnahme'),
    deployStage('abnahme-deploy', 'abnahme'),
    gateStage('abnahme-gate', 'abnahme'),
    approvalStage('prod-approval', 'prod'),
    deployStage('prod-deploy', 'prod'),
  ];
}

function buildStabilityStages(jobs: GithubJobView[]): Stage[] {
  const parsed = parseJobs(jobs);
  const byEnv = (env: EnvKey): GithubJobView | undefined =>
    parsed.find((entry) => entry.kind === 'stability' && entry.env === env)?.job;

  const envForKey: Record<string, EnvKey> = {
    'int-check': 'int',
    'abnahme-check': 'abnahme',
    'prod-check': 'prod',
  };

  return STABILITY_STAGE_META.map((meta) => {
    const job = byEnv(envForKey[meta.key]!);
    return {
      key: meta.key,
      label: meta.label,
      status: job ? jobToStageStatus(job) : 'idle',
      currentStep: null,
      url: job?.url ?? null,
    };
  });
}
