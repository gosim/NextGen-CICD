/**
 * data-testid-Vertrag — EIGENSTÄNDIGE KOPIE für das E2E-Package.
 *
 * Das Playwright-Package importiert bewusst NICHT aus @nextgen/shared, damit das
 * Test-Image ohne Workspace-Abhängigkeiten baubar bleibt. Diese Datei ist eine
 * 1:1-Kopie von packages/shared/src/testids.ts. Änderungen IMMER an allen drei
 * Stellen nachziehen: shared, hier und docs/contracts/testids.md.
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
  fieldError: (field: string): string => `field-error-${field}`,

  confirmDeleteButton: 'confirm-delete-button',
  cancelDeleteButton: 'cancel-delete-button',
} as const;
