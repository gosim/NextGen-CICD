import { Badge, Button, Center, Group, Paper, Table, Text } from '@mantine/core';
import type { Mitarbeiter } from '@nextgen/shared';
import { TESTIDS } from '@nextgen/shared';

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDate(iso: string): string {
  // Als lokale Mitternacht parsen, damit die Zeitzone das Datum nicht verschiebt.
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : dateFormatter.format(parsed);
}

export interface MitarbeiterTableProps {
  mitarbeiter: Mitarbeiter[];
  onEdit: (mitarbeiter: Mitarbeiter) => void;
  onDelete: (mitarbeiter: Mitarbeiter) => void;
}

export function MitarbeiterTable({ mitarbeiter, onEdit, onDelete }: MitarbeiterTableProps) {
  if (mitarbeiter.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Center>
          <Text c="dimmed" data-testid={TESTIDS.mitarbeiterEmptyState}>
            Keine Mitarbeiter gefunden.
          </Text>
        </Center>
      </Paper>
    );
  }

  return (
    <Table.ScrollContainer minWidth={760}>
      <Table
        striped
        highlightOnHover
        withTableBorder
        verticalSpacing="sm"
        data-testid={TESTIDS.mitarbeiterTable}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Personalnummer</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>E-Mail</Table.Th>
            <Table.Th>Abteilung</Table.Th>
            <Table.Th>Eintrittsdatum</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Aktionen</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {mitarbeiter.map((eintrag) => (
            <Table.Tr key={eintrag.id} data-testid={TESTIDS.mitarbeiterRow}>
              <Table.Td>{eintrag.personalnummer}</Table.Td>
              <Table.Td>
                {eintrag.vorname} {eintrag.nachname}
              </Table.Td>
              <Table.Td>{eintrag.email}</Table.Td>
              <Table.Td>{eintrag.abteilungName ?? '—'}</Table.Td>
              <Table.Td>{formatDate(eintrag.eintrittsdatum)}</Table.Td>
              <Table.Td>
                <Badge color={eintrag.status === 'aktiv' ? 'green' : 'gray'} variant="light">
                  {eintrag.status === 'aktiv' ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => onEdit(eintrag)}
                    data-testid={TESTIDS.mitarbeiterEditButton}
                  >
                    Bearbeiten
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    onClick={() => onDelete(eintrag)}
                    data-testid={TESTIDS.mitarbeiterDeleteButton}
                  >
                    Löschen
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
