# Phase 0: Bootstrap and Configuration

**Parent Document:** `specs/spec-pattern-attribution-v1.0.md`
**Dependencies:** None (this is the starting point)
**Outputs Required By:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5

---

## npm Dependencies

> **Research Document:** [`ai_docs/phase-0-dependencies.md`](../../ai_docs/phase-0-dependencies.md)

| Package | Version | Purpose | Key Notes |
|---------|---------|---------|-----------|
| commander | ^14.0.0 | CLI framework | Use `parseAsync()` for async handlers; requires Node.js v20+ |
| better-sqlite3 | ^11.0.0 | SQLite database | Enable WAL mode + foreign_keys pragma; requires Node.js v22 LTS |
| yaml | ^2.8.0 | Config file parsing | Validate parsed data with Zod; single-document only |
| zod | ^4.3.0 | Schema validation | Use `safeParse()` for user input; requires TS 5.5+ |

**Note:** The `uuid` package has been replaced with native `crypto.randomUUID()` (3x faster, zero dependencies).

```typescript
// Replace uuid imports with native crypto
import { randomUUID } from 'crypto';
const id = randomUUID();
```

---

## 1. Overview

This phase establishes the CLI tool, database initialization, and workspace/project registration flows. It answers the critical question: **"How does the system know which workspace/project it's operating in?"**

Without Phase 0, all other phases fail because:
- No database exists to store patterns
- No workspace/project identity for scoped operations
- No way to resolve scope at runtime

---

## 2. Deliverables Checklist

- [ ] `package.json` - CLI package configuration with `bin` entry
- [ ] `src/cli/index.ts` - CLI entry point (commander.js)
- [ ] `src/cli/commands/init.ts` - `falcon init` command
- [ ] `src/cli/commands/workspace.ts` - Workspace management commands
- [ ] `src/cli/commands/project.ts` - Project management commands
- [ ] `src/cli/commands/status.ts` - `falcon status` command
- [ ] `src/cli/commands/doctor.ts` - `falcon doctor` command
- [ ] `src/config/loader.ts` - Configuration file loader
- [ ] `src/config/scope-resolver.ts` - Runtime scope resolution
- [ ] `src/storage/db.ts` - Database initialization (shared with Phase 1)
- [ ] `tests/cli/*.test.ts` - CLI command tests
- [ ] `tests/config/*.test.ts` - Config loader tests

---

## 3. Installation

### 3.1 Package Structure

```json
// package.json
{
  "name": "falcon-ai",
  "version": "0.1.0",
  "description": "Pattern-based guardrail system for multi-agent development",
  "bin": {
    "falcon": "./dist/cli/index.js"
  },
  "files": [
    "dist/**/*"
  ],
  "scripts": {
    "build": "tsc",
    "postinstall": "node ./dist/cli/postinstall.js"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "commander": "^11.0.0",
    "yaml": "^2.3.0",
    "zod": "^3.22.0"
  }
}
```

### 3.2 Global Installation

```bash
# Install globally
npm install -g falcon-ai

# Verify installation
falcon --version
falcon --help
```

### 3.3 Post-Install Hook

```typescript
// File: src/cli/postinstall.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

const FALCON_DIR = path.join(os.homedir(), '.falcon-ai');
const DB_DIR = path.join(FALCON_DIR, 'db');

// Create directories if they don't exist
if (!fs.existsSync(FALCON_DIR)) {
  fs.mkdirSync(FALCON_DIR, { recursive: true });
  console.log(`Created ${FALCON_DIR}`);
}

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`Created ${DB_DIR}`);
}

console.log('falcon-ai installed successfully.');
console.log('Run "falcon init" in a git repository to get started.');
```

---

## 4. CLI Commands

### 4.1 Entry Point

```typescript
// File: src/cli/index.ts
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { workspaceCommand } from './commands/workspace';
import { projectCommand } from './commands/project';
import { statusCommand } from './commands/status';

const program = new Command();

program
  .name('falcon')
  .description('Pattern-based guardrail system for multi-agent development')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(workspaceCommand);
program.addCommand(projectCommand);
program.addCommand(statusCommand);

program.parse();
```

### 4.2 `falcon init` Command

Initializes a project in the current directory. Creates `.falcon/config.yaml` with workspace and project IDs.

