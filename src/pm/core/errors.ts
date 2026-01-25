export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'AGENT_BUSY'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR';

export interface ServiceError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: unknown
): ServiceError {
  return { code, message, details };
}
