import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getEnv } from './config/env.js';
import { createDb } from './db/client.js';
import { seedAbteilungen, seedMitarbeiterBaseline } from './seed/seed.js';

/**
 * Standalone-Migrations-Runner (läuft als One-Shot-Compose-Service `migrate`):
 *   1. Drizzle-Migrationen aus dem Ordner "drizzle" anwenden
 *   2. Abteilungen immer seeden (read-only Stammdaten)
 *   3. Mitarbeiter-Baseline nur bei SEED_BASELINE=true
 * Saubere Logs und Exit-Codes (0 = ok, 1 = Fehler).
 */
async function run(): Promise<void> {
  const env = getEnv();
  const { pool, db } = createDb(env.DATABASE_URL);

  try {
    console.log('→ Wende Migrationen an (Ordner: drizzle) …');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('✓ Migrationen angewendet.');

    console.log('→ Seede Abteilungen (idempotent) …');
    await seedAbteilungen(db);
    console.log('✓ Abteilungen geseedet.');

    if (env.SEED_BASELINE) {
      console.log('→ Seede Mitarbeiter-Baseline (SEED_BASELINE=true) …');
      await seedMitarbeiterBaseline(db);
      console.log('✓ Mitarbeiter-Baseline geseedet.');
    } else {
      console.log('· Überspringe Mitarbeiter-Baseline (SEED_BASELINE!=true).');
    }
  } finally {
    await pool.end();
  }
}

run()
  .then(() => {
    console.log('✓ Migration + Seed abgeschlossen.');
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('✗ Migration/Seed fehlgeschlagen:', err);
    process.exit(1);
  });
