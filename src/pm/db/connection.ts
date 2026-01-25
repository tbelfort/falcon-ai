import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { getPmDbPath } from './paths.js';

let cachedSqlite: Database.Database | null = null;
let cachedDb: BetterSQLite3Database<typeof schema> | null = null;
let cachedPath: string | null = null;

function ensureDirectory(dbPath: string): void {
  if (dbPath === ':memory:') {
    return;
  }
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function createDbFileIfMissing(dbPath: string): boolean {
  if (dbPath === ':memory:') {
    return false;
  }
  try {
    const fd = fs.openSync(dbPath, 'wx', 0o600);
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

  cachedSqlite = sqlite;
  cachedDb = null;
  cachedPath = dbPath;
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
  cachedDb = db;
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
