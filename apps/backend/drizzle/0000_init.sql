CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "abteilung" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kostenstelle" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mitarbeiter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personalnummer" text NOT NULL,
	"vorname" text NOT NULL,
	"nachname" text NOT NULL,
	"email" text NOT NULL,
	"abteilung_id" integer NOT NULL,
	"eintrittsdatum" date NOT NULL,
	"status" text DEFAULT 'aktiv' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mitarbeiter_personalnummer_unique" UNIQUE("personalnummer"),
	CONSTRAINT "mitarbeiter_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "mitarbeiter" ADD CONSTRAINT "mitarbeiter_abteilung_id_abteilung_id_fk" FOREIGN KEY ("abteilung_id") REFERENCES "public"."abteilung"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mitarbeiter_nachname_idx" ON "mitarbeiter" USING btree ("nachname");
