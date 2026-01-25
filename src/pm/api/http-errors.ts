import type { ApiError } from '../contracts/http.js';
import { PmError, type ErrorCode } from '../core/errors.js';

const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export interface HttpErrorPayload {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function toHttpError(err: unknown): HttpErrorPayload {
  if (err instanceof PmError) {
    return {
      status: HTTP_STATUS_BY_CODE[err.code],
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  if (err instanceof Error) {
    return {
      status: HTTP_STATUS_BY_CODE.INTERNAL_ERROR,
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal error',
    };
  }

  return {
    status: HTTP_STATUS_BY_CODE.INTERNAL_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Internal error',
  };
}

export function toApiErrorResponse(err: unknown): {
  status: number;
  body: ApiError;
} {
  const payload = toHttpError(err);
  return {
    status: payload.status,
    body: {
      error: {
        code: payload.code,
        message: payload.message,
        details: payload.details,
      },
    },
  };
}
