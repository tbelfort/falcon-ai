# SQLite Drizzle ORM Patterns

## Overview

Drizzle ORM is a lightweight (~7.4kb), TypeScript-first ORM that treats your database schema as code. This document covers patterns for using Drizzle with SQLite in falcon-pm.

## Installation

```bash
npm i drizzle-orm better-sqlite3
npm i -D drizzle-kit @types/better-sqlite3
```

Or with libsql (supports Turso):

```bash
npm i drizzle-orm @libsql/client
npm i -D drizzle-kit
```

## Project Structure

```
src/pm/db/
├── connection.ts      # Database connection
├── schema.ts          # All table definitions
├── relations.ts       # Relation definitions
├── seed.ts            # Default data
└── migrations/        # Generated migrations
```

## Database Connection

### Using better-sqlite3 (Synchronous)

```typescript
// src/pm/db/connection.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('~/.falcon/pm.db');
export const db = drizzle(sqlite, { schema });
```

### Using libsql (Async, Turso-compatible)

```typescript
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const client = createClient({ url: 'file:~/.falcon/pm.db' });
export const db = drizzle(client, { schema });
```

## Schema Definition

### Column Types

```typescript
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Integer modes
integer('id').primaryKey({ autoIncrement: true })  // Auto-increment PK
integer('count')                                     // Default number mode
integer('active', { mode: 'boolean' })              // Store as 0/1
integer('createdAt', { mode: 'timestamp' })         // Unix seconds -> Date
integer('updatedAt', { mode: 'timestamp_ms' })      // Unix ms -> Date

// Text modes
text('name').notNull()
text('status').notNull().default('pending')
text('config', { mode: 'json' }).$type<ConfigType>()  // JSON with type

// Real (floating point)
real('price')

// Blob
blob('data', { mode: 'buffer' })  // Default
blob('bignum', { mode: 'bigint' })  // BigInt storage
```

### Table Definition Example

```typescript
// src/pm/db/schema.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  repoUrl: text('repo_url'),
  config: text('config', { mode: 'json' }).$type<ProjectConfig>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Issues table
export const issues = sqliteTable('issues', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('backlog'),
  stage: text('stage').notNull().default('BACKLOG'),
  priority: text('priority').default('medium'),
  assignedAgentId: text('assigned_agent_id'),
  branchName: text('branch_name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('issue_project_number_idx').on(table.projectId, table.number),
  index('issue_status_idx').on(table.status),
  index('issue_stage_idx').on(table.stage),
]);

// Labels table
export const labels = sqliteTable('labels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6b7280'),
  description: text('description'),
}, (table) => [
  uniqueIndex('label_project_name_idx').on(table.projectId, table.name),
]);

// Junction table for many-to-many
export const issueLabels = sqliteTable('issue_labels', {
  issueId: text('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (table) => [
  index('issue_labels_issue_idx').on(table.issueId),
  index('issue_labels_label_idx').on(table.labelId),
]);

// Type exports for use in application
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
```

## Relations

```typescript
// src/pm/db/relations.ts
import { relations } from 'drizzle-orm';
import { projects, issues, labels, issueLabels, agents, comments } from './schema';

export const projectRelations = relations(projects, ({ many }) => ({
  issues: many(issues),
  labels: many(labels),
  agents: many(agents),
}));

export const issueRelations = relations(issues, ({ one, many }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
  assignedAgent: one(agents, {
    fields: [issues.assignedAgentId],
    references: [agents.id],
  }),
  labels: many(issueLabels),
  comments: many(comments),
}));

export const labelRelations = relations(labels, ({ one, many }) => ({
  project: one(projects, {
    fields: [labels.projectId],
    references: [projects.id],
  }),
  issues: many(issueLabels),
}));

export const issueLabelRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLabels.issueId],
    references: [issues.id],
  }),
  label: one(labels, {
    fields: [issueLabels.labelId],
    references: [labels.id],
  }),
}));
```

## CRUD Operations

### Insert

```typescript
import { db } from './connection';
import { projects, issues } from './schema';

// Single insert
const newProject = await db.insert(projects)
  .values({ name: 'My Project', slug: 'my-project' })
  .returning();

// Batch insert
await db.insert(issues).values([
  { projectId: 'p1', number: 1, title: 'Issue 1' },
  { projectId: 'p1', number: 2, title: 'Issue 2' },
]);

// Insert with conflict handling
await db.insert(labels)
  .values({ projectId: 'p1', name: 'bug', color: '#ef4444' })
  .onConflictDoUpdate({
    target: [labels.projectId, labels.name],
    set: { color: '#ef4444' },
  });
```

