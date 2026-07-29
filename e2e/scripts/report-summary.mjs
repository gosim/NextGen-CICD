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

// Entfernt ANSI-Escape-Sequenzen (Farb-/Steuercodes) aus Playwright-Fehlermeldungen,
// damit der Codeblock in der Step Summary sauber lesbar bleibt.
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex -- \x1b ist hier genau der Zweck
  return String(text ?? '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

// Dateipfad auf den Basisnamen kürzen — hält die Zusammenfassung kompakt und
// blendet Container-interne Pfade (/repo/e2e/…) aus.
function baseName(file) {
  return String(file ?? '').split(/[\\/]/).pop() ?? '';
}

// Millisekunden → "3,2s" (deutsche Dezimalschreibweise, eine Nachkommastelle).
function formatDuration(ms) {
  return `${(Number(ms ?? 0) / 1000).toFixed(1).replace('.', ',')}s`;
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
      // spec.file/spec.line dienen als Fallback-Ort, results[] tragen die
      // Attempt-Historie (Status/Dauer/Fehler) für die Detail-Blöcke.
      acc.push({
        title: spec.title,
        status: test.status,
        file: spec.file,
        line: spec.line,
        results: test.results ?? [],
      });
    }
  }
  for (const child of suite.suites ?? []) {
    collectTests(child, acc);
  }
}

// Baut den aufklappbaren Detail-Block für einen fehlgeschlagenen oder flaky Test:
// bereinigte Fehlermeldung (max. ~15 Zeilen) plus Attempt-Verlauf.
function renderDetails(test, emoji) {
  const attempts = test.results ?? [];
  // Fehlerdetails aus dem letzten Attempt mit Fehler — final failure beim
  // fehlgeschlagenen, die instabile Ausführung beim flaky Test.
  const failing = [...attempts].reverse().find((result) => result.error?.message);
  const location = failing?.error?.location ?? { file: test.file, line: test.line };
  const where = `${baseName(location?.file)}${location?.line ? `:${location.line}` : ''}`;

  // Fehlermeldung bereinigen und auf die ersten ~15 Zeilen kürzen.
  const rawMessage = failing?.error?.message ?? 'Keine Fehlermeldung im Report.';
  const messageLines = stripAnsi(rawMessage).split('\n');
  const trimmed = messageLines.slice(0, 15);
  if (messageLines.length > trimmed.length) {
    trimmed.push('… (gekürzt)');
  }

  // Attempt-Verlauf: "1. failed (3,2s) → 2. passed (1,1s)".
  const attemptsLine = attempts
    .map((result, index) => `${index + 1}. ${result.status} (${formatDuration(result.duration)})`)
    .join(' → ');

  return [
    `<details><summary>${emoji} ${test.title} (${where}, ${attempts.length} Versuche)</summary>`,
    '',
    '```',
    ...trimmed,
    '```',
    '',
    `Versuche: ${attemptsLine}`,
    '</details>',
    '',
  ];
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

  const flakyTests = withStatus('flaky');
  const failedTests = withStatus('unexpected');
  const flakyNames = flakyTests.map((test) => test.title);
  const failedNames = failedTests.map((test) => test.title);

  const lines = [
    '## Playwright E2E — Zusammenfassung',
    '',
    '| Gesamt | Bestanden | Fehlgeschlagen | Flaky | Übersprungen |',
    '|---:|---:|---:|---:|---:|',
    `| ${total} | ${passed} | ${failed} | ${flaky} | ${skipped} |`,
    '',
  ];

  // Report-Link direkt unter der Tabelle — nur wenn der Publish eine URL geliefert
  // hat (REPORT_URL bleibt leer, falls der gh-pages-Publish übersprungen wurde).
  const reportUrl = (process.env.REPORT_URL ?? '').trim();
  if (reportUrl) {
    lines.push(`📄 [Vollständiger Playwright-Report](${reportUrl})`, '');
  }

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

  // Aufklappbare Detail-Blöcke je fehlgeschlagenem/flaky Test: bereinigte
  // Fehlermeldung als Codeblock plus Attempt-Verlauf (Status/Dauer pro Versuch).
  if (failedTests.length > 0 || flakyTests.length > 0) {
    lines.push('### Fehlerdetails', '');
    for (const test of failedTests) {
      lines.push(...renderDetails(test, '❌'));
    }
    for (const test of flakyTests) {
      lines.push(...renderDetails(test, '⚠️'));
    }
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
