# Phase 1 Dependencies Research

**Created:** 2026-01-19
**Purpose:** Dependency research for Phase 1 (Data Layer) implementation
**Node.js Target:** 22.x LTS (Active LTS until April 2027)

---

## 1. better-sqlite3

### Recommended Version

```json
{
  "better-sqlite3": "^11.0.0",
  "@types/better-sqlite3": "^7.6.13"
}
```

### Overview

better-sqlite3 is the fastest and simplest library for SQLite3 in Node.js. It executes everything synchronously, avoiding event loop complexity and improving concurrency. This synchronous design is ideal for falcon-ai's use case of local pattern storage.

**Sources:**
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
- [better-sqlite3 API Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

### Key API Methods for Phase 1

#### 1. Database Initialization

```typescript
import Database from 'better-sqlite3';

const db = new Database(DB_PATH);

// CRITICAL: Enable these pragmas FIRST
db.pragma('journal_mode = WAL');     // Required for concurrency
db.pragma('synchronous = NORMAL');   // Balance safety/performance
db.pragma('cache_size = 20000');     // ~20MB cache
db.pragma('foreign_keys = ON');      // Enforce referential integrity
```

#### 2. Prepared Statements

```typescript
// Create prepared statement once
const stmt = db.prepare('SELECT * FROM patterns WHERE id = ?');

// Execute multiple times with different parameters
const pattern1 = stmt.get(id1);
const pattern2 = stmt.get(id2);

// For batch operations, use .all()
const results = db.prepare('SELECT * FROM patterns WHERE status = ?').all('active');
```

Prepared statements provide:
- **Performance:** SQL parsed once, executed many times
- **Security:** Parameters are properly escaped (prevents SQL injection)
- **Type safety:** Use placeholders (`?`) for all dynamic values

#### 3. Transactions

```typescript
// Define transaction as a function
const insertMany = db.transaction((patterns) => {
  const stmt = db.prepare('INSERT INTO patterns (id, content) VALUES (?, ?)');
  for (const pattern of patterns) {
    stmt.run(pattern.id, pattern.content);
  }
});

// Execute - auto-commits on success, rolls back on exception
insertMany(patternsArray);

// Transaction variants for different isolation levels
const exclusiveInsert = insertMany.exclusive(); // Locks immediately
```

**Transaction Caveats:**
- Transaction functions do NOT work with async functions
- Never mix raw `BEGIN`/`COMMIT` with `.transaction()` wrapper
- Check `db.inTransaction` after catching exceptions (SQLite may auto-rollback)
- Transactions are serializable - cannot change isolation level

### WAL Mode Details

Write-Ahead Logging (WAL) mode is **essential** for falcon-ai:

```typescript
db.pragma('journal_mode = WAL');
```

**Benefits:**
- Readers don't block writers (concurrent reads during writes)
- Writers don't block readers
- Better crash recovery
- Significantly faster for mixed read/write workloads

**Gotchas:**
- WAL file can grow large with continuous writes
- Checkpoint may not flush automatically - call `db.pragma('wal_checkpoint(TRUNCATE)')` periodically
- WAL requires all database connections to be on same machine (no network filesystems)

### Foreign Keys

```typescript
db.pragma('foreign_keys = ON');
```

**Critical:** Foreign keys are OFF by default in SQLite. Must enable per-connection.

```sql
-- Example: Pattern occurrences reference patterns
CREATE TABLE pattern_occurrences (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
  -- ...
);
```

**Gotcha:** Foreign key constraints are only checked during INSERT/UPDATE/DELETE, not on existing data.

### Edge Cases and Gotchas

1. **BigInt Handling:** Values outside JavaScript's safe integer range may cause precision issues. Store UUIDs as TEXT.

2. **Synchronous Blocking:** Long queries block the event loop. For falcon-ai's pattern queries, this is acceptable due to small dataset size.

3. **Concurrent Writes:** Even with WAL, only ONE writer at a time. Writes are serialized.

4. **Upgrade Breaking Changes:** Upgrading better-sqlite3 versions may change underlying SQLite version, potentially causing compatibility issues with existing databases.

5. **Memory for Large Results:** Queries returning megabytes of data will consume heap memory synchronously.

### Best Practices for Repository Pattern

```typescript
export class BaseRepository<T> {
  constructor(protected db: Database) {}

  // Helper for JSON fields (SQLite stores as TEXT)
  protected parseJsonField<U>(value: string | null): U {
    return value ? JSON.parse(value) : [];
  }

  protected stringifyJsonField(value: unknown): string {
    return JSON.stringify(value ?? []);
  }

  // SQLite uses integers for booleans
  protected boolToInt(value: boolean): number {
    return value ? 1 : 0;
  }

  protected intToBool(value: number | null): boolean {
    return value === 1;
  }
}
```

---

## 2. Zod

### Recommended Version

```json
{
  "zod": "^3.24.0"
}
```

**Note:** Zod 4 is available (stable, production-ready) but exported at `zod/v4` subpath. Phase 1 should use Zod 3.x for ecosystem compatibility.

**Sources:**
- [Zod Documentation](https://zod.dev/)
- [Zod API Reference](https://zod.dev/api)
- [Zod GitHub](https://github.com/colinhacks/zod)

### Key API Patterns for Phase 1

#### 1. Discriminated Unions

Used for `ScopeSchema` and `DocFingerprintSchema`:

```typescript
export const ScopeSchema = z.discriminatedUnion('level', [
  z.object({
    level: z.literal('global')
  }),
  z.object({
    level: z.literal('workspace'),
    workspaceId: z.string().uuid()
  }),
  z.object({
    level: z.literal('project'),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid()
  })
]);
```

**Benefits:**
- Efficient parsing (uses discriminator to choose branch)
- Clear TypeScript narrowing
- Better error messages than regular unions

**Gotcha:** All options must be object schemas sharing the same discriminator key.

#### 2. Refinements

For custom validation rules:

```typescript
// Simple refinement
const PatternContentSchema = z.string().min(1).max(2000);

// Custom logic refinement
export const PatternDefinitionSchema = z.object({
  // ...
  scope: ScopeSchema.refine(
    (s) => s.level === 'project',
    { message: 'PatternDefinition must have project-level scope' }
  ),
});
```

**Note:** `.refine()` returns `false` for invalid - never throw.

#### 3. superRefine for Multiple Issues

```typescript
const schema = z.object({
  password: z.string(),
  confirm: z.string()
}).superRefine((val, ctx) => {
  if (val.password !== val.confirm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Passwords must match',
      path: ['confirm']
    });
  }
});
```

#### 4. Transforms

For data normalization:

```typescript
// Normalize content before hashing
const NormalizedContentSchema = z.string()
  .transform(val => val.trim().toLowerCase().replace(/\s+/g, ' '));
```

**Gotcha:** `.transform()` makes the output type opaque for JSON Schema generation.

#### 5. Error Handling

**Recommended: Use `safeParse()` for repository operations:**

```typescript
// In repository
create(data: CreateInput): PatternDefinition {
  const result = PatternDefinitionSchema.safeParse(data);

  if (!result.success) {
    // Log detailed errors, throw appropriate exception
    throw new ValidationError(result.error.format());
  }

  return result.data;
}
```

**Use `parse()` for fail-fast scenarios:**

```typescript
// When you want exceptions to propagate
PatternDefinitionSchema.parse(pattern);
```

#### 6. passthrough() for Extensible Objects

```typescript
export const WorkspaceConfigSchema = z.object({
  maxInjectedWarnings: z.number().int().positive().optional(),
  crossProjectWarningsEnabled: z.boolean().optional(),
}).passthrough();  // Allow additional settings
```

**Use cases:**
- Future-proofing configs
- Storing unknown fields during transitions
- Debugging (preserve extra data)

### Type Inference

```typescript
// Always infer types from schemas
export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;

// Avoid manually defining types that duplicate schemas
```

### Best Practices

1. **Define schemas FIRST, derive types:** Single source of truth
2. **Use `.safeParse()` in repositories:** Better error handling
3. **Use `.refine()` for business rules:** Keep validation close to schema
4. **Prefer `discriminatedUnion` over `union`:** Better performance and errors
5. **Store enums as Zod schemas:** Type-safe at runtime

---

## 3. Vitest

### Recommended Version

```json
{
  "vitest": "^2.0.0"
}
```

**Sources:**
- [Vitest Documentation](https://vitest.dev/guide/)
- [Vitest Test Context](https://vitest.dev/guide/test-context)
- [Vitest API Reference](https://vitest.dev/api/)

### Test Setup for SQLite

#### 1. Configuration (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,              // Optional: global test functions
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    // Important: SQLite tests should NOT run in parallel (shared DB state)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true        // Run all tests in single process
      }
    }
  }
});
```

#### 2. Database Fixture Pattern

```typescript
// tests/helpers/db-fixture.ts
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/storage/db';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function createTestDatabase(): Database.Database {
  // Use unique temp file for each test run
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
  const dbPath = path.join(tempDir, 'test.db');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

export function cleanupTestDatabase(db: Database.Database): void {
  const dbPath = db.name;
  db.close();

  // Remove DB files
  try {
    fs.unlinkSync(dbPath);
    fs.unlinkSync(dbPath + '-wal');
    fs.unlinkSync(dbPath + '-shm');
    fs.rmdirSync(path.dirname(dbPath));
  } catch {
    // Ignore cleanup errors
  }
}
```

#### 3. Repository Test Pattern

```typescript
// tests/storage/pattern-definition.repo.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase, cleanupTestDatabase } from '../helpers/db-fixture';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo';

describe('PatternDefinitionRepository', () => {
  let db: Database.Database;
  let repo: PatternDefinitionRepository;

  // Test scope constants
  const testScope = {
    level: 'project' as const,
    workspaceId: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002'
  };

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PatternDefinitionRepository(db);

    // Seed required workspace/project
    seedTestScope(db, testScope);
  });

  afterEach(() => {
    cleanupTestDatabase(db);
  });

  describe('create', () => {
    it('should create a pattern with generated fields', () => {
      const input = {
        scope: testScope,
        patternContent: 'Test pattern content',
        failureMode: 'incorrect' as const,
        // ... other required fields
      };

      const created = repo.create(input);

      expect(created.id).toBeDefined();
      expect(created.patternKey).toHaveLength(64);
      expect(created.contentHash).toHaveLength(64);
      expect(created.severityMax).toBe(created.severity);
    });
  });

  describe('deduplication', () => {
    it('should return existing pattern for duplicate patternKey', () => {
      const input = { /* ... */ };

      const first = repo.create(input);
      const second = repo.create(input);

      expect(second.id).toBe(first.id);
    });

    it('should update severityMax when new occurrence has higher severity', () => {
      // Create with MEDIUM
      const first = repo.create({ ...input, severity: 'MEDIUM' });

      // Create duplicate with HIGH
      const second = repo.create({ ...input, severity: 'HIGH' });

      expect(second.severityMax).toBe('HIGH');
    });
  });
});
```

#### 4. Schema Validation Tests

```typescript
// tests/schemas/pattern-definition.test.ts
import { describe, it, expect } from 'vitest';
import { PatternDefinitionSchema, ScopeSchema } from '../../src/schemas';

