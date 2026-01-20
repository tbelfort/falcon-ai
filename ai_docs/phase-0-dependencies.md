# Phase 0 Dependencies Research

**Last Updated:** 2026-01-19
**Phase:** Phase 0 - Bootstrap and Configuration
**Node.js LTS Target:** v22.x (current LTS as of 2026)

---

## Overview

This document provides detailed research on all npm dependencies required for Phase 0 of the falcon-ai Pattern Attribution System. Each dependency is analyzed for version compatibility, API patterns specific to Phase 0 use cases, known gotchas, and best practices.

---

## 1. commander

**Package:** [commander](https://www.npmjs.com/package/commander)
**Recommended Version:** `^14.0.0`
**Spec Version:** `^11.0.0` (outdated - recommend upgrading)

### Use Case in Phase 0

Commander.js is used to build the `falcon` CLI with subcommands:
- `falcon init` - Initialize a project
- `falcon workspace [list|create|archive]` - Manage workspaces
- `falcon project [list|archive]` - Manage projects
- `falcon status` - Show current configuration
- `falcon doctor` - Diagnostic health checks

### API Patterns

```typescript
// Entry point pattern (src/cli/index.ts)
import { Command } from 'commander';

const program = new Command();

program
  .name('falcon')
  .description('Pattern-based guardrail system')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(workspaceCommand);

// CRITICAL: Use parseAsync for async action handlers
await program.parseAsync();
```

```typescript
// Subcommand with options pattern
export const initCommand = new Command('init')
  .description('Initialize falcon-ai in the current repository')
  .option('-w, --workspace <slug>', 'Use existing workspace')
  .option('-n, --name <name>', 'Project name override')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options: InitOptions) => {
    try {
      // Implementation
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
```

### Gotchas

1. **Async Action Handlers**: If using `async` action handlers, you MUST use `parseAsync()` instead of `parse()`. Using `parse()` with async handlers will cause the program to exit before the async operation completes.

2. **Node.js Version**: Commander 14 requires Node.js v20+. Commander 12 requires Node.js v18+.

3. **Duplicate Options/Commands**: Commander 12+ throws an error if you add an option with a flag already in use, or a command with a name/alias already in use.

4. **Error Handling**: By default, Commander calls `process.exit()` on errors. Use `exitOverride()` if you need custom error handling.

### Best Practices

```typescript
// Always wrap async operations in try-catch
program
  .command('init')
  .action(async (options) => {
    try {
      await performInit(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Use exitOverride for testability
program.exitOverride((err) => {
  throw new CommanderError(err.exitCode, err.code, err.message);
});
```

---

## 2. better-sqlite3

**Package:** [better-sqlite3](https://www.npmjs.com/package/better-sqlite3)
**Recommended Version:** `^11.0.0`
**Spec Version:** `^9.0.0` (works, but consider upgrading)

### Use Case in Phase 0

better-sqlite3 is used for:
- Database initialization at `~/.falcon-ai/db/falcon.db`
- Storing workspaces and projects tables
- Running migrations on first connection
- Health checks in `falcon doctor`

### API Patterns

```typescript
// Database initialization pattern (src/storage/db.ts)
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DB_PATH = path.join(os.homedir(), '.falcon-ai', 'db', 'falcon.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);

    // CRITICAL: Enable WAL mode and foreign keys
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');

    runMigrations(db);
  }
  return db;
}
```

```typescript
// Prepared statement pattern for queries
const existingProject = db.prepare(`
  SELECT p.*, w.slug as workspace_slug
  FROM projects p
  JOIN workspaces w ON p.workspace_id = w.id
  WHERE p.repo_origin_url = ? AND p.repo_subdir = ?
`).get(canonicalUrl, repoSubdir);

// Insert pattern
db.prepare(`
  INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(id, name, slug, '{}', 'active', now, now);
```

### Gotchas

1. **Native Module Compilation**: better-sqlite3 is a native Node.js addon. It requires:
   - Python (for node-gyp)
   - C++ compiler (Visual Studio on Windows, gcc/clang on Unix)
   - Prebuilt binaries are available for LTS Node.js versions

2. **Node.js 24 Compatibility**: As of early 2026, better-sqlite3 may have issues with Node.js 24. Stick with Node.js 22 LTS.

3. **WAL Mode File Growth**: WAL mode can cause the WAL file to grow indefinitely with heavy writes. Periodically run checkpoints:
   ```typescript
   db.pragma('wal_checkpoint(TRUNCATE)');
   ```

4. **Foreign Keys Off by Default**: SQLite has foreign keys disabled by default. You MUST enable them per connection:
   ```typescript
   db.pragma('foreign_keys = ON');
   ```

5. **Synchronous API**: better-sqlite3 is synchronous. For CPU-intensive queries, use worker threads.

### Best Practices

```typescript
// Recommended pragma settings
db.pragma('journal_mode = WAL');      // Better concurrency
db.pragma('foreign_keys = ON');       // Enforce referential integrity
db.pragma('synchronous = NORMAL');    // Balance safety and speed

// Use transactions for multiple writes
const insertWorkspace = db.prepare('INSERT INTO workspaces ...');
const insertProject = db.prepare('INSERT INTO projects ...');

const createWorkspaceWithProject = db.transaction((ws, proj) => {
  insertWorkspace.run(ws);
  insertProject.run(proj);
});

createWorkspaceWithProject(workspaceData, projectData);
```

```typescript
// Proper cleanup on process exit
process.on('exit', () => {
  if (db) db.close();
});

process.on('SIGINT', () => {
  if (db) db.close();
  process.exit(0);
});
```

---

## 3. yaml

**Package:** [yaml](https://www.npmjs.com/package/yaml)
**Recommended Version:** `^2.8.0`
**Spec Version:** `^2.3.0` (works fine)

### Use Case in Phase 0

The yaml package is used for:
- Reading `.falcon/config.yaml` configuration files
- Writing configuration files during `falcon init`
- Parsing YAML with comment preservation (future use)

### API Patterns

```typescript
// Simple parse/stringify (src/config/loader.ts)
import yaml from 'yaml';
import fs from 'fs';

// Reading config
const content = fs.readFileSync(configPath, 'utf-8');
const parsed = yaml.parse(content);

// Writing config
const config = {
  version: '1.0',
  workspaceId: 'uuid-here',
  projectId: 'uuid-here',
  workspace: { slug: 'my-workspace', name: 'My Workspace' }
};
fs.writeFileSync(configPath, yaml.stringify(config));
```

```typescript
// With options for better output formatting
fs.writeFileSync(configPath, yaml.stringify(config, {
  indent: 2,
  lineWidth: 80,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'QUOTE_DOUBLE'  // For values needing quotes
}));
```

### Gotchas

1. **Document Markers in Keys**: If a YAML key contains `...` (document stop token), it must be quoted. The default stringify may not quote it:
   ```typescript
   // Workaround: use defaultKeyType option
   yaml.stringify(data, { defaultKeyType: 'QUOTE_SINGLE' });
   ```

2. **Single Document Only**: `yaml.parse()` only supports single-document YAML. For multi-document files, use `yaml.parseAllDocuments()`.

3. **Error Handling**: `yaml.parse()` throws on syntax errors. Always wrap in try-catch:
   ```typescript
   try {
     const config = yaml.parse(content);
   } catch (error) {
     console.error(`Invalid YAML: ${error.message}`);
   }
   ```

4. **Alias Expansion Attack**: The library has protection via `maxAliasCount` (default 100) to prevent exponential alias expansion attacks.

5. **TypeScript Version**: Minimum supported TypeScript is 3.9. For older versions, use `skipLibCheck: true`.

### Best Practices

```typescript
// Always validate parsed YAML with Zod
import yaml from 'yaml';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.string(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid()
});

export function loadConfig(configPath: string) {
  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content);
  return ConfigSchema.parse(parsed);  // Throws if invalid
}
```

---

## 4. zod

**Package:** [zod](https://www.npmjs.com/package/zod)
**Recommended Version:** `^4.3.0` (Zod 4 is latest)
**Spec Version:** `^3.22.0` (still works, but Zod 4 recommended)

### Use Case in Phase 0

Zod is used for:
- Validating `.falcon/config.yaml` schema
- Type-safe configuration parsing
- Runtime validation of CLI inputs

### API Patterns

```typescript
// Schema definition (src/config/loader.ts)
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
```

```typescript
// Validation with parse (throws on error)
export function loadConfig(configPath: string): FalconConfig {
  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content);
  return ConfigSchema.parse(parsed);  // Throws ZodError if invalid
}
```

```typescript
// Validation with safeParse (returns result object)
const result = ConfigSchema.safeParse(parsed);
if (!result.success) {
  console.error('Invalid config:', result.error.format());
  process.exit(1);
}
const config = result.data;
```

### Gotchas

1. **parse vs safeParse**:
   - `parse()` throws `ZodError` on validation failure
   - `safeParse()` returns `{ success: boolean, data?, error? }`
   - Use `safeParse()` for user input; use `parse()` for trusted internal data

2. **Zod 4 Breaking Changes**:
   - `.pick()` and `.omit()` now validate that keys exist in the schema
   - New `z.xor()` for exclusive unions
   - New locales API for error message translation

3. **TypeScript Version**: Zod 4 requires TypeScript 5.5+. Older TypeScript may work but is unsupported.

4. **Async Validation**: Use `.parseAsync()` or `.safeParseAsync()` for schemas with async refinements.

### Best Practices

```typescript
// Use safeParse for user-facing validation
function validateConfig(data: unknown): FalconConfig | null {
  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('Configuration validation failed:');
    for (const [key, error] of Object.entries(formatted)) {
      if (key !== '_errors' && error._errors?.length) {
        console.error(`  ${key}: ${error._errors.join(', ')}`);
      }
    }
    return null;
  }
  return result.data;
}
```

```typescript
// Custom error messages
const ConfigSchema = z.object({
  workspaceId: z.string().uuid({ message: 'workspaceId must be a valid UUID' }),
  projectId: z.string().uuid({ message: 'projectId must be a valid UUID' })
});
```

---

## 5. uuid

**Package:** [uuid](https://www.npmjs.com/package/uuid)
**Recommended Version:** `^11.0.0`
**Spec Version:** Not specified in package.json (needs to be added)

### Use Case in Phase 0

UUID generation for:
- Workspace IDs
- Project IDs
- Any entity requiring unique identifiers

### API Patterns

```typescript
// Import v4 UUID generator
import { v4 as uuidv4 } from 'uuid';

