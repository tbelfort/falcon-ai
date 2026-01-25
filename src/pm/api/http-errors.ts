// Error codes and HTTP status mapping (from spec)

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'AGENT_BUSY'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR';

export const HTTP_STATUS_MAP: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export function getHttpStatus(code: string): number {
  return HTTP_STATUS_MAP[code as ErrorCode] ?? 500;
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as AppError).code === 'string' &&
    typeof (error as AppError).message === 'string'
  );
}
