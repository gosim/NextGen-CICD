import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { AppEnvironment } from '@nextgen/shared';
import { EnvBadge, envColor, envLabel } from './EnvBadge';
import { renderWithProviders } from '../test-utils';

const cases: Array<[AppEnvironment, string, string]> = [
  ['int', 'blue', 'INT'],
  ['abnahme', 'orange', 'ABNAHME'],
  ['prod', 'green', 'PROD'],
  ['local', 'gray', 'LOCAL'],
];

describe('EnvBadge', () => {
  it.each(cases)('bildet Umgebung %s auf Farbe und Label ab', (environment, color, label) => {
    expect(envColor(environment)).toBe(color);
    expect(envLabel(environment)).toBe(label);
  });

  it.each(cases)('rendert den Badge-Text für %s', (environment, _color, label) => {
    const { unmount } = renderWithProviders(
      <EnvBadge environment={environment} demoBug="none" />,
    );
    expect(screen.getByTestId('env-badge')).toHaveTextContent(label);
    expect(screen.queryByTestId('demo-bug-badge')).toBeNull();
    unmount();
  });

  it('nutzt Grau, wenn die Umgebung (noch) unbekannt ist', () => {
    expect(envColor(undefined)).toBe('gray');
    renderWithProviders(<EnvBadge environment={undefined} demoBug={undefined} />);
    expect(screen.getByTestId('env-badge')).toBeInTheDocument();
  });

  it('zeigt das DEMO-BUG-Badge, wenn ein Demo-Bug aktiv ist', () => {
    renderWithProviders(<EnvBadge environment="int" demoBug="broken-create" />);
    expect(screen.getByTestId('demo-bug-badge')).toHaveTextContent('DEMO-BUG AKTIV');
  });
});
