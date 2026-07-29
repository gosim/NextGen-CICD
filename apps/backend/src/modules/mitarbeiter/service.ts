import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type {
  Mitarbeiter,
  MitarbeiterCreate,
  MitarbeiterStatus,
  MitarbeiterUpdate,
} from '@nextgen/shared';
import type { Database } from '../../db/client.js';
import { abteilung, mitarbeiter } from '../../db/schema.js';
import { NotFoundError } from '../../errors.js';

export interface MitarbeiterFilter {
  search?: string;
  status?: MitarbeiterStatus;
  abteilungId?: number;
}

/** Rohzeile aus dem Join (createdAt/updatedAt als Date, abteilungName evtl. null). */
interface JoinedRow {
  id: string;
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number;
  abteilungName: string | null;
  eintrittsdatum: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const baseSelection = {
  id: mitarbeiter.id,
  personalnummer: mitarbeiter.personalnummer,
  vorname: mitarbeiter.vorname,
  nachname: mitarbeiter.nachname,
  email: mitarbeiter.email,
  abteilungId: mitarbeiter.abteilungId,
  abteilungName: abteilung.name,
  eintrittsdatum: mitarbeiter.eintrittsdatum,
  status: mitarbeiter.status,
  createdAt: mitarbeiter.createdAt,
  updatedAt: mitarbeiter.updatedAt,
};

/** Übersetzt eine Join-Zeile in das API-DTO (camelCase, ISO-Zeitstempel). */
function toDto(row: JoinedRow): Mitarbeiter {
  const dto: Mitarbeiter = {
    id: row.id,
    personalnummer: row.personalnummer,
    vorname: row.vorname,
    nachname: row.nachname,
    email: row.email,
    abteilungId: row.abteilungId,
    eintrittsdatum: row.eintrittsdatum,
    status: row.status as MitarbeiterStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.abteilungName !== null) {
    dto.abteilungName = row.abteilungName;
  }
  return dto;
}

/**
 * Liste mit optionalen Filtern: search (ILIKE auf vorname/nachname/personalnummer),
 * status, abteilungId. LEFT JOIN auf Abteilung, Sortierung nach nachname asc.
 */
export async function listMitarbeiter(
  db: Database,
  filter: MitarbeiterFilter,
): Promise<Mitarbeiter[]> {
  const conditions: SQL[] = [];

  if (filter.search) {
    const pattern = `%${filter.search}%`;
    const searchCondition = or(
      ilike(mitarbeiter.vorname, pattern),
      ilike(mitarbeiter.nachname, pattern),
      ilike(mitarbeiter.personalnummer, pattern),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (filter.status) {
    conditions.push(eq(mitarbeiter.status, filter.status));
  }
  if (filter.abteilungId !== undefined) {
    conditions.push(eq(mitarbeiter.abteilungId, filter.abteilungId));
  }

  const rows = await db
    .select(baseSelection)
    .from(mitarbeiter)
    .leftJoin(abteilung, eq(mitarbeiter.abteilungId, abteilung.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(mitarbeiter.nachname));

  return rows.map(toDto);
}

/** Einzelsatz per id; null wenn nicht vorhanden. */
export async function findMitarbeiterById(
  db: Database,
  id: string,
): Promise<Mitarbeiter | null> {
  const rows = await db
    .select(baseSelection)
    .from(mitarbeiter)
    .leftJoin(abteilung, eq(mitarbeiter.abteilungId, abteilung.id))
    .where(eq(mitarbeiter.id, id))
    .limit(1);

  const row = rows[0];
  return row ? toDto(row) : null;
}

/** Einzelsatz per id oder NotFoundError. */
export async function getMitarbeiterOrThrow(db: Database, id: string): Promise<Mitarbeiter> {
  const found = await findMitarbeiterById(db, id);
  if (!found) {
    throw new NotFoundError('Mitarbeiter nicht gefunden');
  }
  return found;
}

/** Legt einen Mitarbeiter an und liefert den vollständigen (gejointen) Datensatz. */
export async function createMitarbeiter(
  db: Database,
  data: MitarbeiterCreate,
): Promise<Mitarbeiter> {
  const inserted = await db
    .insert(mitarbeiter)
    .values({
      personalnummer: data.personalnummer,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      abteilungId: data.abteilungId,
      eintrittsdatum: data.eintrittsdatum,
      status: data.status,
    })
    .returning({ id: mitarbeiter.id });

  const id = inserted[0]?.id;
  if (!id) {
    throw new Error('Insert lieferte keine ID zurück');
  }
  return getMitarbeiterOrThrow(db, id);
}

/**
 * Vollupdate eines Mitarbeiters (updated_at = now()). NotFoundError wenn die id
 * nicht existiert.
 */
export async function updateMitarbeiter(
  db: Database,
  id: string,
  data: MitarbeiterUpdate,
): Promise<Mitarbeiter> {
  const updated = await db
    .update(mitarbeiter)
    .set({
      personalnummer: data.personalnummer,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      abteilungId: data.abteilungId,
      eintrittsdatum: data.eintrittsdatum,
      status: data.status,
      updatedAt: new Date(),
    })
    .where(eq(mitarbeiter.id, id))
    .returning({ id: mitarbeiter.id });

  if (updated.length === 0) {
    throw new NotFoundError('Mitarbeiter nicht gefunden');
  }
  return getMitarbeiterOrThrow(db, id);
}

/** Löscht einen Mitarbeiter; NotFoundError wenn nicht vorhanden. */
export async function deleteMitarbeiter(db: Database, id: string): Promise<void> {
  const deleted = await db
    .delete(mitarbeiter)
    .where(eq(mitarbeiter.id, id))
    .returning({ id: mitarbeiter.id });

  if (deleted.length === 0) {
    throw new NotFoundError('Mitarbeiter nicht gefunden');
  }
}
