import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MitarbeiterFormModal } from './MitarbeiterFormModal';
import { renderWithProviders } from '../test-utils';

describe('MitarbeiterFormModal', () => {
  beforeEach(() => {
    // GET /api/abteilungen (und alle anderen fetches) liefern eine leere Liste.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  });

  it('zeigt deutsche Validierungsfehler bei leeren Pflichtfeldern', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MitarbeiterFormModal opened mitarbeiter={null} onClose={vi.fn()} />);

    await user.click(screen.getByTestId('mitarbeiter-form-submit'));

    expect(await screen.findByTestId('field-error-personalnummer')).toHaveTextContent(
      'Personalnummer muss dem Muster P-1234 entsprechen',
    );
    expect(screen.getByTestId('field-error-vorname')).toHaveTextContent(
      'Vorname ist ein Pflichtfeld',
    );
    expect(screen.getByTestId('field-error-nachname')).toHaveTextContent(
      'Nachname ist ein Pflichtfeld',
    );
    expect(screen.getByTestId('field-error-email')).toHaveTextContent('Ungültige E-Mail-Adresse');
    expect(screen.getByTestId('field-error-abteilungId')).toBeInTheDocument();
    expect(screen.getByTestId('field-error-eintrittsdatum')).toBeInTheDocument();
  });
});
