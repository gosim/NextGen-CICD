import { describe, expect, it } from 'vitest';
import { deriveChoreography, parseJobName, type ChoreographyInput } from './choreography.js';
import type { GithubJobView, GithubStepView } from './types.js';

function step(
  name: string,
  status = 'in_progress',
  extra: Partial<GithubStepView> = {},
): GithubStepView {
  return {
    name,
    status,
    conclusion: status === 'completed' ? 'success' : null,
    completedAt: null,
    ...extra,
  };
}

function job(
  name: string,
  status: string,
  steps: GithubStepView[] = [],
  extra: Partial<GithubJobView> = {},
): GithubJobView {
  return {
    name,
    status,
    conclusion: null,
    url: `https://ci/${name}`,
    completedAt: null,
    steps,
    ...extra,
  };
}

function input(jobs: GithubJobView[], tests?: ChoreographyInput['tests']): ChoreographyInput {
  return { jobs, tests: tests ?? { active: false, env: null, source: null } };
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

  it('erkennt den manuellen Rollback-Job ("Rollback <env>", ohne Separator)', () => {
    expect(parseJobName('Rollback int')).toEqual({ env: 'int', kind: 'rollback' });
    expect(parseJobName('Rollback abnahme')).toEqual({ env: 'abnahme', kind: 'rollback' });
    expect(parseJobName('Rollback prod')).toEqual({ env: 'prod', kind: 'rollback' });
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
    expect(result.active).toEqual(expect.arrayContaining(['int-db', 'backup-int']));
    expect(result.flows).toContain('int-backup');
    expect(result.alarm).toBeNull();
  });

  it('Abnahme-Deploy: Frontend/Backend + ghcr aktiv, Pull-Flow + Promotion int→abnahme', () => {
    const result = deriveChoreography(
      input([
        job('Abnahme / 🚀 Deploy', 'in_progress', [
          step('Rolling-Deployment: sha-abc1234 → abnahme'),
        ]),
      ]),
    );
    expect(result.active).toEqual(
      expect.arrayContaining(['abnahme-frontend', 'abnahme-backend', 'ghcr']),
    );
    expect(result.flows).toEqual(expect.arrayContaining(['abnahme-pull', 'promote-int-abnahme']));
    // Der abgeschaffte Kettenpfeil der PROD-Stufe darf hier nicht anspringen.
    expect(result.flows).not.toContain('promote-abnahme-prod');
  });

  it('PROD-Deploy: Pull-Flow + Promotion abnahme→prod', () => {
    const result = deriveChoreography(
      input([
        job('PROD / 🚀 Deploy', 'in_progress', [step('Stack deployen → prod')]),
      ]),
    );
    expect(result.active).toEqual(
      expect.arrayContaining(['prod-frontend', 'prod-backend', 'ghcr']),
    );
    expect(result.flows).toEqual(expect.arrayContaining(['prod-pull', 'promote-abnahme-prod']));
  });

  it('INT-Deploy: Einstiegsstufe hat keinen eingehenden Promote-Flow', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [step('Rolling-Deployment: sha-abc1234 → int')]),
      ]),
    );
    expect(result.active).toEqual(expect.arrayContaining(['int-frontend', 'int-backend', 'ghcr']));
    expect(result.flows).toContain('int-pull');
    expect(result.flows).not.toContain('promote-int-abnahme');
    expect(result.flows).not.toContain('promote-abnahme-prod');
  });

  it('Gate läuft: Playwright + Frontend/Backend/DB aktiv, Test-Flow', () => {
    const result = deriveChoreography(input([job('INT / 🛡 Quality Gate', 'in_progress')]));
    expect(result.active).toEqual(
      expect.arrayContaining(['playwright', 'int-frontend', 'int-backend', 'int-db']),
    );
    expect(result.flows).toContain('int-test');
    expect(result.alarm).toBeNull();
  });

  it('Promote-Step im Gate-Job: ghcr aktiv, registry-push landet oben auf dem Stapel', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🛡 Quality Gate', 'in_progress', [
          step('Promote: Image auf die Stapel-Spitze'),
        ]),
      ]),
    );
    expect(result.active).toContain('ghcr');
    expect(result.flows).toContain('registry-push');
  });

  it('Rollback läuft: ghcr statt runner, Restore + Rollback-Pull vom Stapel + roter Alarm', () => {
    const result = deriveChoreography(
      input([
        job('INT / ⛑ Rollback', 'in_progress', [
          step('App-Version + Datenbank wiederherstellen'),
        ]),
      ]),
    );
    expect(result.active).toEqual(expect.arrayContaining(['int-db', 'backup-int', 'ghcr']));
    expect(result.active).not.toContain('runner');
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

  it('Stability-Check läuft: 🔍-Job erzeugt bewusst KEINE Karten-Effekte', () => {
    const result = deriveChoreography(input([job('🔍 PROD', 'in_progress')]));
    expect(result).toEqual({ active: [], flows: [], alarm: null });
  });

  it('Live-Test-Signal (source=gate) aktiviert den Testpfad auch ohne passenden Job', () => {
    const result = deriveChoreography(input([], { active: true, env: 'int', source: 'gate' }));
    expect(result.active).toEqual(
      expect.arrayContaining(['playwright', 'int-frontend', 'int-backend', 'int-db']),
    );
    expect(result.flows).toContain('int-test');
  });

  it('Live-Test-Signal des Stabilitäts-Checks bleibt bewusst effektfrei', () => {
    const result = deriveChoreography(input([], { active: true, env: 'int', source: 'stability' }));
    expect(result).toEqual({ active: [], flows: [], alarm: null });
  });

  it('Verwaltungs-Steps bleiben effektfrei', () => {
    // v3: `runner` entfällt — Verwaltungsrauschen (Letzte grüne Version /
    // GHCR-Login / State & Ops-Event) erzeugt bewusst keine Choreografie.
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Letzte grüne Version lesen'),
          step('GHCR-Login'),
          step('State & Ops-Event aktualisieren'),
        ]),
      ]),
    );
    expect(result).toEqual({ active: [], flows: [], alarm: null });
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

