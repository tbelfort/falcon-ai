/**
 * falcon delete command.
 *
 * Deletes the current project and all associated data.
 * Requires double confirmation to prevent accidental deletion.
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { getDatabase } from '../../storage/db.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';
import { findConfigPath } from '../../config/loader.js';
import fs from 'fs';

interface Project {
  id: string;
  name: string;
  workspace_id: string;
}

export const deleteCommand = new Command('delete')
  .description('Delete the current project and all associated data')
  .option('--force', 'Skip confirmation prompts (dangerous)')
  .action(async (options: { force?: boolean }) => {
    // Resolve current project
    let scope;
    try {
      scope = resolveScope();
    } catch (e) {
      if (e instanceof ScopeResolutionError) {
        console.error('Error:', e.message);
        process.exit(1);
      }
      throw e;
    }

    const db = getDatabase();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(scope.projectId) as
      | Project
      | undefined;

    if (!project) {
      console.error('Error: Project not found in database.');
      process.exit(1);
    }

    console.log(`\nProject to delete: ${project.name}`);
    console.log(`  Workspace: ${scope.workspaceId}`);
    console.log(`  Project ID: ${project.id}`);
    console.log('');

    if (!options.force) {
      // First confirmation
      const confirm1 = await askQuestion(
        'Are you sure you want to delete this project? This will remove all patterns, occurrences, and data. (yes/no): '
      );

      if (confirm1.toLowerCase() !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
      }

      // Second confirmation - type project name
      console.log('');
      const confirm2 = await askQuestion(
        `To confirm, type the full project name "${project.name}": `
      );

      if (confirm2 !== project.name) {
        console.error('Project name does not match. Aborted.');
        process.exit(1);
      }
    }

    // Delete associated data (in order due to foreign keys)
    console.log('\nDeleting project data...');

    // Tables with project_id column - ordered for FK constraints
    // pattern_definitions must be deleted LAST since provisional_alerts and tagging_misses reference it
    const tables = [
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
    const ALLOWED_TABLES = new Set([
      'pattern_occurrences',
      'pattern_definitions',
      'execution_noncompliance',
      'doc_update_requests',
      'provisional_alerts',
      'injection_logs',
      'salience_issues',
      'tagging_misses',
      'kill_switch_status',
      'attribution_outcomes',
    ]);

    // Wrap deletions in a transaction for atomicity
    const deleteAll = db.transaction(() => {
      for (const table of tables) {
        if (!ALLOWED_TABLES.has(table)) {
          throw new Error(`Attempted deletion from unauthorized table: ${table}`);
        }
        const result = db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(project.id);
        if (result.changes > 0) {
          console.log(`  Deleted ${result.changes} rows from ${table}`);
        }
      }

      // Delete project record
      db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    });

    deleteAll();
    console.log('  Deleted project record');

    // Remove .falcon/config.yaml if it exists
    const configPath = findConfigPath();
    if (configPath && fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log(`  Removed ${configPath}`);
    }

    console.log('\nProject deleted successfully.');
    console.log('Note: Workspace was NOT deleted. Use "falcon workspace archive" if needed.');
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
