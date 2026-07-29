import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDb, type Database, type DbPool } from './db/client.js';
import type { Env } from './config/env.js';
import { mitarbeiter } from './db/schema.js';
import { seedAbteilungen, seedMitarbeiterBaseline } from './seed/seed.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.log(
    '⏭  Integrations-API-Tests übersprungen: TEST_DATABASE_URL ist nicht gesetzt (CI stellt einen Postgres-Service bereit).',
  );
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 3000,
    DATABASE_URL: TEST_DATABASE_URL ?? '',
    APP_ENV: 'local',
    APP_VERSION: 'test',
    GIT_SHA: 'testsha',
    BUILD_TIME: 'test-build-time',
    ENABLE_TEST_RESET: true,
    DEMO_BUG: 'none',
    SEED_BASELINE: false,
    ...overrides,
  };
}

const validCreate = {
  personalnummer: 'P-9001',
  vorname: 'Test',
  nachname: 'Person',
  email: 'e2e-9001@example.de',
  abteilungId: 1,
  eintrittsdatum: '2023-05-01',
  status: 'aktiv' as const,
};

describe.skipIf(!TEST_DATABASE_URL)('Backend API (Integration)', () => {
  let pool: DbPool;
  let db: Database;
  let app: Express;

  beforeAll(async () => {
    const conn = createDb(TEST_DATABASE_URL as string);
    pool = conn.pool;
    db = conn.db;
    await migrate(db, { migrationsFolder: 'drizzle' });
    app = createApp({ db, pool, env: makeEnv() });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.delete(mitarbeiter);
    await seedAbteilungen(db);
    await seedMitarbeiterBaseline(db);
  });

  it('GET /api/health → 200 {status:ok}', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/info → 200 AppInfo mit Name nextgen-stammdaten', async () => {
    const res = await request(app).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('nextgen-stammdaten');
    expect(res.body.environment).toBe('local');
    expect(res.body.gitSha).toBe('testsha');
  });

  it('GET /api/abteilungen → 4 Abteilungen, nach Name sortiert', async () => {
    const res = await request(app).get('/api/abteilungen');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0].name).toBe('Buchhaltung');
  });

  it('GET /api/mitarbeiter → Baseline sichtbar, nach nachname sortiert, mit abteilungName', async () => {
    const res = await request(app).get('/api/mitarbeiter');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].nachname).toBe('Musterfrau');
    expect(res.body[0].abteilungName).toBeDefined();
    // Datumsformat YYYY-MM-DD
    expect(res.body[0].eintrittsdatum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('GET /api/mitarbeiter?search=schmidt filtert serverseitig (ILIKE)', async () => {
    const res = await request(app).get('/api/mitarbeiter').query({ search: 'schmidt' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].personalnummer).toBe('P-1003');
  });

  it('CRUD Happy Path: POST → GET → PUT → DELETE → 404', async () => {
    const created = await request(app).post('/api/mitarbeiter').send(validCreate);
    expect(created.status).toBe(201);
    expect(created.body.id).toBeDefined();
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/mitarbeiter/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.personalnummer).toBe('P-9001');

    const updated = await request(app)
      .put(`/api/mitarbeiter/${id}`)
      .send({ ...validCreate, nachname: 'Geändert', status: 'inaktiv' });
    expect(updated.status).toBe(200);
    expect(updated.body.nachname).toBe('Geändert');
    expect(updated.body.status).toBe('inaktiv');

    const deleted = await request(app).delete(`/api/mitarbeiter/${id}`);
    expect(deleted.status).toBe(204);

    const gone = await request(app).get(`/api/mitarbeiter/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('NOT_FOUND');
  });

  it('POST mit ungültigem Body → 400 VALIDATION_ERROR mit details', async () => {
    const res = await request(app)
      .post('/api/mitarbeiter')
      .send({ ...validCreate, personalnummer: 'FALSCH', email: 'keine-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('personalnummer');
    expect(fields).toContain('email');
  });

  it('POST mit doppelter personalnummer → 409 CONFLICT (Feld personalnummer)', async () => {
    const res = await request(app)
      .post('/api/mitarbeiter')
      .send({ ...validCreate, personalnummer: 'P-1001', email: 'neu-9001@example.de' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details?.[0]?.field).toBe('personalnummer');
  });

  it('POST mit doppelter E-Mail → 409 CONFLICT (Feld email)', async () => {
    const res = await request(app)
      .post('/api/mitarbeiter')
      .send({ ...validCreate, personalnummer: 'P-9002', email: 'max.mustermann@example.de' });
    expect(res.status).toBe(409);
    expect(res.body.error.details?.[0]?.field).toBe('email');
  });

  it('GET /api/mitarbeiter/:id mit unbekannter UUID → 404', async () => {
    const res = await request(app).get(
      '/api/mitarbeiter/11111111-1111-1111-1111-111111111111',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('unbekannte Route → 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/gibtsnicht');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /api/admin/reset ohne ENABLE_TEST_RESET → 403 FORBIDDEN', async () => {
    const guardedApp = createApp({ db, pool, env: makeEnv({ ENABLE_TEST_RESET: false }) });
    const res = await request(guardedApp).post('/api/admin/reset');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/admin/reset mit ENABLE_TEST_RESET → 204 und Baseline wiederhergestellt', async () => {
    await request(app).post('/api/mitarbeiter').send(validCreate);
    const res = await request(app).post('/api/admin/reset');
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/mitarbeiter');
    expect(list.body).toHaveLength(5);
    expect(
      list.body.some((m: { personalnummer: string }) => m.personalnummer === 'P-9001'),
    ).toBe(false);
  });

  it('POST mit DEMO_BUG=broken-create → 500 INTERNAL vor jeder Verarbeitung', async () => {
    const buggyApp = createApp({ db, pool, env: makeEnv({ DEMO_BUG: 'broken-create' }) });
    const res = await request(buggyApp).post('/api/mitarbeiter').send(validCreate);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');

    // Kein Datensatz angelegt.
    const gone = await request(app).get('/api/mitarbeiter').query({ search: 'P-9001' });
    expect(gone.body).toHaveLength(0);
  });
});
