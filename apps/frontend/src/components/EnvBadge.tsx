import { Badge, Group } from '@mantine/core';
import type { AppEnvironment, DemoBug } from '@nextgen/shared';
import { TESTIDS } from '@nextgen/shared';

/** Farbcodierung laut Vertrag: int→blau, abnahme→orange, prod→grün, local→grau. */
export const ENV_COLORS: Record<AppEnvironment, string> = {
  int: 'blue',
  abnahme: 'orange',
  prod: 'green',
  local: 'gray',
};

export function envColor(environment: AppEnvironment | undefined): string {
  return environment ? ENV_COLORS[environment] : 'gray';
}

export function envLabel(environment: AppEnvironment | undefined): string {
  return environment ? environment.toUpperCase() : '—';
}

export interface EnvBadgeProps {
  environment: AppEnvironment | undefined;
  demoBug: DemoBug | undefined;
}

export function EnvBadge({ environment, demoBug }: EnvBadgeProps) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge color={envColor(environment)} variant="filled" size="lg" data-testid={TESTIDS.envBadge}>
        {envLabel(environment)}
      </Badge>
      {demoBug && demoBug !== 'none' ? (
        <Badge color="red" variant="filled" size="lg" data-testid="demo-bug-badge">
          DEMO-BUG AKTIV
        </Badge>
      ) : null}
    </Group>
  );
}