```typescript
// File: src/cli/commands/init.ts
import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { randomUUID } from 'crypto';
import { getDatabase } from '../../storage/db';
import { canonicalizeGitUrl } from '../../config/url-utils';
import { seedBaselines } from '../../storage/seed/baselines';

interface InitOptions {
  workspace?: string;  // Existing workspace slug
  name?: string;       // Project name override
  yes?: boolean;       // Skip confirmation
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
    const existingProject = db.prepare(`
      SELECT p.*, w.slug as workspace_slug, w.name as workspace_name
      FROM projects p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE p.repo_origin_url = ? AND (p.repo_subdir = ? OR (p.repo_subdir IS NULL AND ? IS NULL))
    `).get(canonicalUrl, repoSubdir, repoSubdir);

    if (existingProject) {
      console.error('Error: This repository is already registered.');
      console.error(`  Workspace: ${existingProject.workspace_name} (${existingProject.workspace_slug})`);
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
      const workspace = db.prepare(
        'SELECT * FROM workspaces WHERE slug = ? AND status = ?'
      ).get(options.workspace, 'active');

      if (!workspace) {
        console.error(`Error: Workspace "${options.workspace}" not found or archived.`);
        console.error('Run "falcon workspace list" to see available workspaces.');
        process.exit(1);
      }

      workspaceId = workspace.id;
      workspaceSlug = workspace.slug;
      workspaceName = workspace.name;
    } else {
      // Create new workspace (interactive or auto)
      const defaultSlug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      workspaceSlug = defaultSlug;
      workspaceName = projectName;
      workspaceId = randomUUID();

      // Check slug uniqueness
      const existingWorkspace = db.prepare(
        'SELECT * FROM workspaces WHERE slug = ?'
      ).get(workspaceSlug);

      if (existingWorkspace) {
        // Append random suffix
        workspaceSlug = `${defaultSlug}-${randomUUID().slice(0, 4)}`;
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(workspaceId, workspaceName, workspaceSlug, '{}', 'active', now, now);

      // Seed baseline principles for new workspace
      const seededCount = seedBaselines(db, workspaceId);
      console.log(`Created workspace: ${workspaceName} (${workspaceSlug})`);
      console.log(`Seeded ${seededCount} baseline principles.`);
    }

    // STEP 6: Create project
    const projectId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO projects (
        id, workspace_id, name, repo_origin_url, repo_subdir, repo_path,
        config, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
        name: workspaceName
      },
      project: {
        name: projectName
      }
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
```

### 4.3 `falcon workspace` Commands

```typescript
// File: src/cli/commands/workspace.ts
import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { getDatabase } from '../../storage/db';
import { seedBaselines } from '../../storage/seed/baselines';

export const workspaceCommand = new Command('workspace')
  .description('Manage workspaces');

// falcon workspace list
workspaceCommand
  .command('list')
  .description('List all workspaces')
  .option('--all', 'Include archived workspaces')
  .action((options) => {
    const db = getDatabase();
    const query = options.all
      ? 'SELECT * FROM workspaces ORDER BY name'
      : 'SELECT * FROM workspaces WHERE status = ? ORDER BY name';

    const workspaces = options.all
      ? db.prepare(query).all()
      : db.prepare(query).all('active');

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
      const projectCount = db.prepare(
        'SELECT COUNT(*) as count FROM projects WHERE workspace_id = ? AND status = ?'
      ).get(ws.id, 'active').count;
      console.log(`    Projects: ${projectCount}`);
      console.log('');
    }
  });

// falcon workspace create <name>
workspaceCommand
  .command('create <name>')
  .description('Create a new workspace')
  .option('-s, --slug <slug>', 'Custom URL-safe slug')
  .action((name: string, options) => {
    const db = getDatabase();
    const slug = options.slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Check uniqueness
    const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug);
    if (existing) {
      console.error(`Error: Workspace with slug "${slug}" already exists.`);
      process.exit(1);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, '{}', 'active', now, now);

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
    const workspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug);

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
    db.prepare(
      'UPDATE workspaces SET status = ?, updated_at = ? WHERE id = ?'
    ).run('archived', now, workspace.id);

    // Archive all projects in workspace
    db.prepare(
      'UPDATE projects SET status = ?, updated_at = ? WHERE workspace_id = ?'
    ).run('archived', now, workspace.id);

    console.log(`Archived workspace: ${workspace.name} (${slug})`);
    console.log('All projects in this workspace have been archived.');
  });
```

### 4.4 `falcon project` Commands

```typescript
// File: src/cli/commands/project.ts
import { Command } from 'commander';
import { getDatabase } from '../../storage/db';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver';

export const projectCommand = new Command('project')
  .description('Manage projects');

// falcon project list
projectCommand
  .command('list')
  .description('List projects in current workspace')
  .option('-w, --workspace <slug>', 'Specify workspace')
  .option('--all', 'Include archived projects')
  .action((options) => {
    const db = getDatabase();

    let workspaceId: string;
    if (options.workspace) {
      const workspace = db.prepare(
        'SELECT * FROM workspaces WHERE slug = ?'
      ).get(options.workspace);
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

    const projects = options.all
      ? db.prepare(query).all(workspaceId)
      : db.prepare(query).all(workspaceId, 'active');

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

      db.prepare(
        'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?'
      ).run('archived', now, scope.projectId);

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
```

### 4.5 `falcon status` Command

