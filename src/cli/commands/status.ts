/**
 * falcon status command.
 *
 * Shows current configuration and statistics.
 */

import { Command } from 'commander';
import { getDatabase } from '../../guardrail/storage/db.js';
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
}

interface Count {
  count: number;
}

export const statusCommand = new Command('status')
  .description('Show current configuration and statistics')
  .action(() => {
    try {
      const scope = resolveScope();
      const db = getDatabase();

      // Get workspace
      const workspace = db
        .prepare('SELECT * FROM workspaces WHERE id = ?')
        .get(scope.workspaceId) as Workspace;

      // Get project
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(scope.projectId) as
        | Project
        | undefined;

      console.log('Falcon AI Status\n');
      console.log('Workspace:');
      console.log(`  Name: ${workspace.name}`);
      console.log(`  Slug: ${workspace.slug}`);
      console.log(`  ID: ${workspace.id}`);
      console.log('');
      console.log('Project:');
      if (project) {
        console.log(`  Name: ${project.name}`);
        console.log(`  ID: ${project.id}`);
        console.log(`  Repo: ${project.repo_origin_url}`);
        if (project.repo_subdir) {
          console.log(`  Subdir: ${project.repo_subdir}`);
        }
      } else {
        console.log(`  ID: ${scope.projectId}`);
        console.log('  (Project record not found in database)');
      }
      console.log('');

      // Statistics
      const patternCount = db
        .prepare(
          'SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = ?'
        )
        .get(scope.workspaceId, scope.projectId, 'active') as Count;

      const occurrenceCount = db
        .prepare(
          'SELECT COUNT(*) as count FROM pattern_occurrences WHERE workspace_id = ? AND project_id = ?'
        )
        .get(scope.workspaceId, scope.projectId) as Count;

      const baselineCount = db
        .prepare(
          'SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = ? AND status = ?'
        )
        .get(scope.workspaceId, 'baseline', 'active') as Count;

      const derivedCount = db
        .prepare(
          'SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = ? AND status = ?'
        )
        .get(scope.workspaceId, 'derived', 'active') as Count;

      console.log('Statistics:');
      console.log(`  Patterns (this project): ${patternCount.count}`);
      console.log(`  Occurrences (this project): ${occurrenceCount.count}`);
      console.log(`  Baseline principles (workspace): ${baselineCount.count}`);
      console.log(`  Derived principles (workspace): ${derivedCount.count}`);
    } catch (e) {
      if (e instanceof ScopeResolutionError) {
        console.log('Falcon AI Status\n');
        console.log('Not initialized.');
        console.log('');
        console.log('Run "falcon init" in a git repository to get started.');
        console.log('Run "falcon workspace list" to see existing workspaces.');
        process.exit(0);
      }
      throw e;
    }
  });
