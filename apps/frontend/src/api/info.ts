import type { AppInfo } from '@nextgen/shared';
import { request } from './client';

export function getInfo(): Promise<AppInfo> {
  return request<AppInfo>('/info', { method: 'GET' });
}
