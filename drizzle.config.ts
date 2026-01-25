import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';
import {
  hasTraversalSegments,
  isSystemDirectory,
  isWindowsUncPath,
  resolvePathForValidation,
} from './src/pm/db/path-validation.js';

function validateDatabasePath(rawPath: string): string {
  if (process.platform === 'win32' && isWindowsUncPath(rawPath)) {
    throw new Error('DATABASE_URL must not be a UNC path.');
  }
  if (!path.isAbsolute(rawPath)) {
    throw new Error('DATABASE_URL must resolve to an absolute path.');
  }
  if (hasTraversalSegments(rawPath)) {
    throw new Error('DATABASE_URL must not include ".." path segments.');
  }
  const resolved = resolvePathForValidation(rawPath);
  if (isSystemDirectory(resolved)) {
    throw new Error('DATABASE_URL must not point into a system directory.');
  }
  return resolved;
}

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (!envUrl) {
    return `file:${path.join(os.homedir(), '.falcon', 'pm.db')}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(envUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid file: URL.');
  }
  if (parsed.protocol !== 'file:') {
    throw new Error('DATABASE_URL must use the file: scheme.');
  }
  if (hasTraversalSegments(parsed.pathname)) {
    throw new Error('DATABASE_URL must not include ".." path segments.');
  }
  const dbPath = fileURLToPath(parsed);
  const validatedPath = validateDatabasePath(dbPath);
  return `file:${validatedPath}`;
}

export default defineConfig({
  out: './src/pm/db/migrations',
  schema: './src/pm/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
