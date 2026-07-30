import { describe, expect, it } from 'vitest';
import { chooseRun, STORY_HOLD_MS, type ApiRun } from './github.js';

// Story-Priorität der Lauf-Auswahl (siehe chooseRun): Die Pipeline-Erzählung
// darf nicht sofort von einem stündlichen Stabilitäts-Check verdrängt werden.

const NOW = Date.parse('2026-07-30T12:00:00Z');

function run(overrides: Partial<ApiRun> & { id: number }): ApiRun {
  return {
    name: 'Run',
    html_url: 'https://example.local',
    path: '.github/workflows/pipeline.yml',
    run_number: overrides.id,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(NOW - 60_000).toISOString(),
    updated_at: new Date(NOW - 30_000).toISOString(),
    ...overrides,
  };
}

const STABILITY = '.github/workflows/stability-check.yml';

describe('chooseRun', () => {
  it('bevorzugt den aktiven Pipeline-Lauf vor allem anderen', () => {
    const chosen = chooseRun(
      [
        run({ id: 1, path: STABILITY, status: 'in_progress', created_at: new Date(NOW).toISOString() }),
        run({ id: 2, status: 'waiting' }),
      ],
      NOW,
    );
    expect(chosen.id).toBe(2);
  });

  it('hält einen frisch beendeten Pipeline-Lauf gegen einen startenden Check (Story-Hold)', () => {
    const chosen = chooseRun(
      [
        run({ id: 1, conclusion: 'failure' }), // Rollback-Story, vor 30 s beendet
        run({ id: 2, path: STABILITY, status: 'in_progress', created_at: new Date(NOW).toISOString() }),
      ],
      NOW,
    );
    expect(chosen.id).toBe(1);
  });

  it('zeigt den aktiven Check, wenn die Pipeline-Story abgelaufen ist', () => {
    const old = new Date(NOW - STORY_HOLD_MS - 60_000).toISOString();
    const chosen = chooseRun(
      [
        run({ id: 1, created_at: old, updated_at: old }),
        run({ id: 2, path: STABILITY, status: 'in_progress', created_at: new Date(NOW).toISOString() }),
      ],
      NOW,
    );
    expect(chosen.id).toBe(2);
  });

  it('fällt auf den neuesten Lauf zurück, wenn nichts aktiv und nichts frisch ist', () => {
    const old = new Date(NOW - STORY_HOLD_MS - 60_000).toISOString();
    const older = new Date(NOW - STORY_HOLD_MS - 120_000).toISOString();
    const chosen = chooseRun(
      [
        run({ id: 1, created_at: older, updated_at: older }),
        run({ id: 2, path: STABILITY, created_at: old, updated_at: old }),
      ],
      NOW,
    );
    expect(chosen.id).toBe(2);
  });
});