// ── Nachleucht-Fenster (AFTERGLOW_MS): kurzlebige Effekte bleiben ≥10 s sichtbar ──

describe('deriveChoreography — Nachleuchten', () => {
  const NOW = Date.parse('2026-07-30T12:00:00Z');
  const secondsAgo = (s: number): string => new Date(NOW - s * 1000).toISOString();

  it('Backup-Step vor 5 s erfolgreich beendet → Effekte leuchten nach, kein Alarm', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment', 'completed', {
            completedAt: secondsAgo(5),
          }),
        ]),
      ]),
      NOW,
    );
    expect(result.active).toEqual(expect.arrayContaining(['int-db', 'backup-int']));
    expect(result.flows).toContain('int-backup');
    expect(result.alarm).toBeNull();
  });

  it('Backup-Step vor 20 s beendet → Fenster abgelaufen, keine Effekte', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment', 'completed', {
            completedAt: secondsAgo(20),
          }),
        ]),
      ]),
      NOW,
    );
    expect(result.flows).not.toContain('int-backup');
  });

  it('übersprungener Backup-Step (conclusion=skipped) leuchtet NICHT nach', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment', 'completed', {
            conclusion: 'skipped',
            completedAt: secondsAgo(3),
          }),
        ]),
      ]),
      NOW,
    );
    expect(result.flows).not.toContain('int-backup');
  });

  it('Backup-Step completed ohne Zeitstempel → defensiv keine Effekte', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Datenbank-Backup (pg_dump) vor dem Deployment', 'completed'),
        ]),
      ]),
      NOW,
    );
    expect(result.flows).not.toContain('int-backup');
  });

  it('Rollback-Job vor 8 s erfolgreich beendet → Restore/Pull leuchten nach, Alarm ist AUS', () => {
    const result = deriveChoreography(
      input([
        job('INT / ⛑ Rollback', 'completed', [], {
          conclusion: 'success',
          completedAt: secondsAgo(8),
        }),
      ]),
      NOW,
    );
    expect(result.active).toEqual(expect.arrayContaining(['int-db', 'backup-int', 'ghcr']));
    expect(result.flows).toEqual(expect.arrayContaining(['int-restore', 'int-rollback-pull']));
    // „Rollback läuft" wäre nach Abschluss eine Falschaussage.
    expect(result.alarm).toBeNull();
  });

  it('fehlgeschlagener Rollback-Job leuchtet NICHT nach', () => {
    const result = deriveChoreography(
      input([
        job('INT / ⛑ Rollback', 'completed', [], {
          conclusion: 'failure',
          completedAt: secondsAgo(3),
        }),
      ]),
      NOW,
    );
    expect(result).toEqual({ active: [], flows: [], alarm: null });
  });

  it('manueller Rollback-Job ("Rollback int") läuft → volle Effekte + Alarm', () => {
    const result = deriveChoreography(input([job('Rollback int', 'in_progress')]), NOW);
    expect(result.active).toEqual(expect.arrayContaining(['int-db', 'backup-int', 'ghcr']));
    expect(result.flows).toEqual(expect.arrayContaining(['int-restore', 'int-rollback-pull']));
    expect(result.alarm).toEqual({ env: 'int', reason: 'Rollback läuft' });
  });

  it('Regressionsschutz: beendeter Deploy-Step leuchtet NICHT nach (nur Backup/Rollback)', () => {
    const result = deriveChoreography(
      input([
        job('INT / 🚀 Deploy', 'in_progress', [
          step('Rolling-Deployment: v1.0.28 → int', 'completed', {
            completedAt: secondsAgo(3),
          }),
        ]),
      ]),
      NOW,
    );
    expect(result).toEqual({ active: [], flows: [], alarm: null });
  });
});
