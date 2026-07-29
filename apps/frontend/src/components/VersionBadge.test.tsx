import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { VersionBadge } from './VersionBadge';
import { renderWithProviders } from '../test-utils';

describe('VersionBadge', () => {
  it('zeigt die menschenlesbare Version mit v-Präfix als Badge-Text', () => {
    renderWithProviders(<VersionBadge version="1.0.42" gitSha="abc1234" instance="pod-7" />);
    const badge = screen.getByTestId('version-badge');
    expect(badge).toHaveTextContent('v1.0.42');
    // Der Commit-SHA steht nur noch im Tooltip, nicht mehr im sichtbaren Text.
    expect(badge).not.toHaveTextContent('abc1234');
  });

  it('führt Commit-SHA und Instanz im title-Tooltip', () => {
    renderWithProviders(<VersionBadge version="1.0.42" gitSha="abc1234" instance="pod-7" />);
    expect(screen.getByTestId('version-badge')).toHaveAttribute(
      'title',
      'Commit: abc1234 · Instanz: pod-7',
    );
  });

  it('fällt bei fehlenden Werten auf Platzhalter zurück', () => {
    renderWithProviders(<VersionBadge version={undefined} gitSha={undefined} />);
    const badge = screen.getByTestId('version-badge');
    expect(badge).toHaveTextContent('dev');
    expect(badge).toHaveAttribute('title', 'Commit: unknown · Instanz: unbekannt');
  });
});
