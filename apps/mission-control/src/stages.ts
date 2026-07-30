import type { Stage } from './types.js';

// Stage-Metadaten (Reihenfolge + Labels) für die feste Pipeline-Anzeige (CONTRACT §1).
// Sowohl der Initialzustand (alle idle) als auch der GitHub-Poller nutzen dieselben
// Definitionen — eine Quelle für Keys und Labels.

export interface StageMeta {
  key: string;
  label: string;
}

/** 8 Pipeline-Stages in fester Reihenfolge (immer alle vorhanden). */
export const PIPELINE_STAGE_META: readonly StageMeta[] = [
  { key: 'ci', label: 'CI' },
  { key: 'int-deploy', label: '🚀 INT' },
  { key: 'int-gate', label: '🛡 INT-Gate' },
  { key: 'abnahme-approval', label: '⏸ Freigabe' },
  { key: 'abnahme-deploy', label: '🚀 Abnahme' },
  { key: 'abnahme-gate', label: '🛡 Abnahme-Gate' },
  { key: 'prod-approval', label: '⏸ Freigabe' },
  { key: 'prod-deploy', label: '🚀 PROD' },
];

/** 1 Stage für den manuellen Rollback (rollback-manual.yml, ein einzelner Job). */
export const ROLLBACK_STAGE_META: readonly StageMeta[] = [{ key: 'rollback', label: '⛑ Rollback' }];

/** 3 Check-Stages für Stabilitäts-Läufe. */
export const STABILITY_STAGE_META: readonly StageMeta[] = [
  { key: 'int-check', label: '🔍 INT' },
  { key: 'abnahme-check', label: '🔍 Abnahme' },
  { key: 'prod-check', label: '🔍 PROD' },
];

export function idlePipelineStages(): Stage[] {
  return PIPELINE_STAGE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    status: 'idle',
    currentStep: null,
    url: null,
  }));
}
