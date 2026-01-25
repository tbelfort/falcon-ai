import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './schema.js';
import { getPmDb } from './connection.js';

const fallbackMigrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);
const repoMigrationsFolder = path.resolve(
  process.cwd(),
  'src/pm/db/migrations'
);

function isValidMigrationsFolder(folder: string): boolean {
  try {
    const stat = fs.statSync(folder);
    if (!stat.isDirectory()) {
      return false;
    }
    const journal = path.join(folder, 'meta', '_journal.json');
    return fs.existsSync(journal);
  } catch {
    return false;
  }
}

function resolveMigrationsFolder(): string {
  if (isValidMigrationsFolder(repoMigrationsFolder)) {
    return repoMigrationsFolder;
  }
  if (isValidMigrationsFolder(fallbackMigrationsFolder)) {
    return fallbackMigrationsFolder;
  }
  throw new Error(
    `Migrations folder not found. Checked ${repoMigrationsFolder} and ${fallbackMigrationsFolder}.`
  );
}

const migrationsFolder = resolveMigrationsFolder();

export function migratePmDb(
  db: BetterSQLite3Database<typeof schema> = getPmDb()
): BetterSQLite3Database<typeof schema> {
  migrate(db, { migrationsFolder });
  return db;
}
