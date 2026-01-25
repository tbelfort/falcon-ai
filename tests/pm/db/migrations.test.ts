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

const REQUIRED_COLUMNS: Record<string, string[]> = {
  projects: ['id', 'slug', 'created_at'],
  issues: ['id', 'project_id', 'stage'],
  labels: ['id', 'project_id', 'name'],
  issue_labels: ['issue_id', 'label_id'],
  agents: ['id', 'agent_type', 'model'],
  documents: ['id', 'doc_type', 'file_path'],
  comments: ['id', 'issue_id', 'content'],
  stage_messages: ['id', 'from_stage', 'to_stage'],
  workflow_runs: ['id', 'issue_id', 'status'],
  model_presets: ['id', 'name', 'config'],
  pr_findings: ['id', 'issue_id', 'message'],
};

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

    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const rows = db.all<{ name: string }>(
        sql`PRAGMA table_info(${sql.identifier(table)})`
      );
      const columnNames = rows.map((row) => row.name);
      for (const column of columns) {
        expect(columnNames).toContain(column);
      }
    }

    closePmDb();
  });
});
