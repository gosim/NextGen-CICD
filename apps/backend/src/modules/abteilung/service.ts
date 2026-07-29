import { asc } from 'drizzle-orm';
import type { Abteilung } from '@nextgen/shared';
import type { Database } from '../../db/client.js';
import { abteilung } from '../../db/schema.js';

/**
 * Liefert alle Abteilungen sortiert nach Name (aufsteigend).
 */
export async function listAbteilungen(db: Database): Promise<Abteilung[]> {
  const rows = await db
    .select({
      id: abteilung.id,
      name: abteilung.name,
      kostenstelle: abteilung.kostenstelle,
    })
    .from(abteilung)
    .orderBy(asc(abteilung.name));
  return rows;
}
