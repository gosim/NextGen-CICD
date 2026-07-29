import { sql } from 'drizzle-orm';
import type { MitarbeiterStatus } from '@nextgen/shared';
import type { Database } from '../db/client.js';
import { abteilung, mitarbeiter } from '../db/schema.js';

/** Feste Abteilungen laut docs/contracts/api.md (feste IDs, read-only). */
const ABTEILUNGEN: { id: number; name: string; kostenstelle: string }[] = [
  { id: 1, name: 'IT', kostenstelle: 'K-1000' },
  { id: 2, name: 'Personal', kostenstelle: 'K-2000' },
  { id: 3, name: 'Vertrieb', kostenstelle: 'K-3000' },
  { id: 4, name: 'Buchhaltung', kostenstelle: 'K-4000' },
];

/** Mitarbeiter-Baseline laut docs/contracts/api.md (Upsert über personalnummer). */
const MITARBEITER_BASELINE: {
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number;
  eintrittsdatum: string;
  status: MitarbeiterStatus;
}[] = [
  {
    personalnummer: 'P-1001',
    vorname: 'Max',
    nachname: 'Mustermann',
    email: 'max.mustermann@example.de',
    abteilungId: 1,
    eintrittsdatum: '2020-01-15',
    status: 'aktiv',
  },
  {
    personalnummer: 'P-1002',
    vorname: 'Erika',
    nachname: 'Musterfrau',
    email: 'erika.musterfrau@example.de',
    abteilungId: 2,
    eintrittsdatum: '2019-06-01',
    status: 'aktiv',
  },
  {
    personalnummer: 'P-1003',
    vorname: 'Hans',
    nachname: 'Schmidt',
    email: 'hans.schmidt@example.de',
    abteilungId: 1,
    eintrittsdatum: '2021-03-10',
    status: 'aktiv',
  },
  {
    personalnummer: 'P-1004',
    vorname: 'Anna',
    nachname: 'Weber',
    email: 'anna.weber@example.de',
    abteilungId: 3,
    eintrittsdatum: '2022-11-01',
    status: 'aktiv',
  },
  {
    personalnummer: 'P-1005',
    vorname: 'Peter',
    nachname: 'Wagner',
    email: 'peter.wagner@example.de',
    abteilungId: 4,
    eintrittsdatum: '2018-02-20',
    status: 'inaktiv',
  },
];

/**
 * Spielt die Abteilungen mit festen IDs idempotent ein (Upsert) und setzt danach
 * die Serial-Sequenz auf den höchsten belegten Wert, damit spätere Inserts nicht
 * mit den festen IDs kollidieren.
 */
export async function seedAbteilungen(db: Database): Promise<void> {
  for (const row of ABTEILUNGEN) {
    await db
      .insert(abteilung)
      .values(row)
      .onConflictDoUpdate({
        target: abteilung.id,
        set: { name: row.name, kostenstelle: row.kostenstelle },
      });
  }
  // Sequenz nachziehen, sonst würde der nächste automatische Insert bei 1 starten.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('abteilung', 'id'), (SELECT MAX(id) FROM abteilung))`,
  );
}

/**
 * Spielt die Mitarbeiter-Baseline idempotent ein (Upsert über personalnummer).
 * Bestehende ephemere E2E-Datensätze bleiben unangetastet.
 */
export async function seedMitarbeiterBaseline(db: Database): Promise<void> {
  for (const row of MITARBEITER_BASELINE) {
    await db
      .insert(mitarbeiter)
      .values(row)
      .onConflictDoUpdate({
        target: mitarbeiter.personalnummer,
        set: {
          vorname: row.vorname,
          nachname: row.nachname,
          email: row.email,
          abteilungId: row.abteilungId,
          eintrittsdatum: row.eintrittsdatum,
          status: row.status,
          updatedAt: new Date(),
        },
      });
  }
}

export { ABTEILUNGEN, MITARBEITER_BASELINE };
