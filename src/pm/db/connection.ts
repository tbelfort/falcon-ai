import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { getPmDbPath } from './paths.js';

/**
 * Single global connection cache.
 *
 * Rationale: better-sqlite3 is fully synchronous and Node.js is single-threaded,
 * so there's no concurrency between cache check and update. A single cached
 * connection is sufficient for CLI tools and single-process servers. The cache
 * is keyed by path to handle tests that use different temp databases.
 *
 * Constraints:
 * - Call closePmDb() after CLI commands and in test teardown
 * - If multi-process access is needed, each process gets its own connection
 * - WAL mode allows concurrent readers across processes
 */
let cachedSqlite: Database.Database | null = null;
let cachedDb: BetterSQLite3Database<typeof schema> | null = null;
let cachedPath: string | null = null;

function updateCache(
  dbPath: string,
  sqlite: Database.Database | null,
  db: BetterSQLite3Database<typeof schema> | null
): void {
  cachedSqlite = sqlite;
  cachedDb = db;
  cachedPath = dbPath;
}

function verifyDirectoryPermissions(dir: string): void {
  if (process.platform === 'win32') {
    return;
  }
  const mode = fs.statSync(dir).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error('Database directory permissions are too permissive.');
  }
}

function ensureDirectory(dbPath: string): void {
  if (dbPath === ':memory:') {
    return;
  }
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(dir, 0o700);
    verifyDirectoryPermissions(dir);
  }
}

function createDbFileIfMissing(dbPath: string): boolean {
  if (dbPath === ':memory:') {
    return false;
  }
  try {
    const fd = fs.openSync(dbPath, 'wx', 0o600); // Atomic create avoids TOCTOU races.
    fs.closeSync(fd);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
}

export function openPmSqlite(dbPath: string = getPmDbPath()): Database.Database {
  if (cachedSqlite && cachedPath === dbPath) {
    return cachedSqlite;
  }

  ensureDirectory(dbPath);
  createDbFileIfMissing(dbPath);

  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(dbPath);
    applyPragmas(sqlite);
  } catch (error) {
    if (sqlite) {
      sqlite.close();
    }
    throw error;
  }

  updateCache(dbPath, sqlite, null);
  return sqlite;
}

export function getPmDb(
  dbPath: string = getPmDbPath()
): BetterSQLite3Database<typeof schema> {
  if (cachedDb && cachedPath === dbPath) {
    return cachedDb;
  }
  const sqlite = openPmSqlite(dbPath);
  const db = drizzle(sqlite, { schema });
  updateCache(dbPath, sqlite, db);
  return db;
}

export function closePmDb(): void {
  if (cachedSqlite) {
    cachedSqlite.close();
  }
  cachedSqlite = null;
  cachedDb = null;
  cachedPath = null;
}
