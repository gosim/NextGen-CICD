import type { ApiErrorCode, FieldError } from '@nextgen/shared';

/**
 * Basisklasse für erwartbare Anwendungsfehler, die die zentrale Error-Middleware
 * in das einheitliche Fehlerformat (docs/contracts/api.md) übersetzt.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: FieldError[];

  constructor(status: number, code: ApiErrorCode, message: string, details?: FieldError[]) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource nicht gefunden', details?: FieldError[]) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Konflikt: Datensatz existiert bereits', details?: FieldError[]) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Zugriff verweigert', details?: FieldError[]) {
    super(403, 'FORBIDDEN', message, details);
  }
}
