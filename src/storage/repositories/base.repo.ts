/**
 * Base repository pattern for data access.
 *
 * Provides common utilities for JSON field parsing, boolean conversion,
 * and database interaction patterns.
 */

import type { Database } from 'better-sqlite3';

/**
 * Abstract base repository with common utilities.
 */
export abstract class BaseRepository<_T = unknown> {
  constructor(protected db: Database) {}

  /**
   * Parse a JSON field from the database.
   * Returns an empty array if the value is null or invalid JSON.
   */
  protected parseJsonField<U>(value: string | null): U {
    if (!value) return [] as unknown as U;
    try {
      return JSON.parse(value);
    } catch {
      return [] as unknown as U;
    }
  }

  /**
   * Parse a JSON field that should return an object (not array) on failure.
   */
  protected parseJsonFieldObject<U>(value: string | null, defaultValue: U): U {
    if (!value) return defaultValue;
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Stringify a value for storage in a JSON field.
   */
  protected stringifyJsonField(value: unknown): string {
    return JSON.stringify(value ?? []);
  }

  /**
   * Convert a boolean to SQLite integer (0 or 1).
   */
  protected boolToInt(value: boolean): number {
    return value ? 1 : 0;
  }

  /**
   * Convert a SQLite integer to boolean.
   */
  protected intToBool(value: number | null): boolean {
    return value === 1;
  }

  /**
   * Convert a nullable SQLite integer to nullable boolean.
   */
  protected nullableIntToBool(value: number | null): boolean | null {
    if (value === null) return null;
    return value === 1;
  }

  /**
   * Get current ISO timestamp.
   */
  protected now(): string {
    return new Date().toISOString();
  }
}
