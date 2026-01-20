/**
 * falcon project commands.
 *
 * Manages projects: list, archive.
 */

import { Command } from 'commander';
import { getDatabase } from '../../storage/db.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Project {
  id: string;
  name: string;
  repo_origin_url: string;
  repo_subdir: string | null;
  repo_path: string | null;
  status: string;
}

interface ProjectWithWorkspace extends Project {
  workspace_name: string;
  workspace_slug: string;
}

export const projectCommand = new Command('project').description('Manage projects');

// Shared list function
function listProjects(options: { workspace?: string; all?: boolean }): void {
  const db = getDatabase();

  let workspaceId: string | null = null;
  let workspaceName: string | null = null;

  if (options.workspace) {
    const workspace = db
      .prepare('SELECT * FROM workspaces WHERE slug = ?')
      .get(options.workspace) as Workspace | undefined;
    if (!workspace) {
      console.error(`Error: Workspace "${options.workspace}" not found.`);
      process.exit(1);
    }
    workspaceId = workspace.id;
    workspaceName = workspace.name;
  } else {
    // Try to resolve scope, but don't fail if we can't
    try {
      const scope = resolveScope();
      workspaceId = scope.workspaceId;
      const workspace = db
        .prepare('SELECT name FROM workspaces WHERE id = ?')
        .get(workspaceId) as { name: string } | undefined;
      workspaceName = workspace?.name ?? null;
    } catch (e) {
      // Not in a project - list all projects across all workspaces
      if (e instanceof ScopeResolutionError) {
        workspaceId = null;
      } else {
        throw e;
      }
    }
  }

  let projects: ProjectWithWorkspace[];

  if (workspaceId) {
    const query = options.all
      ? 'SELECT p.*, w.name as workspace_name, w.slug as workspace_slug FROM projects p JOIN workspaces w ON p.workspace_id = w.id WHERE p.workspace_id = ? ORDER BY p.name'
      : 'SELECT p.*, w.name as workspace_name, w.slug as workspace_slug FROM projects p JOIN workspaces w ON p.workspace_id = w.id WHERE p.workspace_id = ? AND p.status = ? ORDER BY p.name';

    projects = (
      options.all
        ? db.prepare(query).all(workspaceId)
        : db.prepare(query).all(workspaceId, 'active')
    ) as ProjectWithWorkspace[];

    if (projects.length === 0) {
      console.log(`No projects found in workspace "${workspaceName ?? 'unknown'}".`);
      return;
    }
    console.log(`Projects in workspace "${workspaceName ?? 'unknown'}":\n`);
  } else {
    // List all projects across all workspaces
    const query = options.all
      ? 'SELECT p.*, w.name as workspace_name, w.slug as workspace_slug FROM projects p JOIN workspaces w ON p.workspace_id = w.id ORDER BY w.name, p.name'
      : 'SELECT p.*, w.name as workspace_name, w.slug as workspace_slug FROM projects p JOIN workspaces w ON p.workspace_id = w.id WHERE p.status = ? ORDER BY w.name, p.name';

    projects = (
      options.all ? db.prepare(query).all() : db.prepare(query).all('active')
    ) as ProjectWithWorkspace[];

    if (projects.length === 0) {
      console.log('No projects found.');
      console.log('Run "falcon init" in a git repository to create one.');
      return;
    }
    console.log('All projects:\n');
  }

  for (const proj of projects) {
    const status = proj.status === 'archived' ? ' (archived)' : '';
    console.log(`  ${proj.name}${status}`);
    console.log(`    ID: ${proj.id}`);
    if (!workspaceId) {
      console.log(`    Workspace: ${proj.workspace_name} (${proj.workspace_slug})`);
    }
    console.log(`    Repo: ${proj.repo_origin_url}`);
    if (proj.repo_subdir) {
      console.log(`    Subdir: ${proj.repo_subdir}`);
    }
    if (proj.repo_path) {
      console.log(`    Path: ${proj.repo_path}`);
    }
    console.log('');
  }
}

// falcon project list
projectCommand
  .command('list')
  .description('List projects (in current workspace, specified workspace, or all)')
  .option('-w, --workspace <slug>', 'Specify workspace')
  .option('--all', 'Include archived projects')
  .action(listProjects);

// falcon projects (alias for project list)
export const projectsCommand = new Command('projects')
  .description('List projects (alias for "project list")')
  .option('-w, --workspace <slug>', 'Specify workspace')
  .option('--all', 'Include archived projects')
  .action(listProjects);

// falcon project archive
projectCommand
  .command('archive')
  .description('Archive the current project (soft delete)')
  .action(() => {
    try {
      const scope = resolveScope();
      const db = getDatabase();
      const now = new Date().toISOString();

      db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(
        'archived',
        now,
        scope.projectId
      );

      console.log('Project archived.');
      console.log('Patterns and occurrences are preserved but excluded from queries.');
    } catch (e) {
      if (e instanceof ScopeResolutionError) {
        console.error('Error: Not in an initialized project.');
        process.exit(1);
      }
      throw e;
    }
  });
