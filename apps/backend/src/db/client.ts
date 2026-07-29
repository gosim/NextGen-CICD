import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.js';

// pg ist ein CommonJS-Modul mit instanzbasierten Exports — Named-ESM-Imports
// schlagen zur Laufzeit fehl. Daher Default-Import + Destructuring.
const { Pool, types } = pkg;

// node-postgres liefert DATE-Spalten (OID 1082) standardmäßig als JS-Date (mit
// Zeitzonen-Offset → Off-by-one-Gefahr). Wir wollen den rohen 'YYYY-MM-DD'-String,
// passend zum Drizzle-`date`-Typ (mode 'string') und zum API-Vertrag.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export type DbPool = InstanceType<typeof Pool>;
export type Database = NodePgDatabase<typeof schema>;

/**
 * Erzeugt einen pg-Pool und die zugehörige Drizzle-Instanz. Der Pool wird beim
 * Graceful Shutdown geschlossen (siehe index.ts).
 */
export function createDb(databaseUrl: string): { pool: DbPool; db: Database } {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
