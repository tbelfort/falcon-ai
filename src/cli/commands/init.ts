/**
 * falcon init command.
 *
 * Initializes a project in the current directory.
 * Creates .falcon/config.yaml with workspace and project IDs.
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { randomUUID } from 'crypto';
import { getDatabase } from '../../storage/db.js';
import { canonicalizeGitUrl } from '../../config/url-utils.js';
import { seedBaselines } from '../../storage/seed/baselines.js';

interface InitOptions {
  workspace?: string;
  name?: string;
  yes?: boolean;
}

interface ExistingProject {
  workspace_name: string;
  workspace_slug: string;
  name: string;
}

interface Workspace {
  id: string;
  slug: string;
  name: string;
}

export const initCommand = new Command('init')
  .description('Initialize falcon-ai in the current repository')
  .option('-w, --workspace <slug>', 'Use existing workspace (by slug)')
  .option('-n, --name <name>', 'Project name (defaults to repo name)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options: InitOptions) => {
    // STEP 1: Validate we're in a git repo
    const gitRoot = findGitRoot();
    if (!gitRoot) {
      console.error('Error: Not in a git repository.');
      console.error('Run this command from within a git repository.');
      process.exit(1);
    }

    // STEP 2: Check if already initialized
    const configPath = path.join(gitRoot, '.falcon', 'config.yaml');
    if (fs.existsSync(configPath)) {
      console.error('Error: This project is already initialized.');
      console.error(`Config exists at: ${configPath}`);
      console.error('Run "falcon status" to see current configuration.');
      process.exit(1);
    }

    // STEP 3: Get repo identity
    const repoOriginUrl = getGitRemoteOrigin();
    if (!repoOriginUrl) {
      console.error('Error: No git remote "origin" found.');
      console.error('Add a remote with: git remote add origin <url>');
      process.exit(1);
    }

    const canonicalUrl = canonicalizeGitUrl(repoOriginUrl);
    const repoSubdir = getRepoSubdir(gitRoot);
    const projectName = options.name || path.basename(gitRoot);

    // STEP 4: Check for duplicate registration
    const db = getDatabase();
    const existingProject = db
      .prepare(
        `
      SELECT p.*, w.slug as workspace_slug, w.name as workspace_name
      FROM projects p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE p.repo_origin_url = ? AND (p.repo_subdir = ? OR (p.repo_subdir IS NULL AND ? IS NULL))
    `
      )
      .get(canonicalUrl, repoSubdir, repoSubdir) as ExistingProject | undefined;

    if (existingProject) {
      console.error('Error: This repository is already registered.');
      console.error(
        `  Workspace: ${existingProject.workspace_name} (${existingProject.workspace_slug})`
      );
      console.error(`  Project: ${existingProject.name}`);
      console.error('');
      console.error('To re-initialize, first run: falcon project delete');
      process.exit(1);
    }

    // STEP 5: Resolve or create workspace
    let workspaceId: string;
    let workspaceSlug: string;
    let workspaceName: string;

    if (options.workspace) {
      // Use existing workspace
      const workspace = db
        .prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
        .get(options.workspace, 'active') as Workspace | undefined;

      if (!workspace) {
        console.error(`Error: Workspace "${options.workspace}" not found or archived.`);
        console.error('Run "falcon workspace list" to see available workspaces.');
        process.exit(1);
      }

      workspaceId = workspace.id;
      workspaceSlug = workspace.slug;
      workspaceName = workspace.name;
    } else {
      // Create new workspace (auto-generate)
      const defaultSlug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      workspaceSlug = defaultSlug;
      workspaceName = projectName;
      workspaceId = randomUUID();

      // Check slug uniqueness
      const existingWorkspace = db
        .prepare('SELECT * FROM workspaces WHERE slug = ?')
        .get(workspaceSlug) as Workspace | undefined;

      if (existingWorkspace) {
        // Append random suffix
        workspaceSlug = `${defaultSlug}-${randomUUID().slice(0, 4)}`;
      }

      const now = new Date().toISOString();
      db.prepare(
        `
        INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(workspaceId, workspaceName, workspaceSlug, '{}', 'active', now, now);

      // Seed baseline principles for new workspace
      const seededCount = seedBaselines(db, workspaceId);
      console.log(`Created workspace: ${workspaceName} (${workspaceSlug})`);
      console.log(`Seeded ${seededCount} baseline principles.`);
    }

    // STEP 6: Create project
    const projectId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO projects (
        id, workspace_id, name, repo_origin_url, repo_subdir, repo_path,
        config, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      projectId,
      workspaceId,
      projectName,
      canonicalUrl,
      repoSubdir || null,
      gitRoot,
      '{}',
      'active',
      now,
      now
    );

    console.log(`Created project: ${projectName}`);

    // STEP 7: Write config file
    const falconDir = path.join(gitRoot, '.falcon');
    if (!fs.existsSync(falconDir)) {
      fs.mkdirSync(falconDir, { recursive: true });
    }

    const config = {
      version: '1.0',
      workspaceId,
      projectId,
      workspace: {
        slug: workspaceSlug,
        name: workspaceName,
      },
      project: {
        name: projectName,
      },
    };

    fs.writeFileSync(configPath, yaml.stringify(config));
    console.log(`\nCreated ${configPath}`);

    // STEP 8: Suggest .gitignore update
    const gitignorePath = path.join(gitRoot, '.gitignore');
    const gitignoreEntry = '.falcon/';

    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes(gitignoreEntry)) {
        console.log(`\nNote: Consider adding "${gitignoreEntry}" to .gitignore`);
      }
    } else {
      console.log(`\nNote: Consider creating .gitignore and adding "${gitignoreEntry}"`);
    }

    console.log('\nInitialization complete!');
    console.log('Run "falcon status" to verify configuration.');
  });

function findGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function getGitRemoteOrigin(): string | null {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function getRepoSubdir(gitRoot: string): string | null {
  const cwd = process.cwd();
  if (cwd === gitRoot) return null;
  return path.relative(gitRoot, cwd) || null;
}
