import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPmDb, closePmDb } from '../../../src/pm/db/connection.js';
import { migratePmDb } from '../../../src/pm/db/migrate.js';
import { seedPmDb } from '../../../src/pm/db/seed.js';
import { projects } from '../../../src/pm/db/schema.js';
import { DEFAULT_PRESET_NAME } from '../../../src/pm/core/presets.js';

function createTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pm-'));
  return path.join(dir, 'pm.db');
}

describe('pm db seed', () => {
  it('is idempotent for built-in labels', () => {
    const dbPath = createTempDbPath();
    const db = getPmDb(dbPath);
    migratePmDb(db);

    const projectId = 'project-seed-test';
    db.insert(projects)
      .values({
        id: projectId,
        name: 'Seed Project',
        slug: 'seed-project',
      })
      .run();

    seedPmDb(db);
    seedPmDb(db);

    const labelCount = db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM labels WHERE project_id = ${projectId}`
    );
    const presetCount = db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM model_presets WHERE name = ${DEFAULT_PRESET_NAME}`
    );

    expect(labelCount?.count ?? 0).toBe(11);
    expect(presetCount?.count ?? 0).toBe(1);

    closePmDb();
  });
});