### Select

```typescript
import { eq, and, like, inArray, desc, sql } from 'drizzle-orm';

// Basic select
const allProjects = await db.select().from(projects);

// Select with filter
const activeIssues = await db.select()
  .from(issues)
  .where(eq(issues.status, 'in_progress'));

// Select specific columns
const issueTitles = await db.select({
  id: issues.id,
  title: issues.title,
}).from(issues);

// Complex conditions
const filteredIssues = await db.select()
  .from(issues)
  .where(and(
    eq(issues.projectId, projectId),
    like(issues.title, `%${search}%`),
    inArray(issues.status, ['backlog', 'todo'])
  ))
  .orderBy(desc(issues.createdAt))
  .limit(20)
  .offset(0);

// Aggregate queries
const statusCounts = await db.select({
  status: issues.status,
  count: sql<number>`count(*)`,
}).from(issues)
  .where(eq(issues.projectId, projectId))
  .groupBy(issues.status);
```

### Relational Queries

```typescript
// Fetch with relations (no manual joins!)
const projectWithIssues = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    issues: {
      orderBy: desc(issues.createdAt),
      limit: 10,
    },
    labels: true,
  },
});

// Nested relations
const issueWithDetails = await db.query.issues.findFirst({
  where: eq(issues.id, issueId),
  with: {
    project: true,
    assignedAgent: true,
    labels: {
      with: {
        label: true,  // Through junction table
      },
    },
    comments: {
      orderBy: desc(comments.createdAt),
    },
  },
});
```

### Update

```typescript
// Update by condition
await db.update(issues)
  .set({
    status: 'in_progress',
    updatedAt: sql`(unixepoch())`,
  })
  .where(eq(issues.id, issueId));

// Update with returning
const [updated] = await db.update(issues)
  .set({ stage: newStage })
  .where(eq(issues.id, issueId))
  .returning();
```

### Delete

```typescript
// Delete by condition
await db.delete(issues)
  .where(eq(issues.id, issueId));

// Delete with safety (always use where clause!)
await db.delete(issueLabels)
  .where(and(
    eq(issueLabels.issueId, issueId),
    eq(issueLabels.labelId, labelId)
  ));
```

## Transactions

```typescript
// Basic transaction
await db.transaction(async (tx) => {
  // Create issue
  const [issue] = await tx.insert(issues)
    .values({ projectId, number, title })
    .returning();

  // Add labels
  if (labelIds.length > 0) {
    await tx.insert(issueLabels)
      .values(labelIds.map(labelId => ({ issueId: issue.id, labelId })));
  }

  // Create initial comment
  await tx.insert(comments)
    .values({ issueId: issue.id, content: 'Issue created' });

  return issue;
});

// Transaction with conditional rollback
await db.transaction(async (tx) => {
  const [agent] = await tx.select()
    .from(agents)
    .where(eq(agents.id, agentId));

  if (agent.status !== 'idle') {
    tx.rollback();  // Explicit rollback
  }

  await tx.update(agents)
    .set({ status: 'working', currentIssueId: issueId })
    .where(eq(agents.id, agentId));
});

// SQLite-specific transaction behavior
await db.transaction(async (tx) => {
  // Transaction operations
}, { behavior: 'immediate' });  // 'deferred' | 'immediate' | 'exclusive'
```

## Prepared Statements

```typescript
// For frequently executed queries
const getIssueById = db.query.issues.findFirst({
  where: eq(issues.id, sql.placeholder('id')),
  with: { project: true },
}).prepare();

// Execute with parameters
const issue = await getIssueById.execute({ id: issueId });
```

## Migrations

### Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/pm/db/migrations',
  schema: './src/pm/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:~/.falcon/pm.db',
  },
});
```

### Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Push schema directly (dev only)
npx drizzle-kit push

# Open Drizzle Studio
npx drizzle-kit studio
```

### Programmatic Migration

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './connection';

// Run migrations on startup
migrate(db, { migrationsFolder: './src/pm/db/migrations' });
```

## Seed Data

```typescript
// src/pm/db/seed.ts
import { db } from './connection';
import { labels, modelPresets } from './schema';

