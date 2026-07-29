import { z } from 'zod';

/**
 * Zod-validierte Umgebungsvariablen (fail-fast). Defaults gemäß docs/contracts/api.md.
 * Bei ungültiger Konfiguration bricht der Prozess mit klarer Meldung ab.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ist erforderlich'),
  APP_ENV: z.enum(['local', 'int', 'abnahme', 'prod']).default('local'),
  APP_VERSION: z.string().default('dev'),
  GIT_SHA: z.string().default('unknown'),
  BUILD_TIME: z.string().default('unknown'),
  ENABLE_TEST_RESET: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  DEMO_BUG: z.enum(['none', 'broken-create']).default('none'),
  SEED_BASELINE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Liest und validiert die ENV einmalig. Bricht bei Fehlern mit Exit-Code 1 ab.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Ungültige Umgebungskonfiguration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export function getEnv(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}
