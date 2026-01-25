import type { ApiError } from '../contracts/http.js';
import type { ServiceErrorCode } from '../core/services/types.js';

export type ApiErrorCode = ServiceErrorCode;

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export function statusForCode(code: ApiErrorCode): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}

export function toApiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ApiError {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}