// Generate UUID
const workspaceId = uuidv4();
const projectId = uuidv4();
```

### Alternative: Native `crypto.randomUUID()`

Node.js 14.17+ includes a native UUID v4 generator that is **3x faster** than the uuid package:

```typescript
// Native alternative (recommended for v4 UUIDs only)
import { randomUUID } from 'crypto';

const workspaceId = randomUUID();
const projectId = randomUUID();
```

### Gotchas

1. **uuid@11 State Changes**: In uuid@11, the internal state handling changed. When using `options` parameter, internal state is NOT used (this affects v1, v6, v7 only, not v4).

2. **Performance**: `crypto.randomUUID()` is ~3x faster than `uuid.v4()`:
   - uuid.v4(): ~1030ns per UUID
   - crypto.randomUUID(): ~350ns per UUID

3. **Bundle Size**: Using native `crypto.randomUUID()` eliminates the uuid dependency entirely.

4. **UUID Versions**: `crypto.randomUUID()` only generates v4 (random) UUIDs. If you need v1, v5, v6, or v7, you must use the uuid package.

### Best Practices

**Recommendation for Phase 0**: Use native `crypto.randomUUID()` instead of the uuid package.

```typescript
// Recommended approach - native crypto
import { randomUUID } from 'crypto';

// In src/cli/commands/init.ts
const workspaceId = randomUUID();
const projectId = randomUUID();
```

```typescript
// If you need other UUID versions, use the package
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';

