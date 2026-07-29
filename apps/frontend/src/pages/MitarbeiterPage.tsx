import { useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import type { Mitarbeiter, MitarbeiterStatus } from '@nextgen/shared';
import { TESTIDS } from '@nextgen/shared';
import { listMitarbeiter } from '../api/mitarbeiter';
import { MitarbeiterTable } from '../components/MitarbeiterTable';
import { MitarbeiterFormModal } from '../components/MitarbeiterFormModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

type StatusFilter = 'alle' | MitarbeiterStatus;

export function MitarbeiterPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<StatusFilter>('alle');

  const [formOpened, setFormOpened] = useState(false);
  const [editing, setEditing] = useState<Mitarbeiter | null>(null);
  const [deleting, setDeleting] = useState<Mitarbeiter | null>(null);

  const listQuery = useQuery({
    queryKey: ['mitarbeiter', { search: debouncedSearch, status }],
    queryFn: () =>
      listMitarbeiter({
        search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
        status: status === 'alle' ? undefined : status,
      }),
    placeholderData: (previous) => previous,
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpened(true);
  };

  const openEdit = (mitarbeiter: Mitarbeiter) => {
    setEditing(mitarbeiter);
    setFormOpened(true);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>Mitarbeiter</Title>
        <Button onClick={openCreate} data-testid={TESTIDS.mitarbeiterCreateButton}>
          Neuer Mitarbeiter
        </Button>
      </Group>

      <Group gap="md" wrap="wrap" align="flex-end">
        <TextInput
          label="Suche"
          placeholder="Name oder Personalnummer"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          data-testid={TESTIDS.mitarbeiterSearchInput}
          w={280}
        />
        <Select
          label="Status"
          data={[
            { value: 'alle', label: 'Alle' },
            { value: 'aktiv', label: 'Aktiv' },
            { value: 'inaktiv', label: 'Inaktiv' },
          ]}
          value={status}
          onChange={(value) => setStatus((value as StatusFilter | null) ?? 'alle')}
          allowDeselect={false}
          data-testid={TESTIDS.mitarbeiterStatusFilter}
          w={180}
        />
      </Group>

      {listQuery.isError ? (
        <Alert color="red" title="Fehler beim Laden">
          Die Mitarbeiterliste konnte nicht geladen werden.
        </Alert>
      ) : listQuery.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <MitarbeiterTable
          mitarbeiter={listQuery.data ?? []}
          onEdit={openEdit}
          onDelete={setDeleting}
        />
      )}

      <MitarbeiterFormModal
        opened={formOpened}
        mitarbeiter={editing}
        onClose={() => setFormOpened(false)}
      />
      <ConfirmDeleteModal
        mitarbeiter={deleting}
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
      />
    </Stack>
  );
}
