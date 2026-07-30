import type {
  Alarm,
  ChoreographyState,
  ComponentId,
  EnvKey,
  FlowId,
  GithubJobView,
} from './types.js';

// Ableitung der Architektur-Karten-Choreografie (CONTRACT §4) aus den GitHub-Job-
// und Step-Namen plus dem Live-Test-Signal. BEWUSST eine reine Funktion: keine
// Seiteneffekte, kein Netzwerk — dadurch vollständig Unit-testbar.

export interface ChoreographyInput {
  jobs: GithubJobView[];
  tests: { active: boolean; env: EnvKey | null; source: string | null };
}

/**
 * Nachleucht-Fenster für kurzlebige Effekte (Backup-Step, Rollback-Job):
 * 10 s Mindest-Sichtbarkeit + 5 s Poll-Slack (POLL_INTERVAL_MS im GitHub-Poller).
 * Ein pg_dump von 2–3 s liegt sonst komplett zwischen zwei Polls und würde nie
 * sichtbar. Verankert an `completed_at` (GitHub-Serverzeit) gegen lokale Uhr —
 * setzt eine NTP-synchrone Host-Uhr voraus (Drift ≫ 15 s kippt die Erkennung).
 */
export const AFTERGLOW_MS = 15_000;

/** true, wenn `completedAt` gesetzt und höchstens AFTERGLOW_MS her ist (NaN → false). */
function withinAfterglow(completedAt: string | null, nowMs: number): boolean {
  if (!completedAt) return false;
  return nowMs - Date.parse(completedAt) <= AFTERGLOW_MS;
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

  // Manueller Rollback (rollback-manual.yml): "Rollback int" — ohne " / "-Separator.
  const manualRollback = /^Rollback\s+(\S+)$/i.exec(trimmed);
  if (manualRollback) {
    return { env: labelToEnv(manualRollback[1]!), kind: 'rollback' };
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

/** Aktiviert Playwright + Frontend/Backend/DB + Test-Flow einer Umgebung (CONTRACT §4). */
function lightTestPath(env: EnvKey, active: Set<ComponentId>, flows: Set<FlowId>): void {
  active.add('playwright');
  active.add(`${env}-frontend`);
  active.add(`${env}-backend`);
  active.add(`${env}-db`);
  flows.add(`${env}-test`);
}

/**
 * Kettenpfeil-Flow der Promotion: nur die Folgestufe wird „vorwärts" befördert.
 * INT ist der Einstieg und hat keinen eingehenden Promote-Flow.
 */
function promoteFlow(env: EnvKey): FlowId | null {
  if (env === 'abnahme') return 'promote-int-abnahme';
  if (env === 'prod') return 'promote-abnahme-prod';
  return null;
}

/**
 * Leitet aus laufenden GitHub-Jobs/-Steps und dem Live-Test-Signal ab, welche
 * Komponenten pulsieren, welche Flüsse animiert werden und ob ein Alarm anliegt.
 * Reine Funktion (CONTRACT §4).
 */
export function deriveChoreography(
  input: ChoreographyInput,
  nowMs: number = Date.now(),
): ChoreographyState {
  const active = new Set<ComponentId>();
  const flows = new Set<FlowId>();
  let alarm: Alarm | null = null;

  for (const job of input.jobs) {
    const jobRunning = job.status === 'in_progress';
    const { env, kind } = parseJobName(job.name);

    if (kind === 'ci-quality' && jobRunning) {
      active.add('github-ci');
    } else if (kind === 'ci-build' && jobRunning) {
      active.add('github-ci');
      active.add('ghcr');
      flows.add('ci-build');
    } else if (kind === 'gate' && env && jobRunning) {
      lightTestPath(env, active, flows);
    } else if (kind === 'stability') {
      // Bewusst KEINE Karten-Effekte: Der stündliche Check ist Hintergrund-
      // Monitoring — pulsierende Umgebungen würden die Zuschauer irritieren.
      // Sichtbarkeit: Kompaktzeile im Testpanel + Status-Chip im Kopf.
    } else if (kind === 'rollback' && env) {
      // Rollback zieht das letzte Image von der Stapel-Spitze und die DB aus dem
      // Backup zurück — daher ghcr aktiv. Der Job kann schnell durchlaufen,
      // deshalb leuchten die Effekte nach Erfolg noch AFTERGLOW_MS nach —
      // der Alarm aber NUR solange der Job wirklich läuft.
      const rollbackVisible =
        jobRunning ||
        (job.status === 'completed' &&
          job.conclusion === 'success' &&
          withinAfterglow(job.completedAt, nowMs));
      if (rollbackVisible) {
        active.add(`${env}-db`);
        active.add(`backup-${env}`);
        active.add('ghcr');
        flows.add(`${env}-restore`);
        flows.add(`${env}-rollback-pull`);
      }
      if (jobRunning) {
        alarm = { env, reason: 'Rollback läuft' };
      }
    }

    // Step-Ebene: nur laufende Steps zählen. Step-Substrings exakt aus unseren
    // Composite-Actions (deploy-stack). Env stammt aus dem übergeordneten Job.
    for (const step of job.steps) {
      const stepRunning = step.status === 'in_progress';
      const name = step.name;

      // Backup (pg_dump) dauert nur Sekunden und läge sonst oft komplett
      // zwischen zwei Polls → Nachleucht-Fenster. conclusion==='success' ist
      // zwingend: übersprungene Steps tragen ebenfalls ein completed_at.
      const backupVisible =
        stepRunning ||
        (step.status === 'completed' &&
          step.conclusion === 'success' &&
          withinAfterglow(step.completedAt, nowMs));
      if (env && backupVisible && name.includes('Datenbank-Backup')) {
        active.add(`${env}-db`);
        active.add(`backup-${env}`);
        flows.add(`${env}-backup`);
      }

      // Alle übrigen Step-Effekte bewusst strikt an laufende Steps gebunden
      // (User-Vorgabe: keine überflüssigen Effekte).
      if (!stepRunning) continue;

      if (env && (name.includes('Rolling-Deployment') || name.includes('Stack deployen'))) {
        // Deploy zieht das Image aus dem GHCR-Stapel in die Env-Box.
        active.add(`${env}-frontend`);
        active.add(`${env}-backend`);
        active.add('ghcr');
        flows.add(`${env}-pull`);
        // Kettenpfeil-Promotion animiert, sobald die Folgestufe deployt.
        const promote = promoteFlow(env);
        if (promote) flows.add(promote);
      }

      // Promote-Step im Gate-Job (nach grünen Tests): Das Image hat die Gates
      // bestanden und landet oben auf dem GHCR-Stapel.
      if (kind === 'gate' && name.includes('Promote')) {
        active.add('ghcr');
        flows.add('registry-push');
      }
    }
  }

  // Live-Test-Signal des Playwright-Reporters ergänzt die Job-Erkennung (die dem
  // realen Testlauf oft nachläuft): läuft eine Suite gegen eine Umgebung, pulsiert
  // deren Testpfad unabhängig vom Job-Polling.
  // Live-Test-Signal beleuchtet die Karte NUR beim echten Pipeline-Gate —
  // der Stabilitäts-Check bleibt bewusst effektfrei (Hintergrund-Monitoring).
  if (input.tests.active && input.tests.env && input.tests.source === 'gate') {
    lightTestPath(input.tests.env, active, flows);
  }

  return { active: [...active], flows: [...flows], alarm };
}
