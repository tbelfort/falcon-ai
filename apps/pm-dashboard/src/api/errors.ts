import { ApiClientError } from './client';

export const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError';
};

export const getErrorMessage = (error: unknown) => {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred';
};
