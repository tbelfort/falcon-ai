/**
 * falcon doctor command.
 *
 * Diagnostic command to verify Falcon installation and configuration.
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import { getDatabase, getDatabasePath } from '../../storage/db.js';
import { findConfigPath, parseConfig } from '../../config/loader.js';
import { resolveScope } from '../../config/scope-resolver.js';
import { checkBaselinesSeeded } from '../../storage/seed/baselines.js';

interface DoctorCheck {
  name: string;
  check: () => Promise<{ passed: boolean; message: string }>;
}

interface Workspace {
  name: string;
  status: string;
}

interface Project {
  name: string;
  status: string;
}

export const doctorCommand = new Command('doctor')
  .description('Verify Falcon installation and configuration')
  .action(async () => {
    const checks: DoctorCheck[] = [
      {
        name: 'Database accessible',
        check: async () => {
          const dbPath = getDatabasePath();
          if (fs.existsSync(dbPath)) {
            return { passed: true, message: dbPath };
          }
          // Try to create by accessing
          try {
            getDatabase();
            return { passed: true, message: dbPath };
          } catch {
            return { passed: false, message: 'Database not found. Run falcon init.' };
          }
        },
      },
      {
        name: 'Database writable',
        check: async () => {
          try {
            const db = getDatabase();
            db.exec('CREATE TABLE IF NOT EXISTS _health_check (id INTEGER)');
            db.exec('DROP TABLE IF EXISTS _health_check');
            return { passed: true, message: 'INSERT test succeeded' };
          } catch (e) {
            const error = e as Error;
            return { passed: false, message: `Database write failed: ${error.message}` };
          }
        },
      },
      {
        name: 'Config file valid',
        check: async () => {
          const configPath = findConfigPath();
          if (!configPath) {
            return { passed: false, message: '.falcon/config.yaml not found' };
          }
          try {
            parseConfig(configPath);
            return { passed: true, message: configPath };
          } catch (e) {
            const error = e as Error;
            return { passed: false, message: `Invalid YAML: ${error.message}` };
          }
        },
      },
      {
        name: 'Scope resolvable',
        check: async () => {
          try {
            const scope = resolveScope();
            return {
              passed: true,
              message: `workspace: ${scope.workspaceId.slice(0, 8)}, project: ${scope.projectId.slice(0, 8)}`,
            };
          } catch {
            return { passed: false, message: "Run 'falcon init' to configure this project" };
          }
        },
      },
      {
        name: 'Workspace exists',
        check: async () => {
          try {
            const scope = resolveScope();
            const db = getDatabase();
            const workspace = db
              .prepare('SELECT * FROM workspaces WHERE id = ?')
              .get(scope.workspaceId) as Workspace | undefined;
            if (workspace) {
              return { passed: true, message: `"${workspace.name}" (${workspace.status})` };
            }
            return { passed: false, message: 'Workspace not found in database' };
          } catch {
            return { passed: false, message: 'Could not check workspace' };
          }
        },
      },
      {
        name: 'Project exists',
        check: async () => {
          try {
            const scope = resolveScope();
            const db = getDatabase();
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(scope.projectId) as
              | Project
              | undefined;
            if (project) {
              return { passed: true, message: `"${project.name}" (${project.status})` };
            }
            return { passed: false, message: 'Project not found in database' };
          } catch {
            return { passed: false, message: 'Could not check project' };
          }
        },
      },
      {
        name: 'Git remote detected',
        check: async () => {
          try {
            const url = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
            return { passed: true, message: url };
          } catch {
            return { passed: false, message: 'No git remote configured' };
          }
        },
      },
      {
        name: 'Baselines seeded',
        check: async () => {
          try {
            const scope = resolveScope();
            const db = getDatabase();
            const { seeded, expected } = checkBaselinesSeeded(db, scope.workspaceId);
            if (seeded >= expected) {
              return { passed: true, message: `${seeded}/${expected} baseline principles` };
            }
            return {
              passed: false,
              message: `Only ${seeded}/${expected} baselines. Run falcon init --seed-baselines`,
            };
          } catch {
            return { passed: false, message: 'Could not check baselines' };
          }
        },
      },
    ];

    console.log('Falcon Health Check');
    console.log('===================\n');

    let failures = 0;
    for (const check of checks) {
      const result = await check.check();
      const icon = result.passed ? '\u2713' : '\u2717';
      console.log(`${icon} ${check.name.padEnd(22)} ${result.message}`);
      if (!result.passed) failures++;
    }

    console.log();
    if (failures === 0) {
      console.log('All checks passed!');
    } else {
      console.log(`${failures} check(s) failed. Run 'falcon init' to fix configuration issues.`);
      process.exit(1);
    }
  });
