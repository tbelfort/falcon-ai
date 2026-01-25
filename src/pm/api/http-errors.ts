import type { Response } from 'express';
import type { ApiError } from '../contracts/http.js';
import type { ErrorCode, ServiceError } from '../core/errors.js';

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export function toHttpStatus(code: ErrorCode): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export function sendError(res: Response, error: ServiceError): Response<ApiError> {
  return res.status(toHttpStatus(error.code)).json({
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  });
}