```typescript
// File: src/cli/commands/status.ts
import { Command } from 'commander';
import { getDatabase } from '../../storage/db';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver';

export const statusCommand = new Command('status')
  .description('Show current configuration and statistics')
  .action(() => {
    try {
      const scope = resolveScope();
      const db = getDatabase();

      // Get workspace
      const workspace = db.prepare(
        'SELECT * FROM workspaces WHERE id = ?'
      ).get(scope.workspaceId);

      // Get project
      const project = db.prepare(
        'SELECT * FROM projects WHERE id = ?'
      ).get(scope.projectId);

      console.log('Falcon AI Status\n');
      console.log('Workspace:');
      console.log(`  Name: ${workspace.name}`);
      console.log(`  Slug: ${workspace.slug}`);
      console.log(`  ID: ${workspace.id}`);
      console.log('');
      console.log('Project:');
      console.log(`  Name: ${project.name}`);
      console.log(`  ID: ${project.id}`);
      console.log(`  Repo: ${project.repo_origin_url}`);
      if (project.repo_subdir) {
        console.log(`  Subdir: ${project.repo_subdir}`);
      }
      console.log('');

      // Statistics
      const patternCount = db.prepare(
        'SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = ?'
      ).get(scope.workspaceId, scope.projectId, 'active').count;

      const occurrenceCount = db.prepare(
        'SELECT COUNT(*) as count FROM pattern_occurrences WHERE workspace_id = ? AND project_id = ?'
      ).get(scope.workspaceId, scope.projectId).count;

      const baselineCount = db.prepare(
        'SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = ? AND status = ?'
      ).get(scope.workspaceId, 'baseline', 'active').count;

      const derivedCount = db.prepare(
        'SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = ? AND status = ?'
      ).get(scope.workspaceId, 'derived', 'active').count;

      console.log('Statistics:');
      console.log(`  Patterns (this project): ${patternCount}`);
      console.log(`  Occurrences (this project): ${occurrenceCount}`);
      console.log(`  Baseline principles (workspace): ${baselineCount}`);
      console.log(`  Derived principles (workspace): ${derivedCount}`);

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
```

### 4.6 `falcon doctor`

Diagnostic command to verify Falcon installation and configuration.

**Usage:**
```bash
falcon doctor
```

**Checks performed:**

| Check | Description | Pass Criteria |
|-------|-------------|---------------|
| Database accessible | Can connect to `~/.falcon-ai/db/falcon.db` | File exists and readable |
| Database writable | Can write to database | INSERT succeeds |
| Config file valid | `.falcon/config.yaml` is valid YAML | Parses without error |
| Scope resolvable | Can resolve workspaceId and projectId | Both IDs found |
| Workspace exists | workspaceId maps to existing workspace | Row found in workspaces table |
| Project exists | projectId maps to existing project | Row found in projects table |
| Git remote detected | Can read git remote origin URL | `git remote get-url origin` succeeds |
| Baselines seeded | Baseline principles exist for workspace | 11 baselines found |

**Output format:**
```
Falcon Health Check
===================

✓ Database accessible     ~/.falcon-ai/db/falcon.db
✓ Database writable       INSERT test succeeded
✓ Config file valid       .falcon/config.yaml
✓ Scope resolvable        workspace: abc123, project: def456
✓ Workspace exists        "My Team" (active)
✓ Project exists          "falcon-api" (active)
✓ Git remote detected     git@github.com:org/repo.git
✓ Baselines seeded        11/11 baseline principles

All checks passed!
```

**Error output example:**
```
Falcon Health Check
===================

✓ Database accessible     ~/.falcon-ai/db/falcon.db
✓ Database writable       INSERT test succeeded
✗ Config file valid       .falcon/config.yaml not found
✗ Scope resolvable        Run 'falcon init' to configure this project

2 checks failed. Run 'falcon init' to fix configuration issues.
```

**Implementation:**

