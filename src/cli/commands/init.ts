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
import { randomUUID, createHash } from 'crypto';
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
    const repoSubdir = getRepoSubdir(gitRoot);
    const projectName = options.name || path.basename(gitRoot);

    // Validate project name
    try {
      validateInput(projectName, 'Project name');
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }

    // Determine canonical URL - use remote if available, otherwise generate local identifier
    let canonicalUrl: string;

    if (repoOriginUrl) {
      canonicalUrl = canonicalizeGitUrl(repoOriginUrl);
    } else {
      // No remote - generate local identifier from absolute path
      const pathHash = createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
      canonicalUrl = `local:${pathHash}`;

      console.log('');
      console.log('Note: No git remote found. Using local-only mode.');
      console.log('');
      console.log('  Falcon-ai is currently single-developer per project.');
      console.log('  All pattern data is stored locally on this machine.');
      console.log('  If you add a remote later, run "falcon init" again to update.');
      console.log('');
    }

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
      const defaultSlug = projectName.toLowerCase().replace(/[^a-z0-9_]/g, '-');
      workspaceSlug = defaultSlug;
      workspaceName = projectName;
      workspaceId = randomUUID();

      // Check slug uniqueness
      const existingWorkspace = db
        .prepare('SELECT * FROM workspaces WHERE slug = ?')
        .get(workspaceSlug) as Workspace | undefined;

      if (existingWorkspace) {
        // Append random suffix (8 chars for better collision resistance)
        workspaceSlug = `${defaultSlug}-${randomUUID().slice(0, 8)}`;
      }

      // Validate generated slug
      try {
        validateSlug(workspaceSlug, 'Generated workspace slug');
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        console.error('Try providing a project name with alphanumeric characters.');
        process.exit(1);
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

    // STEP 8: Install CORE files
    const packageRoot = path.resolve(import.meta.dirname, '../../..');
    const coreSource = path.join(packageRoot, 'CORE');

    // Copy to .falcon/CORE/
    copyDirRecursive(path.join(coreSource, 'TASKS'), path.join(falconDir, 'CORE', 'TASKS'));
    copyDirRecursive(
      path.join(coreSource, 'TEMPLATES'),
      path.join(falconDir, 'CORE', 'TEMPLATES')
    );
    copyDirRecursive(path.join(coreSource, 'ROLES'), path.join(falconDir, 'CORE', 'ROLES'));

    // Copy to .claude/
    const claudeDir = path.join(gitRoot, '.claude');
    copyDirRecursive(path.join(coreSource, 'commands'), path.join(claudeDir, 'commands'));
    copyDirRecursive(path.join(coreSource, 'agents'), path.join(claudeDir, 'agents'));

    console.log('Installed CORE files to .falcon/ and .claude/');

    // STEP 8.5: Install Claude Code hooks for automatic warning injection
    installClaudeHooks(claudeDir);

    // STEP 9: Suggest .gitignore update
    const gitignorePath = path.join(gitRoot, '.gitignore');
    const gitignoreEntries = ['.falcon/', '.claude/commands/', '.claude/agents/', '.claude/settings.json'];

    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      const missing = gitignoreEntries.filter((entry) => !gitignore.includes(entry));
      if (missing.length > 0) {
        console.log(`\nNote: Consider adding to .gitignore:`);
        for (const entry of missing) {
          console.log(`  ${entry}`);
        }
      }
    } else {
      console.log(`\nNote: Consider creating .gitignore and adding:`);
      for (const entry of gitignoreEntries) {
        console.log(`  ${entry}`);
      }
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

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install Claude Code hooks for automatic warning injection.
 *
 * Creates or updates .claude/settings.json with UserPromptSubmit hook
 * that calls `falcon inject --format claude-hook`.
 */
function installClaudeHooks(claudeDir: string): void {
  const settingsPath = path.join(claudeDir, 'settings.json');

  // Define the Falcon injection hook
  const falconHook = {
    type: 'command',
    command: 'falcon inject --format claude-hook 2>/dev/null || true',
  };

  // Load existing settings or create new
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Invalid JSON, start fresh
      settings = {};
    }
  }

  // Get or create hooks configuration
  let hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks || typeof hooks !== 'object') {
    hooks = {};
  }

  // Get or create UserPromptSubmit hooks array
  let userPromptHooks = hooks.UserPromptSubmit as unknown[];
  if (!Array.isArray(userPromptHooks)) {
    userPromptHooks = [];
  }

  // Check if falcon hook already exists
  const hasFalconHook = userPromptHooks.some((hook) => {
    if (typeof hook === 'object' && hook !== null) {
      const h = hook as Record<string, unknown>;
      // Check both top-level command and nested hooks array
      if (h.command && typeof h.command === 'string' && h.command.includes('falcon inject')) {
        return true;
      }
      if (Array.isArray(h.hooks)) {
        return h.hooks.some((inner) => {
          if (typeof inner === 'object' && inner !== null) {
            const i = inner as Record<string, unknown>;
            return i.command && typeof i.command === 'string' && i.command.includes('falcon inject');
          }
          return false;
        });
      }
    }
    return false;
  });

  if (!hasFalconHook) {
    // Add the hook wrapped in a hooks array (Claude Code format)
    userPromptHooks.push({
      hooks: [falconHook],
    });
    hooks.UserPromptSubmit = userPromptHooks;
    settings.hooks = hooks;

    // Write updated settings
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Installed Claude Code hook for automatic warning injection.');
  } else {
    console.log('Claude Code hook already configured.');
  }
}
