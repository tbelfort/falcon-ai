import path from 'node:path';
import { validationError } from '../core/services/errors.js';

export interface StringValidationOptions {
  minLength?: number;
  maxLength?: number;
  trim?: boolean;
}

export interface NumberValidationOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface StringArrayValidationOptions {
  maxLength?: number;
  maxItems?: number;
}

export interface JsonValidationOptions {
  maxDepth?: number;
  maxKeys?: number;
}

const DEFAULT_JSON_MAX_DEPTH = 6;
const DEFAULT_JSON_MAX_KEYS = 200;
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const STRING_LIMITS = {
  id: 64,
  projectName: 200,
  projectSlug: 100,
  projectDescription: 2000,
  repoUrl: 2000,
  defaultBranch: 100,
  issueTitle: 200,
  issueDescription: 5000,
  labelName: 100,
  labelDescription: 500,
  labelColor: 20,
  commentContent: 5000,
  commentAuthorName: 100,
  documentTitle: 200,
  documentFilePath: 500,
  documentContentHash: 128,
  documentCreatedBy: 100,
} as const;

export const ARRAY_LIMITS = {
  labelIds: 100,
} as const;

export const NUMBER_LIMITS = {
  documentVersionMax: 1_000_000,
} as const;

export function requireString(
  value: unknown,
  field: string,
  options: StringValidationOptions = {}
): string {
  if (typeof value !== 'string') {
    throw validationError(`${field} is required`, { field });
  }
  return normalizeString(value, field, { minLength: 1, ...options }, true);
}

export function optionalString(
  value: unknown,
  field: string,
  options: StringValidationOptions = {}
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const normalized = normalizeString(value, field, options, false);
  if (normalized.length === 0) {
    throw validationError(`${field} must not be empty`, { field });
  }
  return normalized;
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
  field: string,
  options: NumberValidationOptions = {}
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError(`${field} must be a number`, { field });
  }
  if (options.integer && !Number.isInteger(value)) {
    throw validationError(`${field} must be an integer`, { field });
  }
  if (options.min !== undefined && value < options.min) {
    throw validationError(`${field} must be at least ${options.min}`, { field });
  }
  if (options.max !== undefined && value > options.max) {
    throw validationError(`${field} must be at most ${options.max}`, { field });
  }
  return value;
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
  field: string,
  options: StringArrayValidationOptions = {}
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw validationError(`${field} must be an array`, { field });
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    throw validationError(`${field} is too large`, { field });
  }
  const invalid = value.find((item) => typeof item !== 'string' || item.length === 0);
  if (invalid) {
    throw validationError(`${field} must be an array of strings`, { field });
  }
  if (options.maxLength !== undefined) {
    const maxLength = options.maxLength;
    const tooLong = value.find((item) => item.length > maxLength);
    if (tooLong) {
      throw validationError(`${field} contains a string that is too long`, { field });
    }
  }
  return value as string[];
}

export function requireSafePath(
  value: unknown,
  field: string,
  options: StringValidationOptions = {}
): string {
  const pathValue = requireString(value, field, options);
  const normalized = pathValue.replace(/\\/g, '/');
  if (normalized.includes('\u0000')) {
    throw validationError(`${field} is invalid`, { field });
  }
  const parsed = path.posix.normalize(normalized);
  if (path.posix.isAbsolute(parsed)) {
    throw validationError(`${field} must be a relative path`, { field });
  }
  const segments = parsed.split('/');
  if (segments.includes('..')) {
    throw validationError(`${field} must not include '..' segments`, { field });
  }
  return normalized;
}

export function requireJsonObject(
  value: unknown,
  field: string,
  options: JsonValidationOptions = {}
): Record<string, unknown> {
  if (value === undefined || value === null) {
    throw validationError(`${field} is required`, { field });
  }
  if (!isPlainObject(value)) {
    throw validationError(`${field} must be an object`, { field });
  }
  validateJsonValue(value, field, options);
  return value as Record<string, unknown>;
}

export function optionalJsonObject(
  value: unknown,
  field: string,
  options: JsonValidationOptions = {}
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    throw validationError(`${field} must be an object`, { field });
  }
  if (!isPlainObject(value)) {
    throw validationError(`${field} must be an object`, { field });
  }
  validateJsonValue(value, field, options);
  return value as Record<string, unknown>;
}

function normalizeString(
  value: string,
  field: string,
  options: StringValidationOptions,
  requireNonEmpty: boolean
): string {
  const trim = options.trim ?? true;
  const normalized = trim ? value.trim() : value;
  if (requireNonEmpty && normalized.length === 0) {
    throw validationError(`${field} is required`, { field });
  }
  if (options.minLength !== undefined && normalized.length < options.minLength) {
    throw validationError(`${field} must be at least ${options.minLength} characters`, {
      field,
    });
  }
  if (options.maxLength !== undefined && normalized.length > options.maxLength) {
    throw validationError(`${field} must be at most ${options.maxLength} characters`, {
      field,
    });
  }
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateJsonValue(
  value: unknown,
  field: string,
  options: JsonValidationOptions,
  depth = 0,
  keyCount = { count: 0 }
): void {
  const maxDepth = options.maxDepth ?? DEFAULT_JSON_MAX_DEPTH;
  const maxKeys = options.maxKeys ?? DEFAULT_JSON_MAX_KEYS;
  if (depth > maxDepth) {
    throw validationError(`${field} is too deep`, { field });
  }

  if (value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateJsonValue(item, field, options, depth + 1, keyCount);
    }
    return;
  }

  if (typeof value === 'object') {
    if (!isPlainObject(value)) {
      throw validationError(`${field} must be a plain object`, { field });
    }
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        throw validationError(`${field} contains a forbidden key`, { field, key });
      }
      keyCount.count += 1;
      if (keyCount.count > maxKeys) {
        throw validationError(`${field} has too many keys`, { field });
      }
      validateJsonValue(nested, field, options, depth + 1, keyCount);
    }
    return;
  }

  if (typeof value === 'string') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw validationError(`${field} must contain finite numbers`, { field });
    }
    return;
  }
  if (typeof value === 'boolean') {
    return;
  }

  throw validationError(`${field} must be JSON-serializable`, { field });
}
