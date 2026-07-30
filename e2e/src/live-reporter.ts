import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Live-Reporter für Mission Control: meldet Einzeltests in Echtzeit an den
 * Mission-Control-Server (CONTRACT §5). Nur aktiv, wenn ENV MC_URL gesetzt ist.
 *
 * Fail-safe-Garantie: Jeder POST ist fire-and-forget mit 1s-Timeout, jeder
 * Fehler wird geschluckt — das Quality Gate darf NIEMALS am Dashboard hängen.
 */

// eslint-disable-next-line no-control-regex -- ANSI-Steuerzeichen sind hier genau der Zweck
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

interface TestEvent {
  runId: string;
  source: string;
  project: string;
  env: string | null;
  testId: string;
  title: string;
  status: 'running' | 'passed' | 'failed' | 'flaky' | 'skipped';
  durationMs?: number;
  error?: string;
}

class LiveReporter implements Reporter {
  private readonly url = process.env.MC_URL ?? '';
  private readonly runId = process.env.RUN_ID ?? 'local';
  private readonly source = process.env.MC_SOURCE ?? 'local';
  private readonly env = process.env.MC_ENV ?? null;
  private readonly pending: Promise<unknown>[] = [];

  private post(event: TestEvent): void {
    if (!this.url) return;
    const request = fetch(`${this.url}/events/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(1000),
    }).catch(() => undefined);
    this.pending.push(request);
  }

  private buildEvent(test: TestCase, status: TestEvent['status'], result?: TestResult): TestEvent {
    const location = test.location;
    return {
      runId: this.runId,
      source: this.source,
      project: test.parent.project()?.name ?? 'unbekannt',
      env: this.env,
      testId: `${location.file}:${location.line}:${test.title}`,
      title: test.title,
      status,
      ...(result ? { durationMs: result.duration } : {}),
      ...(result?.error?.message
        ? { error: result.error.message.replace(ANSI_PATTERN, '').slice(0, 500) }
        : {}),
    };
  }

  onTestBegin(test: TestCase): void {
    this.post(this.buildEvent(test, 'running'));
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    let status: TestEvent['status'];
    if (result.status === 'passed') {
      // Bestanden erst im Retry ⇒ flaky (gelb), nicht still grün.
      status = result.retry > 0 ? 'flaky' : 'passed';
    } else if (result.status === 'skipped') {
      status = 'skipped';
    } else if (result.retry < test.retries) {
      // Fehlschlag, aber es folgt noch ein Retry — für die Live-Ansicht
      // bleibt der Test "running" (der Endzustand kommt mit dem letzten Versuch).
      status = 'running';
    } else {
      status = 'failed';
    }
    this.post(this.buildEvent(test, status, result));
  }

  async onEnd(_result: FullResult): Promise<void> {
    // Offene fire-and-forget-Requests kurz abwarten (max ~2s), dann loslassen.
    await Promise.race([
      Promise.allSettled(this.pending),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default LiveReporter;
