import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { Mitarbeiter } from '@nextgen/shared';
import { MitarbeiterTable } from './MitarbeiterTable';
import { renderWithProviders } from '../test-utils';

const sample: Mitarbeiter[] = [
  {
    id: '1',
    personalnummer: 'P-1001',
    vorname: 'Max',
    nachname: 'Mustermann',
    email: 'max.mustermann@example.de',
    abteilungId: 1,
    abteilungName: 'IT',
    eintrittsdatum: '2020-01-15',
    status: 'aktiv',
    createdAt: '2020-01-15T00:00:00Z',
    updatedAt: '2020-01-15T00:00:00Z',
  },
  {
    id: '2',
    personalnummer: 'P-1005',
    vorname: 'Peter',
    nachname: 'Wagner',
    email: 'peter.wagner@example.de',
    abteilungId: 4,
    abteilungName: 'Buchhaltung',
    eintrittsdatum: '2018-02-20',
    status: 'inaktiv',
    createdAt: '2018-02-20T00:00:00Z',
    updatedAt: '2018-02-20T00:00:00Z',
  },
];

describe('MitarbeiterTable', () => {
  it('rendert eine Zeile pro Mitarbeiter mit den Kerndaten', () => {
    renderWithProviders(
      <MitarbeiterTable mitarbeiter={sample} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByTestId('mitarbeiter-table')).toBeInTheDocument();

    const rows = screen.getAllByTestId('mitarbeiter-row');
    expect(rows).toHaveLength(2);

    const firstRow = within(rows[0] as HTMLElement);
    expect(firstRow.getByText('P-1001')).toBeInTheDocument();
    expect(firstRow.getByText('Max Mustermann')).toBeInTheDocument();
    expect(firstRow.getByText('max.mustermann@example.de')).toBeInTheDocument();
    expect(firstRow.getByText('IT')).toBeInTheDocument();
    // Deutsches Datumsformat.
    expect(firstRow.getByText('15.01.2020')).toBeInTheDocument();
    expect(firstRow.getByText('Aktiv')).toBeInTheDocument();
  });

  it('zeigt den Empty-State, wenn keine Mitarbeiter vorhanden sind', () => {
    renderWithProviders(<MitarbeiterTable mitarbeiter={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByTestId('mitarbeiter-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('mitarbeiter-table')).toBeNull();
  });
});
