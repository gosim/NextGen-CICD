import { z } from 'zod';

export const PERSONALNUMMER_REGEX = /^P-\d{4,}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const mitarbeiterStatusSchema = z.enum(['aktiv', 'inaktiv']);

export const mitarbeiterCreateSchema = z.object({
  personalnummer: z
    .string()
    .regex(PERSONALNUMMER_REGEX, 'Personalnummer muss dem Muster P-1234 entsprechen'),
  vorname: z.string().trim().min(1, 'Vorname ist ein Pflichtfeld').max(100),
  nachname: z.string().trim().min(1, 'Nachname ist ein Pflichtfeld').max(100),
  email: z.string().trim().email('Ungültige E-Mail-Adresse').max(200),
  abteilungId: z
    .number({ invalid_type_error: 'Abteilung ist ein Pflichtfeld' })
    .int()
    .positive('Abteilung ist ein Pflichtfeld'),
  eintrittsdatum: z
    .string()
    .regex(ISO_DATE_REGEX, 'Eintrittsdatum muss im Format JJJJ-MM-TT vorliegen')
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), {
      message: 'Eintrittsdatum ist kein gültiges Datum',
    }),
  status: mitarbeiterStatusSchema.default('aktiv'),
});

export const mitarbeiterUpdateSchema = mitarbeiterCreateSchema;
