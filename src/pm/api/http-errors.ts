import type { ApiError } from '../contracts/http.js';
import {
  type ServiceErrorCode,
  isServiceError,
  ServiceError,
} from '../core/services/errors.js';

export type ApiErrorCode = ServiceErrorCode;

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export function toErrorResponse(error: unknown): {
  status: number;
  body: ApiError;
} {
  if (isServiceError(error)) {
    return {
      status: HTTP_STATUS_BY_CODE[error.code],
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Internal error';

  return {
    status: HTTP_STATUS_BY_CODE.INTERNAL_ERROR,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    },
  };
}

export function asServiceError(error: unknown): ServiceError {
  if (isServiceError(error)) {
    return error;
  }
  return new ServiceError('INTERNAL_ERROR', 'Internal error');
}
