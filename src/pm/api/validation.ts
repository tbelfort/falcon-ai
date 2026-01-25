import { PmError } from '../core/errors.js';

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PmError('VALIDATION_ERROR', `${field} is required`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new PmError('VALIDATION_ERROR', `${field} must be a string`);
  }
  return value;
}

export function optionalNullableString(
  value: unknown,
  field: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new PmError('VALIDATION_ERROR', `${field} must be a string`);
  }
  return value;
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new PmError('VALIDATION_ERROR', `${field} must be an array`);
  }
  const invalid = value.find((entry) => typeof entry !== 'string');
  if (invalid !== undefined) {
    throw new PmError('VALIDATION_ERROR', `${field} must be string[]`);
  }
  return value;
}

export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new PmError(
      'VALIDATION_ERROR',
      `${field} must be one of: ${allowed.join(', ')}`
    );
  }
  return value as T;
}

export function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new PmError('VALIDATION_ERROR', `${field} must be a number`);
  }
  return value;
}