export async function seed() {
  // Default labels
  const defaultLabels = [
    { name: 'bug', color: '#ef4444', description: 'Something isn\'t working' },
    { name: 'feature', color: '#3b82f6', description: 'New feature request' },
    { name: 'urgent', color: '#f97316', description: 'Requires immediate attention' },
  ];

  // Default model presets
  const presets = [
    {
      name: 'full-pipeline',
      description: 'Complete workflow with all stages',
      config: {
        stages: ['CONTEXT_PACK', 'SPEC', 'IMPLEMENT', 'PR_REVIEW'],
        models: { default: 'claude-sonnet-4' },
      },
    },
    {
      name: 'quick-fix',
      description: 'Skip spec for minor fixes',
      config: {
        stages: ['CONTEXT_PACK', 'IMPLEMENT', 'PR_REVIEW'],
        models: { default: 'claude-sonnet-4' },
      },
    },
  ];

  await db.transaction(async (tx) => {
    for (const label of defaultLabels) {
      await tx.insert(labels)
        .values({ ...label, projectId: 'default' })
        .onConflictDoNothing();
    }

    for (const preset of presets) {
      await tx.insert(modelPresets)
        .values(preset)
        .onConflictDoNothing();
    }
  });
}
```

## JSON Columns Pattern

```typescript
// Define typed JSON columns
interface ProjectConfig {
  gitRemote: string;
  defaultBranch: string;
  workflowSettings?: {
    autoMerge: boolean;
    requireApproval: boolean;
  };
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // Use text mode for JSON (supports JSON functions)
  config: text('config', { mode: 'json' }).$type<ProjectConfig>(),
});

// Query JSON fields
const projects = await db.select()
  .from(projects)
  .where(sql`json_extract(${projects.config}, '$.autoMerge') = true`);
```

## Repository Pattern

```typescript
// src/pm/db/repositories/issue.repo.ts
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../connection';
import { issues, issueLabels, type Issue, type NewIssue } from '../schema';

export const issueRepo = {
  async findById(id: string) {
    return db.query.issues.findFirst({
      where: eq(issues.id, id),
      with: {
        project: true,
        labels: { with: { label: true } },
        comments: { orderBy: desc(comments.createdAt) },
      },
    });
  },

  async findByProject(projectId: string, filters?: {
    status?: string[];
    stage?: string;
    limit?: number;
    offset?: number;
  }) {
    return db.query.issues.findMany({
      where: and(
        eq(issues.projectId, projectId),
        filters?.stage ? eq(issues.stage, filters.stage) : undefined,
      ),
      orderBy: desc(issues.createdAt),
      limit: filters?.limit ?? 50,
      offset: filters?.offset ?? 0,
      with: {
        assignedAgent: true,
        labels: { with: { label: true } },
      },
    });
  },

  async create(data: NewIssue, labelIds?: string[]) {
    return db.transaction(async (tx) => {
      const [issue] = await tx.insert(issues).values(data).returning();

      if (labelIds?.length) {
        await tx.insert(issueLabels)
          .values(labelIds.map(labelId => ({ issueId: issue.id, labelId })));
      }

      return issue;
    });
  },

  async updateStage(id: string, stage: string) {
    const [updated] = await db.update(issues)
      .set({ stage, updatedAt: sql`(unixepoch())` })
      .where(eq(issues.id, id))
      .returning();
    return updated;
  },
};
```

## Performance Tips

1. **Use indexes** on frequently queried columns (foreign keys, status fields)
2. **Composite indexes** for many-to-many junction tables
3. **Prepared statements** for repeated queries
4. **Batch inserts** instead of individual inserts in loops
5. **Select only needed columns** for large tables
6. **Use transactions** for multiple related operations
7. **JSON text mode** over blob for JSON (supports SQLite JSON functions)

## Sources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle ORM SQLite Guide](https://orm.drizzle.team/docs/get-started/sqlite-new)
- [Drizzle ORM Column Types](https://orm.drizzle.team/docs/column-types/sqlite)
- [Drizzle ORM Relations](https://orm.drizzle.team/docs/relations-v2)
- [Drizzle ORM Transactions](https://orm.drizzle.team/docs/transactions)
- [Getting Started with Drizzle ORM](https://betterstack.com/community/guides/scaling-nodejs/drizzle-orm/)
- [Drizzle vs Prisma 2026](https://medium.com/@codabu/drizzle-vs-prisma-choosing-the-right-typescript-orm-in-2026-deep-dive-63abb6aa882b)