```typescript
interface DoctorCheck {
  name: string;
  check: () => Promise<{ passed: boolean; message: string }>;
}

async function runDoctor(): Promise<void> {
  const checks: DoctorCheck[] = [
    {
      name: 'Database accessible',
      check: async () => {
        const dbPath = path.join(os.homedir(), '.falcon-ai', 'db', 'falcon.db');
        if (fs.existsSync(dbPath)) {
          return { passed: true, message: dbPath };
        }
        return { passed: false, message: 'Database not found. Run falcon init.' };
      }
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
          return { passed: false, message: `Database write failed: ${e.message}` };
        }
      }
    },
    {
      name: 'Config file valid',
      check: async () => {
        const configPath = findConfigFile();
        if (!configPath) {
          return { passed: false, message: '.falcon/config.yaml not found' };
        }
        try {
          const config = parseConfig(configPath);
          return { passed: true, message: configPath };
        } catch (e) {
          return { passed: false, message: `Invalid YAML: ${e.message}` };
        }
      }
    },
    {
      name: 'Scope resolvable',
      check: async () => {
        try {
          const scope = await resolveScope();
          return {
            passed: true,
            message: `workspace: ${scope.workspaceId.slice(0, 8)}, project: ${scope.projectId.slice(0, 8)}`
          };
        } catch (e) {
          return { passed: false, message: "Run 'falcon init' to configure this project" };
        }
      }
    },
    {
      name: 'Workspace exists',
      check: async () => {
        try {
          const scope = await resolveScope();
          const workspace = workspaceRepo.findById(scope.workspaceId);
          if (workspace) {
            return { passed: true, message: `"${workspace.name}" (${workspace.status})` };
          }
          return { passed: false, message: 'Workspace not found in database' };
        } catch {
          return { passed: false, message: 'Could not check workspace' };
        }
      }
    },
    {
      name: 'Project exists',
      check: async () => {
        try {
          const scope = await resolveScope();
          const project = projectRepo.findById({ workspaceId: scope.workspaceId, id: scope.projectId });
          if (project) {
            return { passed: true, message: `"${project.name}" (${project.status})` };
          }
          return { passed: false, message: 'Project not found in database' };
        } catch {
          return { passed: false, message: 'Could not check project' };
        }
      }
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
      }
    },
    {
      name: 'Baselines seeded',
      check: async () => {
        try {
          const scope = await resolveScope();
          const baselines = principleRepo.findActive({
            workspaceId: scope.workspaceId,
            origin: 'baseline'
          });
          const count = baselines.length;
          if (count >= 11) {
            return { passed: true, message: `${count}/11 baseline principles` };
          }
          return { passed: false, message: `Only ${count}/11 baselines. Run falcon init --seed-baselines` };
        } catch {
          return { passed: false, message: 'Could not check baselines' };
        }
      }
    }
  ];

  console.log('Falcon Health Check');
  console.log('===================\n');

  let failures = 0;
  for (const check of checks) {
    const result = await check.check();
    const icon = result.passed ? '✓' : '✗';
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
}
```

---

## 5. Configuration

### 5.1 Config File Structure

```yaml
# .falcon/config.yaml
version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

# Human-readable metadata (informational)
workspace:
  slug: "platform-team"
  name: "Platform Team"
project:
  name: "falcon-api"

# Optional: Linear integration
linear:
  projectId: "PRJ-123"
  teamId: "TEAM-456"

# Optional: Override default settings
settings:
  maxInjectedWarnings: 6
  crossProjectWarningsEnabled: false
```

### 5.2 Config Loader

```typescript
// File: src/config/loader.ts
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.string(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspace: z.object({
    slug: z.string(),
    name: z.string()
  }).optional(),
  project: z.object({
    name: z.string()
  }).optional(),
  linear: z.object({
    projectId: z.string().optional(),
    teamId: z.string().optional()
  }).optional(),
  settings: z.object({
    maxInjectedWarnings: z.number().int().positive().optional(),
    crossProjectWarningsEnabled: z.boolean().optional()
  }).optional()
});

export type FalconConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath: string): FalconConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content);

  return ConfigSchema.parse(parsed);
}

export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = startDir;

  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, '.falcon', 'config.yaml');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    dir = path.dirname(dir);
  }

  return null;
}
```

### 5.3 Scope Resolver

```typescript
// File: src/config/scope-resolver.ts
import { findConfigPath, loadConfig } from './loader';
import { canonicalizeGitUrl } from './url-utils';
import { getDatabase } from '../storage/db';
import { execSync } from 'child_process';

export class ScopeResolutionError extends Error {
  constructor(message: string, public readonly reason: 'no_config' | 'no_remote' | 'not_registered') {
    super(message);
    this.name = 'ScopeResolutionError';
  }
}

export interface ResolvedScope {
  workspaceId: string;
  projectId: string;
}

/**
 * Resolve scope following the policy in Section 1.9 of the main spec:
 * 1. Check .falcon/config.yaml (authoritative)
 * 2. Check environment variables (for CI)
 * 3. Lookup by git remote origin URL
 */
export function resolveScope(): ResolvedScope {
  // STEP 1: Check for config file
  const configPath = findConfigPath();
  if (configPath) {
    const config = loadConfig(configPath);
    return {
      workspaceId: config.workspaceId,
      projectId: config.projectId
    };
  }

  // STEP 2: Check environment variables
  const envWorkspaceId = process.env.FALCON_WORKSPACE_ID;
  const envProjectId = process.env.FALCON_PROJECT_ID;
  if (envWorkspaceId && envProjectId) {
    return {
      workspaceId: envWorkspaceId,
      projectId: envProjectId
    };
  }

  // STEP 3: Lookup by git remote
  let repoOriginUrl: string;
  try {
    repoOriginUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    throw new ScopeResolutionError(
      'No .falcon/config.yaml found and no git remote origin.',
      'no_remote'
    );
  }

  const canonicalUrl = canonicalizeGitUrl(repoOriginUrl);
  const repoSubdir = getRepoSubdir();

  const db = getDatabase();
  const project = db.prepare(`
    SELECT * FROM projects
    WHERE repo_origin_url = ?
      AND (repo_subdir = ? OR (repo_subdir IS NULL AND ? IS NULL))
      AND status = ?
  `).get(canonicalUrl, repoSubdir, repoSubdir, 'active');

  if (!project) {
    throw new ScopeResolutionError(
      'Repository not registered. Run "falcon init" to initialize.',
      'not_registered'
    );
  }

  return {
    workspaceId: project.workspace_id,
    projectId: project.id
  };
}

function getRepoSubdir(): string | null {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    const cwd = process.cwd();
    if (cwd === gitRoot) return null;
    return require('path').relative(gitRoot, cwd) || null;
  } catch {
    return null;
  }
}
```

