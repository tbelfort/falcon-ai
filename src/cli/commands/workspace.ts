/**
 * falcon workspace commands.
 *
 * Manages workspaces: list, show, create, archive, rename, delete.
 */

import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { getDatabase } from '../../guardrail/storage/db.js';
import { seedBaselines } from '../../guardrail/storage/seed/baselines.js';

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

/**
 * Validate slug format.
 * Must contain only lowercase alphanumeric, underscores, and hyphens.
 * Must contain at least one alphanumeric character.
 */
function validateSlug(slug: string, fieldName: string): void {
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error(`${fieldName} must contain only lowercase letters, numbers, underscores, and hyphens`);
  }
  if (!/[a-z0-9]/.test(slug)) {
    throw new Error(`${fieldName} must contain at least one alphanumeric character`);
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

interface Project {
  id: string;
  name: string;
  repo_origin_url: string;
  repo_subdir: string | null;
  repo_path: string | null;
  status: string;
}

export const workspaceCommand = new Command('workspace').description('Manage workspaces');

// Shared list function
function listWorkspaces(options: { all?: boolean }): void {
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
}

// falcon workspace list
workspaceCommand
  .command('list')
  .description('List all workspaces')
  .option('--all', 'Include archived workspaces')
  .action(listWorkspaces);

// falcon workspaces (alias for workspace list)
export const workspacesCommand = new Command('workspaces')
  .description('List all workspaces (alias for "workspace list")')
  .option('--all', 'Include archived workspaces')
  .action(listWorkspaces);

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
    const slug = options.slug || name.toLowerCase().replace(/[^a-z0-9_]/g, '-');

    // Validate slug format
    try {
      validateSlug(slug, options.slug ? 'Custom slug' : 'Generated slug');
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

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

// falcon workspace rename <slug> <new-name>
workspaceCommand
  .command('rename <slug> <new-name>')
  .description('Rename a workspace (updates both name and slug)')
  .option('-s, --slug <slug>', 'Custom slug (defaults to slug derived from name)')
  .action((slug: string, newName: string, options: { slug?: string }) => {
    // Validate inputs
    try {
      validateInput(newName, 'New name');
      if (options.slug) {
        validateInput(options.slug, 'Custom slug');
      }
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    const db = getDatabase();

    // Check workspace exists
    const workspace = db
      .prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
      .get(slug, 'active') as Workspace | undefined;
    if (!workspace) {
      console.error(`Error: Workspace "${slug}" not found or archived.`);
      process.exit(1);
    }

    // Derive new slug from name (or use custom slug)
    const newSlug = options.slug || newName.toLowerCase().replace(/[^a-z0-9_]/g, '-');

    // Validate slug format
    try {
      validateSlug(newSlug, options.slug ? 'Custom slug' : 'Generated slug');
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    // Check new slug not taken (unless it's the same workspace)
    if (newSlug !== workspace.slug) {
      const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(newSlug) as
        | Workspace
        | undefined;
      if (existing) {
        console.error(`Error: Slug "${newSlug}" is already in use.`);
        process.exit(1);
      }
    }

    // Update workspace
    const now = new Date().toISOString();

    db.prepare('UPDATE workspaces SET slug = ?, name = ?, updated_at = ? WHERE id = ?').run(
      newSlug,
      newName,
      now,
      workspace.id
    );

    console.log(`Renamed workspace: "${workspace.name}" → "${newName}"`);
    console.log(`  Slug: ${workspace.slug} → ${newSlug}`);

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
          config.workspace.name = newName;
          fs.writeFileSync(configPath, yaml.stringify(config));
          console.log(`  Updated ${configPath}`);
        } catch {
          console.warn(`  Warning: Could not update ${configPath}`);
        }
      }
    }
  });

// falcon workspace show <slug>
workspaceCommand
  .command('show <slug>')
  .description('Show workspace details and all projects')
  .option('--all', 'Include archived projects')
  .action((slug: string, options: { all?: boolean }) => {
    const db = getDatabase();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as
      | Workspace
      | undefined;

    if (!workspace) {
      console.error(`Error: Workspace "${slug}" not found.`);
      process.exit(1);
    }

    console.log(`\nWorkspace: ${workspace.name}`);
    console.log(`  Slug: ${workspace.slug}`);
    console.log(`  ID: ${workspace.id}`);
    console.log(`  Status: ${workspace.status}`);
    console.log('');

    // Get projects
    const query = options.all
      ? 'SELECT * FROM projects WHERE workspace_id = ? ORDER BY name'
      : 'SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY name';

    const projects = (
      options.all
        ? db.prepare(query).all(workspace.id)
        : db.prepare(query).all(workspace.id, 'active')
    ) as Project[];

    if (projects.length === 0) {
      console.log('No projects in this workspace.');
      return;
    }

    console.log(`Projects (${projects.length}):\n`);
    for (const proj of projects) {
      const status = proj.status === 'archived' ? ' (archived)' : '';
      console.log(`  ${proj.name}${status}`);
      console.log(`    ID: ${proj.id}`);
      console.log(`    Repo: ${proj.repo_origin_url}`);
      if (proj.repo_subdir) {
        console.log(`    Subdir: ${proj.repo_subdir}`);
      }
      if (proj.repo_path) {
        console.log(`    Path: ${proj.repo_path}`);
      }
      console.log('');
    }
  });

// falcon workspace delete <slug>
workspaceCommand
  .command('delete <slug>')
  .description('Delete a workspace and all its projects permanently')
  .option('--force', 'Skip confirmation prompts (dangerous)')
  .action(async (slug: string, options: { force?: boolean }) => {
    const db = getDatabase();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as
      | Workspace
      | undefined;

    if (!workspace) {
      console.error(`Error: Workspace "${slug}" not found.`);
      process.exit(1);
    }

    // Get project count
    const projectCount = db
      .prepare('SELECT COUNT(*) as count FROM projects WHERE workspace_id = ?')
      .get(workspace.id) as ProjectCount;

    console.log(`\nWorkspace to delete: ${workspace.name} (${workspace.slug})`);
    console.log(`  ID: ${workspace.id}`);
    console.log(`  Projects: ${projectCount.count}`);
    console.log('');

    if (!options.force) {
      // First confirmation
      const confirm1 = await askQuestion(
        'Are you sure you want to delete this workspace? This will permanently remove the workspace, ALL projects, and ALL associated data. (yes/no): '
      );

      if (confirm1.toLowerCase() !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
      }

      // Second confirmation - type workspace name
      console.log('');
      const confirm2 = await askQuestion(
        `To confirm, type the full workspace name "${workspace.name}": `
      );

      if (confirm2 !== workspace.name) {
        console.error('Workspace name does not match. Aborted.');
        process.exit(1);
      }
    }

    console.log('\nDeleting workspace data...');

    // Tables with project_id column - ordered for FK constraints
    const projectTables = [
      'pattern_occurrences',
      'execution_noncompliance',
      'doc_update_requests',
      'provisional_alerts',
      'injection_logs',
      'salience_issues',
      'tagging_misses',
      'kill_switch_status',
      'attribution_outcomes',
      'pattern_definitions',
    ];

    // Whitelist validation for defense-in-depth
    const ALLOWED_PROJECT_TABLES = new Set(projectTables);

    // Wrap deletions in a transaction for atomicity
    const deleteAll = db.transaction(() => {
      // Get all projects in workspace
      const projects = db
        .prepare('SELECT id, repo_path FROM projects WHERE workspace_id = ?')
        .all(workspace.id) as { id: string; repo_path: string | null }[];

      // Delete data for each project
      for (const project of projects) {
        for (const table of projectTables) {
          if (!ALLOWED_PROJECT_TABLES.has(table)) {
            throw new Error(`Attempted deletion from unauthorized table: ${table}`);
          }
          // SECURITY: Table names are compile-time constants from `projectTables` array above.
          // Whitelist validation is defense-in-depth. Do NOT pass user input here.
          db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(project.id);
        }
      }

      // Delete all projects
      const projectResult = db
        .prepare('DELETE FROM projects WHERE workspace_id = ?')
        .run(workspace.id);
      if (projectResult.changes > 0) {
        console.log(`  Deleted ${projectResult.changes} project(s)`);
      }

      // Delete workspace-level data
      const principleResult = db
        .prepare('DELETE FROM derived_principles WHERE workspace_id = ?')
        .run(workspace.id);
      if (principleResult.changes > 0) {
        console.log(`  Deleted ${principleResult.changes} derived principles`);
      }

      // Delete workspace record
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspace.id);
      console.log('  Deleted workspace record');

      // Return project paths for config cleanup
      return projects.map((p) => p.repo_path).filter((p): p is string => p !== null);
    });

    const projectPaths = deleteAll();

    // Remove .falcon/config.yaml from each project directory
    for (const projectPath of projectPaths) {
      const configPath = path.join(projectPath, '.falcon', 'config.yaml');
      if (fs.existsSync(configPath)) {
        try {
          fs.unlinkSync(configPath);
          console.log(`  Removed ${configPath}`);
        } catch {
          console.warn(`  Warning: Could not remove ${configPath}`);
        }
      }
    }

    console.log('\nWorkspace deleted successfully.');
  });

function askQuestion(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
