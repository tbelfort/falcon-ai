/**
 * falcon workspace commands.
 *
 * Manages workspaces: list, create, archive, rename.
 */

import { Command } from 'commander';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { getDatabase } from '../../storage/db.js';
import { seedBaselines } from '../../storage/seed/baselines.js';

/**
 * Validate user-provided input strings.
 * Prevents empty values, overly long strings, and null byte injection.
 */
function validateInput(value: string, fieldName: string): void {
  if (!value || value.trim() === '') {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (value.length > 255) {
    throw new Error(`${fieldName} must be 255 characters or fewer`);
  }
  if (value.includes('\0')) {
    throw new Error(`${fieldName} cannot contain null bytes`);
  }
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface ProjectCount {
  count: number;
}

export const workspaceCommand = new Command('workspace').description('Manage workspaces');

// falcon workspace list
workspaceCommand
  .command('list')
  .description('List all workspaces')
  .option('--all', 'Include archived workspaces')
  .action((options: { all?: boolean }) => {
    const db = getDatabase();
    const query = options.all
      ? 'SELECT * FROM workspaces ORDER BY name'
      : 'SELECT * FROM workspaces WHERE status = ? ORDER BY name';

    const workspaces = (
      options.all ? db.prepare(query).all() : db.prepare(query).all('active')
    ) as Workspace[];

    if (workspaces.length === 0) {
      console.log('No workspaces found.');
      console.log('Run "falcon init" in a git repository to create one.');
      return;
    }

    console.log('Workspaces:\n');
    for (const ws of workspaces) {
      const status = ws.status === 'archived' ? ' (archived)' : '';
      console.log(`  ${ws.name} (${ws.slug})${status}`);
      console.log(`    ID: ${ws.id}`);

      // Count projects
      const projectCount = db
        .prepare('SELECT COUNT(*) as count FROM projects WHERE workspace_id = ? AND status = ?')
        .get(ws.id, 'active') as ProjectCount;
      console.log(`    Projects: ${projectCount.count}`);
      console.log('');
    }
  });

// falcon workspace create <name>
workspaceCommand
  .command('create <name>')
  .description('Create a new workspace')
  .option('-s, --slug <slug>', 'Custom URL-safe slug')
  .action((name: string, options: { slug?: string }) => {
    // Validate inputs
    try {
      validateInput(name, 'Workspace name');
      if (options.slug) {
        validateInput(options.slug, 'Custom slug');
      }
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    const db = getDatabase();
    const slug = options.slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Check uniqueness
    const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as
      | Workspace
      | undefined;
    if (existing) {
      console.error(`Error: Workspace with slug "${slug}" already exists.`);
      process.exit(1);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, name, slug, '{}', 'active', now, now);

    // Seed baseline principles for new workspace
    const seededCount = seedBaselines(db, id);

    console.log(`Created workspace: ${name} (${slug})`);
    console.log(`ID: ${id}`);
    console.log(`Seeded ${seededCount} baseline principles.`);
  });

// falcon workspace archive <slug>
workspaceCommand
  .command('archive <slug>')
  .description('Archive a workspace (soft delete)')
  .action((slug: string) => {
    const db = getDatabase();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as
      | Workspace
      | undefined;

    if (!workspace) {
      console.error(`Error: Workspace "${slug}" not found.`);
      process.exit(1);
    }

    if (workspace.status === 'archived') {
      console.log(`Workspace "${slug}" is already archived.`);
      return;
    }

    const now = new Date().toISOString();

    // Archive workspace
    db.prepare('UPDATE workspaces SET status = ?, updated_at = ? WHERE id = ?').run(
      'archived',
      now,
      workspace.id
    );

    // Archive all projects in workspace
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE workspace_id = ?').run(
      'archived',
      now,
      workspace.id
    );

    console.log(`Archived workspace: ${workspace.name} (${slug})`);
    console.log('All projects in this workspace have been archived.');
  });

// falcon workspace rename <old-slug> <new-slug>
workspaceCommand
  .command('rename <old-slug> <new-slug>')
  .description('Rename a workspace')
  .option('-n, --name <name>', 'Also update the display name')
  .action((oldSlug: string, newSlug: string, options: { name?: string }) => {
    // Validate inputs
    try {
      validateInput(newSlug, 'New slug');
      if (options.name) {
        validateInput(options.name, 'Display name');
      }
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    const db = getDatabase();

    // Check old workspace exists
    const workspace = db
      .prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
      .get(oldSlug, 'active') as Workspace | undefined;
    if (!workspace) {
      console.error(`Error: Workspace "${oldSlug}" not found or archived.`);
      process.exit(1);
    }

    // Check new slug not taken
    const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(newSlug) as
      | Workspace
      | undefined;
    if (existing) {
      console.error(`Error: Slug "${newSlug}" is already in use.`);
      process.exit(1);
    }

    // Update workspace
    const now = new Date().toISOString();
    const newName = options.name || workspace.name;

    db.prepare('UPDATE workspaces SET slug = ?, name = ?, updated_at = ? WHERE id = ?').run(
      newSlug,
      newName,
      now,
      workspace.id
    );

    console.log(`Renamed workspace: ${oldSlug} → ${newSlug}`);
    if (options.name) console.log(`Updated name: ${newName}`);

    // Update config.yaml in all projects belonging to this workspace
    interface ProjectRow {
      id: string;
      repo_path: string;
    }
    const projects = db.prepare(
      'SELECT id, repo_path FROM projects WHERE workspace_id = ? AND status = ?'
    ).all(workspace.id, 'active') as ProjectRow[];

    for (const project of projects) {
      const configPath = path.join(project.repo_path, '.falcon', 'config.yaml');
      if (fs.existsSync(configPath)) {
        try {
          const config = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
          config.workspace.slug = newSlug;
          if (options.name) config.workspace.name = newName;
          fs.writeFileSync(configPath, yaml.stringify(config));
          console.log(`  Updated ${configPath}`);
        } catch {
          console.warn(`  Warning: Could not update ${configPath}`);
        }
      }
    }
  });
