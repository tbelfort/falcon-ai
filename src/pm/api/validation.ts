import { validationError } from '../core/services/errors.js';

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`${field} is required`, { field });
  }
  return value;
}

export function optionalString(
  value: unknown,
  field: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw validationError(`${field} must be a string`, { field });
}

export function optionalBoolean(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw validationError(`${field} must be a boolean`, { field });
}

export function optionalNumber(
  value: unknown,
  field: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw validationError(`${field} must be a number`, { field });
}

export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw validationError(`${field} is invalid`, { field, allowed });
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }
  throw validationError(`${field} is invalid`, { field, allowed });
}

export function optionalStringArray(
  value: unknown,
  field: string
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw validationError(`${field} must be an array`, { field });
  }
  const invalid = value.find((item) => typeof item !== 'string');
  if (invalid) {
    throw validationError(`${field} must be an array of strings`, { field });
  }
  return value as string[];
}
