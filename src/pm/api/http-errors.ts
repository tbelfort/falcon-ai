import type { ApiError } from '../contracts/http.js';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  AGENT_BUSY: 'AGENT_BUSY',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const ERROR_HTTP_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  AGENT_BUSY: 409,
  INVALID_TRANSITION: 400,
  INTERNAL_ERROR: 500,
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  if (error instanceof Error) {
    const message = error.message;
    const knownCodes = Object.values(ERROR_CODES) as readonly string[];
    if (knownCodes.includes(message)) {
      return {
        error: {
          code: message,
          message: message.toLowerCase().replace('_', ' '),
        },
      };
    }
    return {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: error.message,
      },
    };
  }
  return {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unknown error occurred',
    },
  };
}

export function getHttpStatus(code: string): number {
  return ERROR_HTTP_STATUS[code] || 500;
}