describe('PatternDefinitionSchema', () => {
  const validPattern = {
    id: '00000000-0000-0000-0000-000000000001',
    scope: {
      level: 'project',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      projectId: '00000000-0000-0000-0000-000000000003'
    },
    patternKey: 'a'.repeat(64),
    contentHash: 'b'.repeat(64),
    // ... all required fields
  };

  it('should validate a correct pattern', () => {
    const result = PatternDefinitionSchema.safeParse(validPattern);
    expect(result.success).toBe(true);
  });

  it('should reject non-project scope', () => {
    const invalid = {
      ...validPattern,
      scope: { level: 'workspace', workspaceId: '...' }
    };

    const result = PatternDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('project-level scope');
  });

  it('should reject missing required fields', () => {
    const { patternContent, ...missing } = validPattern;

    const result = PatternDefinitionSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });
});
```

#### 5. Using test.extend for Fixtures

```typescript
import { test as baseTest } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase, cleanupTestDatabase } from './helpers/db-fixture';

interface TestFixtures {
  db: Database.Database;
  testScope: { level: 'project'; workspaceId: string; projectId: string };
}

export const test = baseTest.extend<TestFixtures>({
  db: async ({}, use) => {
    const db = createTestDatabase();
    await use(db);
    cleanupTestDatabase(db);
  },
  testScope: async ({}, use) => {
    await use({
      level: 'project',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      projectId: '00000000-0000-0000-0000-000000000002'
    });
  }
});