const randomId = uuidv4();
const timeOrderedId = uuidv7();  // Time-ordered, sortable
```

---

## Dependency Summary Table

| Package | Spec Version | Recommended | Node.js Req | Notes |
|---------|--------------|-------------|-------------|-------|
| commander | ^11.0.0 | ^14.0.0 | v20+ | Use parseAsync for async handlers |
| better-sqlite3 | ^9.0.0 | ^11.0.0 | v22 LTS | Enable WAL + foreign_keys |
| yaml | ^2.3.0 | ^2.8.0 | v14+ | Validate with Zod after parsing |
| zod | ^3.22.0 | ^4.3.0 | v18+ (TS 5.5+) | Use safeParse for user input |
| uuid | (missing) | Remove | - | Use crypto.randomUUID() instead |

---

## Updated package.json Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "commander": "^14.0.0",
    "yaml": "^2.8.0",
    "zod": "^4.3.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.5.0"
  }
}
```

**Note:** The `uuid` package has been removed in favor of native `crypto.randomUUID()`.

---

## Migration Notes for Phase 0 Spec

1. **Replace uuid imports**:
   ```typescript
   // Before
   import { v4 as uuidv4 } from 'uuid';
   const id = uuidv4();

   // After
   import { randomUUID } from 'crypto';
   const id = randomUUID();
   ```

2. **Update Commander usage**:
   ```typescript
   // Ensure parseAsync is used
   await program.parseAsync();
   ```

3. **Add database cleanup handlers**:
   ```typescript
   process.on('exit', () => db?.close());
   process.on('SIGINT', () => { db?.close(); process.exit(0); });
   ```

---

## References

- [commander npm](https://www.npmjs.com/package/commander)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
- [yaml npm](https://www.npmjs.com/package/yaml)
- [Zod Documentation](https://zod.dev/)
- [uuid npm](https://www.npmjs.com/package/uuid)
- [Node.js crypto.randomUUID()](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions)
