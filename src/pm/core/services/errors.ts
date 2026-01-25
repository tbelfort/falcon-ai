export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'AGENT_BUSY'
  | 'INVALID_TRANSITION'
  | 'INTERNAL_ERROR';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: unknown;

  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ServiceError';
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

export function notFoundError(message: string, details?: unknown): ServiceError {
  return new ServiceError('NOT_FOUND', message, details);
}

export function validationError(
  message: string,
  details?: unknown
): ServiceError {
  return new ServiceError('VALIDATION_ERROR', message, details);
}

export function conflictError(message: string, details?: unknown): ServiceError {
  return new ServiceError('CONFLICT', message, details);
}

export function invalidTransitionError(
  message: string,
  details?: unknown
): ServiceError {
  return new ServiceError('INVALID_TRANSITION', message, details);
}
