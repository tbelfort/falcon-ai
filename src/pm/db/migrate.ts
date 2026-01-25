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
const migrationsFolder = fs.existsSync(repoMigrationsFolder)
  ? repoMigrationsFolder
  : fallbackMigrationsFolder;

export function migratePmDb(
  db: BetterSQLite3Database<typeof schema> = getPmDb()
): BetterSQLite3Database<typeof schema> {
  migrate(db, { migrationsFolder });
  return db;
}
