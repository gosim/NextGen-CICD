import { Badge } from '@mantine/core';
import { TESTIDS } from '@nextgen/shared';

export interface VersionBadgeProps {
  version: string | undefined;
  gitSha: string | undefined;
}

export function VersionBadge({ version, gitSha }: VersionBadgeProps) {
  return (
    <Badge variant="light" color="gray" size="lg" data-testid={TESTIDS.versionBadge}>
      {(version ?? 'dev') + ' · ' + (gitSha ?? 'unknown')}
    </Badge>
  );
}
