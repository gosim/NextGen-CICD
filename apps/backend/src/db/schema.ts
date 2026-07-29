import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const abteilung = pgTable('abteilung', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  kostenstelle: text('kostenstelle').notNull(),
});

export const mitarbeiter = pgTable('mitarbeiter', {
  id: uuid('id').primaryKey().defaultRandom(),
  personalnummer: text('personalnummer').notNull().unique('mitarbeiter_personalnummer_unique'),
  vorname: text('vorname').notNull(),
  nachname: text('nachname').notNull(),
  email: text('email').notNull().unique('mitarbeiter_email_unique'),
  abteilungId: integer('abteilung_id')
    .notNull()
    .references(() => abteilung.id),
  eintrittsdatum: date('eintrittsdatum').notNull(),
  status: text('status').notNull().default('aktiv'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AbteilungRow = typeof abteilung.$inferSelect;
export type MitarbeiterRow = typeof mitarbeiter.$inferSelect;
