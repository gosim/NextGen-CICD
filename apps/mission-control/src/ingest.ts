import express, { Router } from 'express';
import type { StateStore } from './state.js';
import type { EnvKey, TestEventInput, TestSource, TestStatus } from './types.js';

// Test-Ingest POST /events/test (CONTRACT §5). Antwort IMMER 204 — der Playwright-
// Live-Reporter ist fire-and-forget; selbst bei Parse-/Validierungsfehlern darf hier
// nichts fehlschlagen. Die Suite-Reset-/Ende-Logik lebt bewusst im StateStore.

const MAX_ERROR_LENGTH = 500;
const VALID_STATUS: readonly TestStatus[] = [
  'running',
  'passed',
  'failed',
  'flaky',
  'skipped',
];
const VALID_SOURCE: readonly TestSource[] = ['gate', 'stability', 'local'];
const VALID_ENV: readonly EnvKey[] = ['int', 'abnahme', 'prod'];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Validiert und normalisiert einen eingehenden Event-Body; null bei Unbrauchbarkeit. */
export function coerceTestEvent(body: unknown): TestEventInput | null {
  if (body === null || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;

  const runId = asString(record.runId);
  const project = asString(record.project);
  const testId = asString(record.testId);
  const status = record.status;

  if (
    runId === null ||
    project === null ||
    testId === null ||
    typeof status !== 'string' ||
    !VALID_STATUS.includes(status as TestStatus)
  ) {
    return null;
  }

  const source: TestSource = VALID_SOURCE.includes(record.source as TestSource)
    ? (record.source as TestSource)
    : 'local';
  const env: EnvKey | null = VALID_ENV.includes(record.env as EnvKey)
    ? (record.env as EnvKey)
    : null;
  const durationMs =
    typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)
      ? record.durationMs
      : undefined;
  const error =
    typeof record.error === 'string' ? record.error.slice(0, MAX_ERROR_LENGTH) : undefined;

  return {
    runId,
    source,
    project,
    env,
    testId,
    title: asString(record.title) ?? testId,
    status: status as TestStatus,
    durationMs,
    error,
  };
}

export function ingestRouter(state: StateStore): Router {
  const router = Router();
  // Eigener JSON-Parser mit Fehlertoleranz: liest jeden Content-Type, wirft aber
  // nicht in die Error-Middleware — der Reporter bekommt IMMER 204.
  const jsonParser = express.json({ type: () => true, limit: '512kb' });

  router.post('/', (req, res) => {
    jsonParser(req, res, (parseError?: unknown) => {
      // Sofort quittieren; Verarbeitung ist unkritisch und fire-and-forget.
      res.status(204).end();
      if (parseError) return;
      try {
        const event = coerceTestEvent(req.body);
        if (event) state.ingestTestEvent(event);
      } catch (error) {
        console.error('Test-Ingest-Verarbeitungsfehler:', error);
      }
    });
  });

  return router;
}
