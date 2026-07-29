import { useQuery } from '@tanstack/react-query';
import type { AppInfo } from '@nextgen/shared';
import { getInfo } from '../api/info';

/**
 * Pollt /api/info alle 10s. Wichtig für die Rollback-Demo: nach einem Rollback
 * wechselt das Environment-/Versions-Badge im Header sichtbar zurück, ohne dass
 * die Seite neu geladen werden muss.
 */
export function useInfo() {
  return useQuery<AppInfo>({
    queryKey: ['info'],
    queryFn: getInfo,
    refetchInterval: 10_000,
    staleTime: 0,
  });
}
