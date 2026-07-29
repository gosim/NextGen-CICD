// Liest den Playwright-JSON-Report (test-results/results.json) und erzeugt eine
// Markdown-Zusammenfassung sowie GitHub-Outputs. Flaky-Tests werden prominent
// geflaggt (Herzstück der Flaky-Strategie). Exit-Code IMMER 0 — über den Gate-
// Status entscheidet der Playwright-Exit selbst, nicht dieser Parser.

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const resultsPath = resolve(scriptDir, '..', 'test-results', 'results.json');

function print(line) {
  process.stdout.write(`${line}\n`);
}

// Playwright-JSON-Reporter: suites sind rekursiv verschachtelt, jede enthält specs,
// jeder spec enthält tests mit einem Statusfeld ('expected'|'unexpected'|'flaky'|'skipped').
function collectTests(suite, acc) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      // Der setup-Baseline-Lauf ist kein fachlicher Gate-Test — nicht mitzählen.
      if (test.projectName === 'setup') {
        continue;
      }
      acc.push({ title: spec.title, status: test.status });
    }
  }
  for (const child of suite.suites ?? []) {
    collectTests(child, acc);
  }
}

function run() {
  if (!existsSync(resultsPath)) {
    print(`report-summary: keine Ergebnisdatei unter ${resultsPath} gefunden — übersprungen.`);
    return;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch (error) {
    print(`report-summary: results.json nicht lesbar: ${error?.message ?? error}`);
    return;
  }

  const tests = [];
  for (const suite of report.suites ?? []) {
    collectTests(suite, tests);
  }

  const withStatus = (status) => tests.filter((test) => test.status === status);
  const passed = withStatus('expected').length;
  const failed = withStatus('unexpected').length;
  const flaky = withStatus('flaky').length;
  const skipped = withStatus('skipped').length;
  const total = tests.length;

  const flakyNames = withStatus('flaky').map((test) => test.title);
  const failedNames = withStatus('unexpected').map((test) => test.title);

  const lines = [
    '## Playwright E2E — Zusammenfassung',
    '',
    '| Gesamt | Bestanden | Fehlgeschlagen | Flaky | Übersprungen |',
    '|---:|---:|---:|---:|---:|',
    `| ${total} | ${passed} | ${failed} | ${flaky} | ${skipped} |`,
    '',
  ];

  if (flaky > 0) {
    lines.push(
      `> ⚠️ **${flaky} flaky Test(s)** — bestanden erst im Retry. Bitte Ursache analysieren (Trace im Artifact)!`,
    );
    lines.push('>');
    for (const name of flakyNames) {
      lines.push(`> - ${name}`);
    }
    lines.push('');
  }

  if (failed > 0) {
    lines.push(`> ❌ **${failed} fehlgeschlagene Test(s):**`);
    lines.push('>');
    for (const name of failedNames) {
      lines.push(`> - ${name}`);
    }
    lines.push('');
  }

  const markdown = lines.join('\n');

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    appendFileSync(stepSummary, `${markdown}\n`);
  } else {
    print(markdown);
  }

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `flaky=${flaky}\nfailed=${failed}\npassed=${passed}\nskipped=${skipped}\ntotal=${total}\n`,
    );
  }
}

try {
  run();
} catch (error) {
  print(`report-summary: unerwarteter Fehler: ${error?.message ?? error}`);
}

// Der Parser blockiert nie — das Gate ist bereits über den Playwright-Exit entschieden.
process.exit(0);