### 5.4 URL Canonicalization

```typescript
// File: src/config/url-utils.ts

/**
 * Canonicalize git URLs to a consistent format.
 *
 * Handles:
 * - SSH: git@github.com:org/repo.git
 * - HTTPS: https://github.com/org/repo.git
 * - Trailing slashes
 * - .git suffix normalization
 *
 * Output format: github.com/org/repo (no protocol, no .git)
 */
export function canonicalizeGitUrl(url: string): string {
  let normalized = url.trim();

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '');

  // Convert SSH to canonical form
  // git@github.com:org/repo -> github.com/org/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Convert HTTPS to canonical form
  // https://github.com/org/repo -> github.com/org/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  // Already canonical or unknown format - return as-is
  return normalized;
}

/**
 * Check if two git URLs refer to the same repository.
 */
export function gitUrlsEqual(url1: string, url2: string): boolean {
  return canonicalizeGitUrl(url1) === canonicalizeGitUrl(url2);
}
```

---

## 6. Database Initialization

Database initialization creates **ALL** tables needed by the entire system. This ensures `falcon status` and other commands work immediately after `falcon init`, without waiting for Phase 1.

```typescript
// File: src/storage/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';

const FALCON_DIR = path.join(os.homedir(), '.falcon-ai');
const DB_DIR = path.join(FALCON_DIR, 'db');
const DB_PATH = path.join(DB_DIR, 'falcon.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directories exist
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 20000');

    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  // Complete database schema for all phases
  // Phase 0 creates ALL tables so commands like `falcon status` work immediately
  db.exec(`
    -- ============================================
    -- CORE TABLES (Phase 0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      repo_path TEXT,
      repo_origin_url TEXT NOT NULL,
      repo_subdir TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_identity
      ON projects(workspace_id, repo_origin_url, repo_subdir);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    -- ============================================
    -- PATTERN TABLES (Phase 1 data, Phase 2 writes)
    -- ============================================

    CREATE TABLE IF NOT EXISTS pattern_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      pattern_content TEXT NOT NULL,
      failure_mode TEXT NOT NULL CHECK (failure_mode IN ('incorrect', 'incomplete', 'missing_reference', 'ambiguous', 'conflict_unresolved', 'synthesis_drift')),
      finding_category TEXT NOT NULL CHECK (finding_category IN ('security', 'correctness', 'testing', 'compliance', 'decisions')),
      severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      severity_max TEXT NOT NULL CHECK (severity_max IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      alternative TEXT NOT NULL,
      consequence_class TEXT,
      carrier_stage TEXT NOT NULL CHECK (carrier_stage IN ('context-pack', 'spec')),
      primary_carrier_quote_type TEXT NOT NULL CHECK (primary_carrier_quote_type IN ('verbatim', 'paraphrase', 'inferred')),
      technologies TEXT NOT NULL DEFAULT '[]',
      task_types TEXT NOT NULL DEFAULT '[]',
      touches TEXT NOT NULL DEFAULT '[]',
      aligned_baseline_id TEXT REFERENCES derived_principles(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_scope_key
      ON pattern_definitions(workspace_id, project_id, pattern_key);
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON pattern_definitions(status);
    CREATE INDEX IF NOT EXISTS idx_patterns_carrier_stage ON pattern_definitions(carrier_stage);
    CREATE INDEX IF NOT EXISTS idx_patterns_finding_category ON pattern_definitions(finding_category);
    CREATE INDEX IF NOT EXISTS idx_patterns_workspace ON pattern_definitions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_patterns_project ON pattern_definitions(project_id);

    CREATE TABLE IF NOT EXISTS pattern_occurrences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      evidence TEXT NOT NULL,
      carrier_fingerprint TEXT NOT NULL,
      origin_fingerprint TEXT,
      provenance_chain TEXT NOT NULL DEFAULT '[]',
      carrier_excerpt_hash TEXT NOT NULL,
      origin_excerpt_hash TEXT,
      was_injected INTEGER NOT NULL DEFAULT 0,
      was_adhered_to INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      inactive_reason TEXT CHECK (inactive_reason IS NULL OR inactive_reason IN ('superseded_doc', 'pattern_archived', 'false_positive')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_occurrences_pattern_id ON pattern_occurrences(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_issue_id ON pattern_occurrences(issue_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_status ON pattern_occurrences(status);
    CREATE INDEX IF NOT EXISTS idx_occurrences_workspace ON pattern_occurrences(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_project ON pattern_occurrences(project_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_created_at ON pattern_occurrences(created_at);

    -- ============================================
    -- PRINCIPLE TABLES (Phase 1 data, Phase 3 reads)
    -- ============================================

    CREATE TABLE IF NOT EXISTS derived_principles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      principle TEXT NOT NULL,
      rationale TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('baseline', 'derived')),
      derived_from TEXT,
      external_refs TEXT,
      inject_into TEXT NOT NULL CHECK (inject_into IN ('context-pack', 'spec', 'both')),
      touches TEXT NOT NULL DEFAULT '[]',
      technologies TEXT,
      task_types TEXT,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES derived_principles(id),
      promotion_key TEXT,
      archived_reason TEXT,
      archived_at TEXT,
      archived_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_principles_status ON derived_principles(status);
    CREATE INDEX IF NOT EXISTS idx_principles_origin ON derived_principles(origin);
    CREATE INDEX IF NOT EXISTS idx_principles_workspace ON derived_principles(workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_principles_promotion_key ON derived_principles(workspace_id, promotion_key) WHERE promotion_key IS NOT NULL;

    -- ============================================
    -- NONCOMPLIANCE & DOC UPDATE TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS execution_noncompliance (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      violated_guidance_stage TEXT NOT NULL CHECK (violated_guidance_stage IN ('context-pack', 'spec')),
      violated_guidance_location TEXT NOT NULL,
      violated_guidance_excerpt TEXT NOT NULL,
      possible_causes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_noncompliance_workspace ON execution_noncompliance(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_project ON execution_noncompliance(project_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_issue ON execution_noncompliance(issue_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_created_at ON execution_noncompliance(created_at);

    CREATE TABLE IF NOT EXISTS doc_update_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      finding_category TEXT NOT NULL,
      scout_type TEXT NOT NULL,
      target_doc TEXT NOT NULL,
      update_type TEXT NOT NULL CHECK (update_type IN ('add_decision', 'clarify_guidance', 'fix_error', 'add_constraint')),
      decision_class TEXT,
      description TEXT NOT NULL,
      suggested_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
      completed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_doc_updates_status ON doc_update_requests(status);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_workspace ON doc_update_requests(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_project ON doc_update_requests(project_id);

    -- ============================================
    -- INJECTION & TRACKING TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS tagging_misses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      actual_task_profile TEXT NOT NULL,
      required_match TEXT NOT NULL,
      missing_tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('broadened_pattern', 'improved_extraction', 'false_positive')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tagging_misses_status ON tagging_misses(status);
    CREATE INDEX IF NOT EXISTS idx_tagging_misses_pattern ON tagging_misses(pattern_id);

    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      issue_id TEXT NOT NULL,
      target TEXT NOT NULL CHECK (target IN ('context-pack', 'spec')),
      injected_patterns TEXT NOT NULL DEFAULT '[]',
      injected_principles TEXT NOT NULL DEFAULT '[]',
      injected_alerts TEXT NOT NULL DEFAULT '[]',
      task_profile TEXT NOT NULL,
      injected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_injection_logs_issue_id ON injection_logs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_workspace ON injection_logs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_project ON injection_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_target ON injection_logs(target);

    -- ============================================
    -- PROVISIONAL ALERT & SALIENCE TABLES (v1.0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS provisional_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      message TEXT NOT NULL,
      touches TEXT NOT NULL DEFAULT '[]',
      inject_into TEXT NOT NULL CHECK (inject_into IN ('context-pack', 'spec', 'both')),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'promoted')),
      promoted_to_pattern_id TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_status ON provisional_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_expires_at ON provisional_alerts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_workspace ON provisional_alerts(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_project ON provisional_alerts(project_id);

    CREATE TABLE IF NOT EXISTS salience_issues (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      guidance_location_hash TEXT NOT NULL,
      guidance_stage TEXT NOT NULL CHECK (guidance_stage IN ('context-pack', 'spec')),
      guidance_location TEXT NOT NULL,
      guidance_excerpt TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      window_days INTEGER NOT NULL DEFAULT 30,
      noncompliance_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('reformatted', 'moved_earlier', 'false_positive')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_salience_issues_hash ON salience_issues(workspace_id, project_id, guidance_location_hash);
    CREATE INDEX IF NOT EXISTS idx_salience_issues_status ON salience_issues(status);

    -- ============================================
    -- KILL SWITCH TABLES (v1.0)
    -- ============================================

    CREATE TABLE IF NOT EXISTS kill_switch_status (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'INFERRED_PAUSED', 'FULLY_PAUSED')),
      reason TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attribution_outcomes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('pattern_created', 'pattern_updated', 'noncompliance', 'doc_update', 'provisional_alert', 'skipped_kill_switch', 'error')),
      carrier_quote_type TEXT CHECK (carrier_quote_type IN ('verbatim', 'paraphrase', 'inferred')),
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_workspace ON attribution_outcomes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_created_at ON attribution_outcomes(created_at);
    CREATE INDEX IF NOT EXISTS idx_attribution_outcomes_outcome ON attribution_outcomes(outcome);
  `);
}
```

---

## 6.1 Baseline Seeding

When a workspace is created, the 11 baseline principles (B01-B11) must be seeded. This ensures `falcon doctor` passes and the injection system has foundational guardrails available immediately.

```typescript
// File: src/storage/seed/baselines.ts
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

interface BaselinePrinciple {
  principle: string;
  rationale: string;
  touches: string[];
  externalRefs?: string[];
}

const BASELINE_PRINCIPLES: BaselinePrinciple[] = [
  {
    principle: 'Always use parameterized queries for SQL. Never interpolate user input into query strings.',
    rationale: 'Prevents SQL injection, the most common and dangerous database vulnerability.',
    touches: ['database', 'user_input'],
    externalRefs: ['CWE-89']
  },
  {
    principle: 'Validate, sanitize, and bound all external input before processing. Reject unexpected types, formats, and sizes.',
    rationale: 'Prevents injection attacks, type confusion, and DoS via malformed input.',
    touches: ['user_input'],
    externalRefs: ['CWE-20']
  },
  {
    principle: 'Never log secrets, credentials, API keys, or PII. Redact or omit sensitive fields.',
    rationale: 'Prevents credential leakage through log aggregation and monitoring systems.',
    touches: ['logging', 'auth'],
    externalRefs: ['CWE-532']
  },
  {
    principle: 'Require explicit authorization checks before sensitive operations. Never rely on implicit permissions.',
    rationale: 'Prevents privilege escalation and unauthorized access to protected resources.',
    touches: ['auth', 'authz'],
    externalRefs: ['CWE-862']
  },
  {
    principle: 'Set timeouts on all network calls. No unbounded waits.',
    rationale: 'Prevents resource exhaustion and cascading failures from slow/unresponsive services.',
    touches: ['network']
  },
  {
    principle: 'Implement retry with exponential backoff, jitter, and maximum attempt limits.',
    rationale: 'Prevents retry storms and allows graceful degradation during outages.',
    touches: ['network']
  },
  {
    principle: 'Use idempotency keys for operations that cannot be safely retried.',
    rationale: 'Prevents duplicate processing and data corruption during network retries.',
    touches: ['network', 'database']
  },
  {
    principle: 'Enforce size limits and rate limits on user-provided data and requests.',
    rationale: 'Prevents DoS attacks and resource exhaustion from malicious or buggy clients.',
    touches: ['user_input', 'api'],
    externalRefs: ['CWE-400']
  },
  {
    principle: 'Require migration plan with rollback strategy for all schema changes.',
    rationale: 'Prevents data loss and enables recovery from failed deployments.',
    touches: ['schema']
  },
  {
    principle: 'Define error contract (status codes, error shapes, error codes) before implementation.',
    rationale: 'Ensures consistent error handling across the system and clear client expectations.',
    touches: ['api']
  },
  {
    principle: "Use least-privilege credentials for DB/service access. Don't run migrations/ops with app runtime creds. Scope tokens tightly.",
    rationale: 'Reduces blast radius of credential compromise and limits damage from bugs.',
    touches: ['database', 'auth', 'config'],
    externalRefs: ['CWE-250']
  }
];

/**
 * Seed baseline principles for a workspace.
 * Idempotent: skips already-existing baselines.
 * @returns Number of baselines created (0 if all already exist)
 */
export function seedBaselines(db: Database.Database, workspaceId: string): number {
  const now = new Date().toISOString();
  let seeded = 0;

  const insertStmt = db.prepare(`
    INSERT INTO derived_principles (
      id, workspace_id, principle, rationale, origin, external_refs,
      inject_into, touches, confidence, status, permanent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkStmt = db.prepare(`
    SELECT id FROM derived_principles
    WHERE workspace_id = ? AND principle = ? AND origin = 'baseline'
  `);

  for (const baseline of BASELINE_PRINCIPLES) {
    // Check if already exists
    const existing = checkStmt.get(workspaceId, baseline.principle);
    if (existing) continue;

    insertStmt.run(
      randomUUID(),
      workspaceId,
      baseline.principle,
      baseline.rationale,
      'baseline',
      baseline.externalRefs ? JSON.stringify(baseline.externalRefs) : null,
      'both',
      JSON.stringify(baseline.touches),
      0.9,  // High confidence for baselines
      'active',
      1,    // permanent = true
      now,
      now
    );
    seeded++;
  }

  return seeded;
}

/**
 * Check if baselines are seeded for a workspace.
 */
export function checkBaselinesSeeded(db: Database.Database, workspaceId: string): { seeded: number; expected: number } {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM derived_principles
    WHERE workspace_id = ? AND origin = 'baseline' AND status = 'active'
  `).get(workspaceId) as { count: number };

  return {
    seeded: result.count,
    expected: BASELINE_PRINCIPLES.length
  };
}
```

---

## 7. Acceptance Criteria

### 7.1 Installation

- [ ] `npm install -g falcon-ai` completes without errors
- [ ] `~/.falcon-ai/` directory is created
- [ ] `falcon --version` outputs version number
- [ ] `falcon --help` shows all commands

### 7.2 Initialization

- [ ] `falcon init` in a non-git directory fails with clear error
- [ ] `falcon init` in git repo without remote fails with clear error
- [ ] `falcon init` creates `.falcon/config.yaml` with correct IDs
- [ ] `falcon init` in already-initialized repo fails with clear error
- [ ] `falcon init` with duplicate repo URL fails with clear error
- [ ] `falcon init -w <slug>` uses existing workspace

### 7.3 Scope Resolution

- [ ] `resolveScope()` returns correct IDs from config file
- [ ] `resolveScope()` returns correct IDs from environment variables
- [ ] `resolveScope()` returns correct IDs from git remote lookup
- [ ] `resolveScope()` throws `ScopeResolutionError` with clear reason when resolution fails

### 7.4 URL Canonicalization

- [ ] SSH URLs canonicalized: `git@github.com:org/repo.git` → `github.com/org/repo`
- [ ] HTTPS URLs canonicalized: `https://github.com/org/repo.git` → `github.com/org/repo`
- [ ] Trailing slashes removed
- [ ] `.git` suffix removed
- [ ] Same repo via SSH and HTTPS produces identical canonical URL

### 7.5 Workspace/Project Management

- [ ] `falcon workspace list` shows all active workspaces
- [ ] `falcon workspace create <name>` creates workspace with unique slug
- [ ] `falcon workspace archive <slug>` archives workspace and all projects
- [ ] `falcon project list` shows projects in current workspace
- [ ] `falcon project archive` archives current project
- [ ] `falcon status` shows current config and statistics

---

## 8. Error Handling

All CLI commands should provide clear, actionable error messages:

| Error Condition | Message | Exit Code |
|-----------------|---------|-----------|
| Not in git repo | "Not in a git repository. Run this command from within a git repo." | 1 |
| No git remote | "No git remote 'origin' found. Add with: git remote add origin <url>" | 1 |
| Already initialized | "This project is already initialized. Config: .falcon/config.yaml" | 1 |
| Duplicate repo | "This repository is already registered in workspace: <name>" | 1 |
| Workspace not found | "Workspace '<slug>' not found. Run 'falcon workspace list' to see available." | 1 |
| Not initialized | "Not in an initialized project. Run 'falcon init' to initialize." | 1 |

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// tests/config/url-utils.test.ts
describe('canonicalizeGitUrl', () => {
  it('should canonicalize SSH URLs', () => {
    expect(canonicalizeGitUrl('git@github.com:org/repo.git'))
      .toBe('github.com/org/repo');
  });

  it('should canonicalize HTTPS URLs', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo.git'))
      .toBe('github.com/org/repo');
  });

  it('should handle URLs without .git suffix', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo'))
      .toBe('github.com/org/repo');
  });

  it('should remove trailing slashes', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo/'))
      .toBe('github.com/org/repo');
  });

  it('should produce identical output for SSH and HTTPS', () => {
    const ssh = canonicalizeGitUrl('git@github.com:org/repo.git');
    const https = canonicalizeGitUrl('https://github.com/org/repo.git');
    expect(ssh).toBe(https);
  });
});
```

### 9.2 Integration Tests

```typescript
// tests/cli/init.test.ts
describe('falcon init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    // Initialize git repo
    execSync('git init', { cwd: tempDir });
    execSync('git remote add origin git@github.com:test/repo.git', { cwd: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it('should create config file', async () => {
    process.chdir(tempDir);
    await initCommand.parseAsync(['node', 'falcon', 'init', '-y']);

    const configPath = path.join(tempDir, '.falcon', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('should fail if already initialized', async () => {
    process.chdir(tempDir);
    await initCommand.parseAsync(['node', 'falcon', 'init', '-y']);

    await expect(initCommand.parseAsync(['node', 'falcon', 'init', '-y']))
      .rejects.toThrow();
  });
});
```

---

## 10. Dependencies

Phase 0 has no dependencies on other phases. It MUST be completed first.

**Outputs:**
- Working CLI tool (`falcon` command)
- Database with workspaces/projects tables
- Config file structure (`.falcon/config.yaml`)
- Scope resolution function (`resolveScope()`)

**Required By:**
- Phase 1: Uses database and scope resolution
- Phase 2: Uses scope resolution for attribution
- Phase 3: Uses scope resolution for injection
- Phase 4: Uses CLI for integration
- Phase 5: Uses CLI for promotion triggers
