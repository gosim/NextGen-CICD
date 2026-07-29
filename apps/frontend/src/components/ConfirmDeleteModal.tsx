import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mitarbeiter } from '@nextgen/shared';
import { TESTIDS } from '@nextgen/shared';
import { deleteMitarbeiter } from '../api/mitarbeiter';

export interface ConfirmDeleteModalProps {
  mitarbeiter: Mitarbeiter | null;
  opened: boolean;
  onClose: () => void;
}

export function ConfirmDeleteModal({ mitarbeiter, opened, onClose }: ConfirmDeleteModalProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteMitarbeiter(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mitarbeiter'] });
      notifications.show({
        color: 'green',
        title: 'Gelöscht',
        message: 'Mitarbeiter wurde gelöscht.',
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        color: 'red',
        title: 'Fehler',
        message: 'Mitarbeiter konnte nicht gelöscht werden.',
      });
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Mitarbeiter löschen" centered>
      <Stack>
        <Text>
          {mitarbeiter
            ? `Möchten Sie ${mitarbeiter.vorname} ${mitarbeiter.nachname} (${mitarbeiter.personalnummer}) wirklich löschen?`
            : ''}
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            type="button"
            onClick={onClose}
            data-testid={TESTIDS.cancelDeleteButton}
          >
            Abbrechen
          </Button>
          <Button
            color="red"
            type="button"
            loading={mutation.isPending}
            onClick={() => {
              if (mitarbeiter) {
                mutation.mutate(mitarbeiter.id);
              }
            }}
            data-testid={TESTIDS.confirmDeleteButton}
          >
            Löschen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
