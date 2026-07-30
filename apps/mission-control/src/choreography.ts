import type { Alarm, ChoreographyState, EnvKey, GithubJobView } from './types.js';

// Ableitung der Architektur-Karten-Choreografie (CONTRACT §4) aus den GitHub-Job-
// und Step-Namen plus dem Live-Test-Signal. BEWUSST eine reine Funktion: keine
// Seiteneffekte, kein Netzwerk — dadurch vollständig Unit-testbar.

export interface ChoreographyInput {
  jobs: GithubJobView[];
  tests: { active: boolean; env: EnvKey | null };
}

type JobKind = 'ci-quality' | 'ci-build' | 'deploy' | 'gate' | 'rollback' | 'stability' | 'other';

interface ParsedJob {
  env: EnvKey | null;
  kind: JobKind;
}

/** Ordnet ein Stage-Präfix (`INT`, `Abnahme`, `PROD`, `CI`) einem Umgebungs-Kürzel zu. */
function stageToEnv(stage: string): EnvKey | null {
  switch (stage.trim().toLowerCase()) {
    case 'int':
      return 'int';
    case 'abnahme':
      return 'abnahme';
    case 'prod':
      return 'prod';
    default:
      return null; // CI oder unbekannt → keine Umgebung
  }
}

/** Ordnet ein Stability-Label (`INT`, `Abnahme`, `PROD`) einem Umgebungs-Kürzel zu. */
function labelToEnv(label: string): EnvKey | null {
  const s = label.trim().toLowerCase();
  if (s.startsWith('int')) return 'int';
  if (s.startsWith('abnahme')) return 'abnahme';
  if (s.startsWith('prod')) return 'prod';
  return null;
}

/**
 * Zerlegt einen Job-Namen der Form `"<Stage> / <Jobname>"` (Reusable-Workflow) bzw.
 * `"🔍 <Label>"` (Stability) in Umgebung und Art. Reihenfolge der Prüfungen ist
 * relevant: spezifische Emojis/Wörter zuerst.
 */
export function parseJobName(name: string): ParsedJob {
  const trimmed = name.trim();

  // Stability-Check-Jobs: "🔍 INT" / "🔍 Abnahme" / "🔍 PROD"
  if (trimmed.startsWith('🔍')) {
    return { env: labelToEnv(trimmed.slice('🔍'.length)), kind: 'stability' };
  }

  const sep = trimmed.indexOf(' / ');
  const stage = sep >= 0 ? trimmed.slice(0, sep) : trimmed;
  const job = sep >= 0 ? trimmed.slice(sep + 3) : '';
  const env = stageToEnv(stage);

  if (job.includes('🧪')) return { env, kind: 'ci-quality' };
  if (job.includes('📦')) return { env, kind: 'ci-build' };
  if (job.includes('⛑') || job.includes('Rollback')) return { env, kind: 'rollback' };
  if (job.includes('🛡') || job.includes('Quality Gate')) return { env, kind: 'gate' };
  if (job.includes('🚀') || job.includes('Deploy')) return { env, kind: 'deploy' };
  return { env, kind: 'other' };
}

/** Aktiviert Playwright + Backend-Kette + Test-Flow einer Umgebung. */
function lightTestPath(env: EnvKey, active: Set<string>, flows: Set<string>): void {
  active.add('playwright');
  active.add(`${env}-proxy`);
  active.add(`${env}-be-1`);
  active.add(`${env}-be-2`);
  active.add(`${env}-db`);
  flows.add(`${env}-test`);
}

/**
 * Leitet aus laufenden GitHub-Jobs/-Steps und dem Live-Test-Signal ab, welche
 * Komponenten pulsieren, welche Flüsse animiert werden und ob ein Alarm anliegt.
 * Reine Funktion (CONTRACT §4).
 */
export function deriveChoreography(input: ChoreographyInput): ChoreographyState {
  const active = new Set<string>();
  const flows = new Set<string>();
  let alarm: Alarm | null = null;

  for (const job of input.jobs) {
    if (job.status !== 'in_progress') continue;
    const { env, kind } = parseJobName(job.name);

    if (kind === 'ci-quality') {
      active.add('github-ci');
    } else if (kind === 'ci-build') {
      active.add('github-ci');
      active.add('ghcr');
      flows.add('ci-build');
    } else if ((kind === 'gate' || kind === 'stability') && env) {
      lightTestPath(env, active, flows);
    } else if (kind === 'rollback' && env) {
      active.add(`${env}-db`);
      active.add('backup-store');
      active.add('runner');
      flows.add(`${env}-restore`);
      flows.add(`${env}-rollback-pull`);
      alarm = { env, reason: 'Rollback läuft' };
    }

    // Step-Ebene: nur laufende Steps zählen. Step-Substrings exakt aus unseren
    // Composite-Actions (deploy-stack). Env stammt aus dem übergeordneten Job.
    for (const step of job.steps) {
      if (step.status !== 'in_progress') continue;
      const name = step.name;

      if (
        name.includes('Letzte grüne Version') ||
        name.includes('GHCR-Login') ||
        name.includes('State & Ops-Event')
      ) {
        active.add('runner');
      }

      if (env && name.includes('Datenbank-Backup')) {
        active.add(`${env}-db`);
        active.add('backup-store');
        flows.add(`${env}-backup`);
      }

      if (env && (name.includes('Rolling-Deployment') || name.includes('Stack deployen'))) {
        active.add(`${env}-proxy`);
        active.add(`${env}-fe-1`);
        active.add(`${env}-fe-2`);
        active.add(`${env}-be-1`);
        active.add(`${env}-be-2`);
        active.add(`${env}-migrate`);
        flows.add(`${env}-pull`);
        flows.add(`${env}-migrate`);
      }
    }
  }

  // Live-Test-Signal des Playwright-Reporters ergänzt die Job-Erkennung (die dem
  // realen Testlauf oft nachläuft): läuft eine Suite gegen eine Umgebung, pulsiert
  // deren Testpfad unabhängig vom Job-Polling.
  if (input.tests.active && input.tests.env) {
    lightTestPath(input.tests.env, active, flows);
  }

  return { active: [...active], flows: [...flows], alarm };
}
