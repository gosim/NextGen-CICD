import { describe, expect, it } from 'vitest';
import { deriveChoreography, parseJobName, type ChoreographyInput } from './choreography.js';
import type { GithubJobView, GithubStepView } from './types.js';

function step(name: string, status = 'in_progress'): GithubStepView {
  return { name, status, conclusion: status === 'completed' ? 'success' : null };
}

function job(
  name: string,
  status: string,
  steps: GithubStepView[] = [],
): GithubJobView {
  return { name, status, conclusion: null, url: `https://ci/${name}`, steps };
}

function input(jobs: GithubJobView[], tests?: ChoreographyInput['tests']): ChoreographyInput {
  return { jobs, tests: tests ?? { active: false, env: null } };
}

describe('parseJobName', () => {
  it('erkennt Reusable-Deploy-Jobs inkl. Umgebung', () => {
    expect(parseJobName('INT / 🚀 Deploy')).toEqual({ env: 'int', kind: 'deploy' });
    expect(parseJobName('Abnahme / 🛡 Quality Gate')).toEqual({ env: 'abnahme', kind: 'gate' });
    expect(parseJobName('PROD / 🚀 Deploy')).toEqual({ env: 'prod', kind: 'deploy' });
    expect(parseJobName('INT / ⛑ Rollback')).toEqual({ env: 'int', kind: 'rollback' });
  });

  it('erkennt CI-Jobs (kein Env)', () => {
    expect(parseJobName('CI / 🧪 Lint & Tests')).toEqual({ env: null, kind: 'ci-quality' });
    expect(parseJobName('CI / 📦 Image: backend')).toEqual({ env: null, kind: 'ci-build' });
  });

  it('erkennt Stability-Check-Jobs ohne " / "-Präfix', () => {
    expect(parseJobName('🔍 INT')).toEqual({ env: 'int', kind: 'stability' });
    expect(parseJobName('🔍 Abnahme')).toEqual({ env: 'abnahme', kind: 'stability' });
    expect(parseJobName('🔍 PROD')).toEqual({ env: 'prod', kind: 'stability' });
  });
});

describe('deriveChoreography', () => {
  it('Backup-Step: DB + Backup-Store aktiv, Backup-Flow läuft', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment'),
        ]),
      ]),
    );
    expect(result.active).toEqual(
      expect.arrayContaining(['int-db', 'backup-store']),
    );
    expect(result.flows).toContain('int-backup');
    expect(result.alarm).toBeNull();
  });

  it('Rolling-Step: Proxy/FE/BE/Migrate aktiv, Pull- und Migrate-Flow', () => {
    const result = deriveChoreography(
      input([
        job('Abnahme / 🚀 Deploy', 'in_progress', [
          step('Rolling-Deployment: sha-abc1234 → abnahme'),
        ]),
      ]),
    );
    expect(result.active).toEqual(
      expect.arrayContaining([
        'abnahme-proxy',
        'abnahme-fe-1',
        'abnahme-fe-2',
        'abnahme-be-1',
        'abnahme-be-2',
        'abnahme-migrate',
      ]),
    );
    expect(result.flows).toEqual(expect.arrayContaining(['abnahme-pull', 'abnahme-migrate']));
  });

  it('Gate läuft: Playwright + Backend-Kette aktiv, Test-Flow', () => {
    const result = deriveChoreography(input([job('INT / 🛡 Quality Gate', 'in_progress')]));
    expect(result.active).toEqual(
      expect.arrayContaining(['playwright', 'int-proxy', 'int-be-1', 'int-be-2', 'int-db']),
    );
    expect(result.flows).toContain('int-test');
    expect(result.alarm).toBeNull();
  });

  it('Rollback läuft: Restore-Flüsse + roter Alarm', () => {
    const result = deriveChoreography(
      input([
        job('INT / ⛑ Rollback', 'in_progress', [
          step('App-Version + Datenbank wiederherstellen'),
        ]),
      ]),
    );
    expect(result.active).toEqual(
      expect.arrayContaining(['int-db', 'backup-store', 'runner']),
    );
    expect(result.flows).toEqual(
      expect.arrayContaining(['int-restore', 'int-rollback-pull']),
    );
    expect(result.alarm).toEqual({ env: 'int', reason: 'Rollback läuft' });
  });

  it('CI-Build: github-ci + ghcr aktiv, ci-build-Flow', () => {
    const result = deriveChoreography(input([job('CI / 📦 Image: backend', 'in_progress')]));
    expect(result.active).toEqual(expect.arrayContaining(['github-ci', 'ghcr']));
    expect(result.flows).toContain('ci-build');
    // Reiner Lint-/Test-Job aktiviert nur github-ci, keinen Flow.
    const quality = deriveChoreography(input([job('CI / 🧪 Lint & Tests', 'in_progress')]));
    expect(quality.active).toEqual(['github-ci']);
    expect(quality.flows).toEqual([]);
  });

  it('waiting: wartender Job (nicht in_progress) erzeugt keine Animation', () => {
    const result = deriveChoreography(input([job('Abnahme / 🚀 Deploy', 'waiting')]));
    expect(result.active).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.alarm).toBeNull();
  });

  it('idle: keine Jobs → alles leer', () => {
    const result = deriveChoreography(input([]));
    expect(result).toEqual({ active: [], flows: [], alarm: null });
  });

  it('Stability-Check läuft: 🔍-Job aktiviert den Testpfad der Umgebung', () => {
    const result = deriveChoreography(input([job('🔍 PROD', 'in_progress')]));
    expect(result.active).toEqual(
      expect.arrayContaining(['playwright', 'prod-proxy', 'prod-be-1', 'prod-be-2', 'prod-db']),
    );
    expect(result.flows).toContain('prod-test');
  });

  it('Live-Test-Signal ohne passenden Job aktiviert den Testpfad dennoch', () => {
    const result = deriveChoreography(input([], { active: true, env: 'int' }));
    expect(result.active).toEqual(
      expect.arrayContaining(['playwright', 'int-proxy', 'int-be-1', 'int-be-2', 'int-db']),
    );
    expect(result.flows).toContain('int-test');
  });

  it('Runner-Steps (Letzte grüne Version / State & Ops-Event) aktivieren den Runner', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Letzte grüne Version lesen'),
          step('State & Ops-Event aktualisieren', 'queued'),
        ]),
      ]),
    );
    expect(result.active).toContain('runner');
  });

  it('dedupliziert Komponenten über mehrere Jobs/Steps hinweg', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment'),
        ]),
        job('INT / 🛡 Quality Gate', 'in_progress'),
      ]),
    );
    // int-db kommt aus Backup UND Gate — darf nur einmal auftauchen.
    expect(result.active.filter((c) => c === 'int-db')).toHaveLength(1);
  });
});
