import type { ReactNode } from 'react';
import { AppShell, Group, Text, Title } from '@mantine/core';
import { useInfo } from '../hooks/useInfo';
import { EnvBadge } from './EnvBadge';
import { VersionBadge } from './VersionBadge';

// Reine Build-Metadaten des Frontends — nur ergänzend im Footer. Die
// Umgebungswahrheit liefert /api/info (siehe Header-Badges).
const FRONTEND_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
const FRONTEND_GIT_SHA = import.meta.env.VITE_GIT_SHA ?? 'dev';

export function AppShellLayout({ children }: { children: ReactNode }) {
  const { data: info } = useInfo();

  return (
    <AppShell header={{ height: 64 }} footer={{ height: 32 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Title order={3}>Stammdatenverwaltung</Title>
          <Group gap="sm" wrap="nowrap">
            <EnvBadge environment={info?.environment} demoBug={info?.demoBug} />
            <VersionBadge version={info?.version} gitSha={info?.gitSha} instance={info?.instance} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Footer>
        <Group h="100%" px="md" justify="flex-end">
          <Text size="xs" c="dimmed">
            Frontend-Build {FRONTEND_VERSION} · {FRONTEND_GIT_SHA}
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
