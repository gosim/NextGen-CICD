/**
 * Fabrik für eindeutige, kollisionsfreie Testdaten.
 *
 * Personalnummern folgen dem Vertrag aus docs/contracts/api.md: E2E-Datensätze
 * beginnen ausschließlich mit `P-9…`, damit sie nie mit der Seed-Baseline
 * (P-1001…P-1005) kollidieren. E-Mails folgen dem Muster `e2e-…@example.de`.
 *
 * Eindeutigkeit ergibt sich aus:
 *   - RUN_SUFFIX: 5 Ziffern aus RUN_ID (CI) bzw. Date.now() (lokal) — trennt Läufe
 *   - workerIndex: trennt die parallel laufenden Worker-Prozesse
 *   - counter:     prozessweit monoton steigend — trennt Datensätze innerhalb eines Workers
 */

const RUN_SUFFIX: string = ((): string => {
  const raw = process.env.RUN_ID ?? String(Date.now());
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-5).padStart(5, '0');
})();

// Prozessweiter Zähler: pro Worker ein eigener Node-Prozess -> keine Kollisionen
// zwischen Tests desselben Workers, auch ohne dass jeder Datensatz aufgeräumt wurde.
let counter = 0;

export interface UniqueKey {
  personalnummer: string;
  email: string;
}

/**
 * Liefert eine Fabrik, die bei jedem Aufruf einen frischen eindeutigen Schlüssel erzeugt.
 * `workerIndex` stammt aus `testInfo.workerIndex`.
 */
export function makeUniqueKeyFactory(workerIndex: number): () => UniqueKey {
  return (): UniqueKey => {
    const laufendeNr = counter++;
    return {
      personalnummer: `P-9${RUN_SUFFIX}${workerIndex}${laufendeNr}`,
      email: `e2e-${RUN_SUFFIX}-${workerIndex}-${laufendeNr}@example.de`,
    };
  };
}
