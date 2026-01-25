export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'AGENT_BUSY'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR';

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  details?: unknown;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: ServiceError): Result<T> {
  return { ok: false, error };
}