// Usage
test('creates pattern', ({ db, testScope }) => {
  const repo = new PatternDefinitionRepository(db);
  // ...
});
```

### Best Practices

1. **Isolate database per test:** Use temp directories with unique paths
2. **Clean up in afterEach:** Close DB, delete files
3. **Seed required data:** Workspaces/projects must exist before patterns
4. **Use constants for test scope:** Avoid UUID generation in every test
5. **Test both valid and invalid inputs:** Schema rejection tests are critical
6. **Do NOT run SQLite tests in parallel:** Shared state causes flaky tests

---

## 4. Additional Dependencies

### uuid

```json
{
  "uuid": "^10.0.0",
  "@types/uuid": "^10.0.0"
}
```

Used for generating pattern IDs:

```typescript
import { v4 as uuidv4 } from 'uuid';

const id = uuidv4(); // '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
```

### TypeScript

```json
{
  "typescript": "^5.5.0"
}
```

Ensure strict mode for type safety with Zod inference:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext"
  }
}
```

---

## 5. Version Summary

| Package | Version | Purpose |
|---------|---------|---------|
| better-sqlite3 | ^11.0.0 | SQLite database driver |
| @types/better-sqlite3 | ^7.6.13 | TypeScript definitions |
| zod | ^3.24.0 | Schema validation |
| uuid | ^10.0.0 | UUID generation |
| @types/uuid | ^10.0.0 | TypeScript definitions |
| vitest | ^2.0.0 | Test framework |
| typescript | ^5.5.0 | TypeScript compiler |

---

## 6. Quick Reference: Common Patterns

### Initialize Database

```typescript
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

### Validate Before Insert

```typescript
const result = Schema.safeParse(data);
if (!result.success) throw new ValidationError(result.error);
db.prepare('INSERT ...').run(result.data);
```

### Transaction with Rollback

```typescript
const batchInsert = db.transaction((items) => {
  const stmt = db.prepare('INSERT INTO table VALUES (?, ?)');
  items.forEach(item => stmt.run(item.a, item.b));
});
batchInsert(items); // Auto-commits or rolls back
```

### Test Cleanup

```typescript
afterEach(() => {
  db.close();
  fs.unlinkSync(dbPath);
});
```
