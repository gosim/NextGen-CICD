import type { ApiErrorBody, ApiErrorCode, FieldError } from '@nextgen/shared';

/** Same-origin API-Basis. nginx (Prod) bzw. Vite-Proxy (Dev) leiten /api ans Backend. */
const API_BASE = '/api';

/**
 * Fehler aus einer API-Antwort. Trägt HTTP-Status, den fachlichen Code und
 * optionale Feld-Details (für 409/400) für die Zuordnung im Formular.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: FieldError[];

  constructor(status: number, body: ApiErrorBody | undefined, fallbackMessage: string) {
    const apiError = body?.error;
    super(apiError?.message ?? fallbackMessage);
    this.name = 'ApiError';
    this.status = status;
    this.code = apiError?.code ?? 'INTERNAL';
    this.details = apiError?.details;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: unknown }).error !== null
  );
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, undefined, 'Server nicht erreichbar. Bitte Netzwerkverbindung prüfen.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let payload: unknown = undefined;
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      isApiErrorBody(payload) ? payload : undefined,
      `Serverfehler (HTTP ${response.status}).`,
    );
  }

  return payload as T;
}
