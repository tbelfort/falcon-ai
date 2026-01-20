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
  status: string;
}

export const projectCommand = new Command('project').description('Manage projects');

// falcon project list
projectCommand
  .command('list')
  .description('List projects in current workspace')
  .option('-w, --workspace <slug>', 'Specify workspace')
  .option('--all', 'Include archived projects')
  .action((options: { workspace?: string; all?: boolean }) => {
    const db = getDatabase();

    let workspaceId: string;
    if (options.workspace) {
      const workspace = db
        .prepare('SELECT * FROM workspaces WHERE slug = ?')
        .get(options.workspace) as Workspace | undefined;
      if (!workspace) {
        console.error(`Error: Workspace "${options.workspace}" not found.`);
        process.exit(1);
      }
      workspaceId = workspace.id;
    } else {
      try {
        const scope = resolveScope();
        workspaceId = scope.workspaceId;
      } catch (e) {
        if (e instanceof ScopeResolutionError) {
          console.error('Error: Not in an initialized project.');
          console.error('Use --workspace <slug> to specify a workspace.');
          process.exit(1);
        }
        throw e;
      }
    }

    const query = options.all
      ? 'SELECT * FROM projects WHERE workspace_id = ? ORDER BY name'
      : 'SELECT * FROM projects WHERE workspace_id = ? AND status = ? ORDER BY name';

    const projects = (
      options.all
        ? db.prepare(query).all(workspaceId)
        : db.prepare(query).all(workspaceId, 'active')
    ) as Project[];

    if (projects.length === 0) {
      console.log('No projects found in this workspace.');
      return;
    }

    console.log('Projects:\n');
    for (const proj of projects) {
      const status = proj.status === 'archived' ? ' (archived)' : '';
      console.log(`  ${proj.name}${status}`);
      console.log(`    ID: ${proj.id}`);
      console.log(`    Repo: ${proj.repo_origin_url}`);
      if (proj.repo_subdir) {
        console.log(`    Subdir: ${proj.repo_subdir}`);
      }
      console.log('');
    }
  });

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
