import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NativeSelect, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import type { Mitarbeiter, MitarbeiterCreate, MitarbeiterStatus } from '@nextgen/shared';
import { mitarbeiterCreateSchema, TESTIDS } from '@nextgen/shared';
import { createMitarbeiter, updateMitarbeiter } from '../api/mitarbeiter';
import { listAbteilungen } from '../api/abteilungen';
import { ApiError } from '../api/client';

/**
 * Formularwerte. abteilungId wird als number gehalten: das Select liefert einen
 * string, der bereits im onChange nach number konvertiert wird — nur so kann die
 * Zod-Validierung (die eine number erwartet) einen ausgewählten Wert akzeptieren.
 * transformValues erzeugt daraus das getypte, getrimmte API-Payload.
 */
type FormValues = {
  personalnummer: string;
  vorname: string;
  nachname: string;
  email: string;
  abteilungId: number | null;
  eintrittsdatum: string;
  status: MitarbeiterStatus;
};

function buildInitialValues(mitarbeiter: Mitarbeiter | null): FormValues {
  return {
    personalnummer: mitarbeiter?.personalnummer ?? '',
    vorname: mitarbeiter?.vorname ?? '',
    nachname: mitarbeiter?.nachname ?? '',
    email: mitarbeiter?.email ?? '',
    abteilungId: mitarbeiter?.abteilungId ?? null,
    eintrittsdatum: mitarbeiter?.eintrittsdatum ?? '',
    status: mitarbeiter?.status ?? 'aktiv',
  };
}

export interface MitarbeiterFormModalProps {
  opened: boolean;
  mitarbeiter: Mitarbeiter | null;
  onClose: () => void;
}

export function MitarbeiterFormModal({ opened, mitarbeiter, onClose }: MitarbeiterFormModalProps) {
  const isEdit = mitarbeiter !== null;
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues, (values: FormValues) => MitarbeiterCreate>({
    initialValues: buildInitialValues(mitarbeiter),
    validate: zodResolver(mitarbeiterCreateSchema),
    transformValues: (values) => ({
      personalnummer: values.personalnummer.trim(),
      vorname: values.vorname.trim(),
      nachname: values.nachname.trim(),
      email: values.email.trim(),
      abteilungId: values.abteilungId ?? 0,
      eintrittsdatum: values.eintrittsdatum,
      status: values.status,
    }),
  });

  // Beim Öffnen die Werte (Anlegen vs. Bearbeiten) frisch setzen und Fehler leeren.
  useEffect(() => {
    if (opened) {
      form.setValues(buildInitialValues(mitarbeiter));
      form.clearErrors();
      setFormError(null);
    }
    // form ist über Renders stabil; bewusst nur auf opened/mitarbeiter reagieren.
  }, [opened, mitarbeiter]);

  const abteilungenQuery = useQuery({
    queryKey: ['abteilungen'],
    queryFn: listAbteilungen,
    staleTime: 5 * 60 * 1000,
  });

  const abteilungOptions = (abteilungenQuery.data ?? []).map((abteilung) => ({
    value: String(abteilung.id),
    label: `${abteilung.name} (${abteilung.kostenstelle})`,
  }));

  const mutation = useMutation({
    mutationFn: (values: MitarbeiterCreate) =>
      isEdit && mitarbeiter
        ? updateMitarbeiter(mitarbeiter.id, values)
        : createMitarbeiter(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mitarbeiter'] });
      notifications.show({
        color: 'green',
        title: 'Gespeichert',
        message: isEdit ? 'Änderungen wurden gespeichert.' : 'Mitarbeiter wurde angelegt.',
      });
      onClose();
    },
    onError: (error: unknown) => {
      // 409 mit Feld-Details → Fehler direkt am betroffenen Feld anzeigen.
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.details &&
        error.details.length > 0
      ) {
        for (const detail of error.details) {
          form.setFieldError(detail.field, detail.message);
        }
        return;
      }
      // Alles andere (z.B. 500 durch DEMO_BUG) → Alert im Modal, Modal bleibt offen.
      const message =
        error instanceof ApiError && error.code === 'CONFLICT'
          ? error.message
          : 'Der Datensatz konnte nicht gespeichert werden. Bitte später erneut versuchen.';
      setFormError(message);
    },
  });

  const handleSubmit = (values: MitarbeiterCreate) => {
    setFormError(null);
    mutation.mutate(values);
  };

  // Feldfehler sichtbar rendern und mit dem vertraglichen data-testid versehen.
  const fieldError = (field: string) => {
    const message = form.errors[field];
    return message ? <span data-testid={TESTIDS.fieldError(field)}>{message}</span> : undefined;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
      centered
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)} data-testid={TESTIDS.mitarbeiterForm} noValidate>
        <Stack gap="sm">
          {formError ? (
            <Alert color="red" title="Serverfehler" data-testid="mitarbeiter-form-error">
              {formError}
            </Alert>
          ) : null}

          <TextInput
            label="Personalnummer"
            placeholder="P-1234"
            withAsterisk
            data-testid={TESTIDS.fieldPersonalnummer}
            {...form.getInputProps('personalnummer')}
            error={fieldError('personalnummer')}
          />

          <Group grow align="flex-start">
            <TextInput
              label="Vorname"
              withAsterisk
              data-testid={TESTIDS.fieldVorname}
              {...form.getInputProps('vorname')}
              error={fieldError('vorname')}
            />
            <TextInput
              label="Nachname"
              withAsterisk
              data-testid={TESTIDS.fieldNachname}
              {...form.getInputProps('nachname')}
              error={fieldError('nachname')}
            />
          </Group>

          <TextInput
            label="E-Mail"
            type="email"
            withAsterisk
            data-testid={TESTIDS.fieldEmail}
            {...form.getInputProps('email')}
            error={fieldError('email')}
          />

          {/* Native Selects: von Playwright per selectOption() bedienbar (Vertrag testids.md) */}
          <NativeSelect
            label="Abteilung"
            withAsterisk
            data={[{ value: '', label: 'Bitte wählen' }, ...abteilungOptions]}
            data-testid={TESTIDS.fieldAbteilung}
            value={form.values.abteilungId !== null ? String(form.values.abteilungId) : ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              form.setFieldValue('abteilungId', value ? Number(value) : null);
            }}
            error={fieldError('abteilungId')}
          />

          <Group grow align="flex-start">
            <TextInput
              label="Eintrittsdatum"
              type="date"
              withAsterisk
              data-testid={TESTIDS.fieldEintrittsdatum}
              {...form.getInputProps('eintrittsdatum')}
              error={fieldError('eintrittsdatum')}
            />
            <NativeSelect
              label="Status"
              withAsterisk
              data={[
                { value: 'aktiv', label: 'Aktiv' },
                { value: 'inaktiv', label: 'Inaktiv' },
              ]}
              data-testid={TESTIDS.fieldStatus}
              value={form.values.status}
              onChange={(event) =>
                form.setFieldValue('status', event.currentTarget.value as MitarbeiterStatus)
              }
              error={fieldError('status')}
            />
          </Group>

          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              type="button"
              onClick={onClose}
              data-testid={TESTIDS.mitarbeiterFormCancel}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              loading={mutation.isPending}
              data-testid={TESTIDS.mitarbeiterFormSubmit}
            >
              Speichern
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
