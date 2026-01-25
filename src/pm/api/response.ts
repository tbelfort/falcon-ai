import type { Response } from 'express';

import type { ApiResponse } from '../contracts/http.js';
import { statusForCode, toApiError } from './http-errors.js';
import type { Result } from '../core/services/types.js';

export function sendResult<T>(res: Response<ApiResponse<T>>, result: Result<T>): void {
  if (result.ok) {
    res.json({ data: result.value });
    return;
  }

  res
    .status(statusForCode(result.error.code))
    .json(toApiError(result.error.code, result.error.message, result.error.details));
}

export function sendValidationError(
  res: Response<ApiResponse<unknown>>,
  message: string,
  details?: unknown
): void {
  res.status(400).json(toApiError('VALIDATION_ERROR', message, details));
}
