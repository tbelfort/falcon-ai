import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPmDb, closePmDb } from '../../../src/pm/db/connection.js';
import { migratePmDb } from '../../../src/pm/db/migrate.js';

const REQUIRED_TABLES = [
  'projects',
  'issues',
  'labels',
  'issue_labels',
  'agents',
  'documents',
  'comments',
  'stage_messages',
  'workflow_runs',
  'model_presets',
  'pr_findings',
];

function createTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pm-'));
  return path.join(dir, 'pm.db');
}

describe('pm db migrations', () => {
  it('creates required tables', () => {
    const dbPath = createTempDbPath();
    const db = getPmDb(dbPath);
    migratePmDb(db);

    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table'`
    );
    const tableNames = rows.map((row) => row.name);

    for (const table of REQUIRED_TABLES) {
      expect(tableNames).toContain(table);
    }

    closePmDb();
  });
});
