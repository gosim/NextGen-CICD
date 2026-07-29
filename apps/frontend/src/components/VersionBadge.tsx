import { Badge } from '@mantine/core';
import { TESTIDS } from '@nextgen/shared';

export interface VersionBadgeProps {
  version: string | undefined;
  gitSha: string | undefined;
  instance?: string;
}

export function VersionBadge({ version, gitSha, instance }: VersionBadgeProps) {
  // Primär die menschenlesbare Version (z.B. v1.0.42); Commit-SHA und Instanz
  // wandern in den Tooltip (title) — der SHA ist nur noch sekundäre Info.
  const label = version ? `v${version}` : 'dev';
  const title = `Commit: ${gitSha ?? 'unknown'} · Instanz: ${instance ?? 'unbekannt'}`;

  return (
    <Badge
      variant="light"
      color="gray"
      size="lg"
      title={title}
      data-testid={TESTIDS.versionBadge}
    >
      {label}
    </Badge>
  );
}
