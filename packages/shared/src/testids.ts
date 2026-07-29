/**
 * data-testid-Vertrag zwischen Frontend und E2E-Tests.
 * Das E2E-Package hält eine Kopie dieser Werte (kein Workspace-Import, damit das
 * Playwright-Image eigenständig bleibt) — Änderungen IMMER in beiden Dateien und
 * in docs/contracts/testids.md nachziehen.
 */
export const TESTIDS = {
  envBadge: 'env-badge',
  versionBadge: 'version-badge',

  mitarbeiterTable: 'mitarbeiter-table',
  mitarbeiterRow: 'mitarbeiter-row',
  mitarbeiterEmptyState: 'mitarbeiter-empty-state',
  mitarbeiterSearchInput: 'mitarbeiter-search-input',
  mitarbeiterStatusFilter: 'mitarbeiter-status-filter',
  mitarbeiterCreateButton: 'mitarbeiter-create-button',
  mitarbeiterEditButton: 'mitarbeiter-edit-button',
  mitarbeiterDeleteButton: 'mitarbeiter-delete-button',

  mitarbeiterForm: 'mitarbeiter-form',
  fieldPersonalnummer: 'field-personalnummer',
  fieldVorname: 'field-vorname',
  fieldNachname: 'field-nachname',
  fieldEmail: 'field-email',
  fieldAbteilung: 'field-abteilung',
  fieldEintrittsdatum: 'field-eintrittsdatum',
  fieldStatus: 'field-status',
  mitarbeiterFormSubmit: 'mitarbeiter-form-submit',
  mitarbeiterFormCancel: 'mitarbeiter-form-cancel',
  /** Feldfehler: `field-error-<feldname>`, z.B. field-error-email */
  fieldError: (field: string) => `field-error-${field}`,

  confirmDeleteButton: 'confirm-delete-button',
  cancelDeleteButton: 'cancel-delete-button',
} as const;
