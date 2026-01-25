# Data Model Design Document

## Overview

This document defines the complete database schema for falcon-pm using SQLite with Drizzle ORM. All tables use UUIDs as primary keys and timestamps for auditing.

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   projects  │──────<│   issues    │──────<│  comments   │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │
       │                     │
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│   labels    │<──────│issue_labels │
└─────────────┘       └─────────────┘
       │
       │
       ▼
┌─────────────┐       ┌─────────────┐
│   agents    │<──────│   issues    │ (assigned_agent_id)
└─────────────┘       └─────────────┘
       │
       ▼
┌─────────────┐
│workflow_runs│
└─────────────┘

┌─────────────┐       ┌─────────────┐
│  documents  │──────<│   issues    │
└─────────────┘       │  projects   │
                      └─────────────┘

┌─────────────┐
│stage_messages│──────< issues
└─────────────┘

┌─────────────┐
│model_presets│
└─────────────┘
```

## Schema Definitions

### projects

Central entity for organizing work.

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  config TEXT, -- JSON: ProjectConfig
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX projects_slug_idx ON projects(slug);
```

**TypeScript:**
```typescript
interface ProjectConfig {
  github?: {
    owner: string;
    repo: string;
  };
  workflowDefaults?: {
    preset: string;
    labelOverrides?: Record<string, string>;
  };
}
```

### issues

Core work items with stage tracking.

```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Status and Stage
  status TEXT NOT NULL DEFAULT 'backlog', -- backlog, todo, in_progress, done
  stage TEXT NOT NULL DEFAULT 'BACKLOG',  -- Workflow stage

  -- Metadata
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical
  branch_name TEXT,
  pr_number INTEGER,
  pr_url TEXT,

  -- Assignment
  assigned_agent_id TEXT REFERENCES agents(id),
  assigned_human TEXT,

  -- Attributes (JSON)
  attributes TEXT, -- JSON: IssueAttributes

  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  UNIQUE(project_id, number)
);

CREATE INDEX issues_project_idx ON issues(project_id);
CREATE INDEX issues_status_idx ON issues(status);
CREATE INDEX issues_stage_idx ON issues(stage);
CREATE INDEX issues_agent_idx ON issues(assigned_agent_id);
```

**TypeScript:**
```typescript
type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

type IssueStage =
  | 'BACKLOG'
  | 'TODO'
  | 'CONTEXT_PACK'
  | 'CONTEXT_REVIEW'
  | 'SPEC'
  | 'SPEC_REVIEW'
  | 'IMPLEMENT'
  | 'PR_REVIEW'
  | 'PR_HUMAN_REVIEW'
  | 'FIXER'
  | 'TESTING'
  | 'DOC_REVIEW'
  | 'MERGE_READY'
  | 'DONE';

interface IssueAttributes {
  hasContextPack?: boolean;
  hasSpec?: boolean;
  needsSpec?: boolean;
  needsContextPack?: boolean;
  hasTests?: boolean;
  needsTests?: boolean;
  needsHumanAttention?: boolean;
}
```

### labels

Categorization for issues.

```sql
CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  description TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(project_id, name)
);

CREATE INDEX labels_project_idx ON labels(project_id);
```

**Built-in Labels (seeded):**
- bug, data, docs, foundation, feature, migration, performance, refactor, security, test, ux

Seeding is project-scoped: built-in labels are inserted only for existing projects.
Seed operations are idempotent via insert + on-conflict-do-nothing (no UPSERT).

### issue_labels

Many-to-many junction for issues and labels.

```sql
CREATE TABLE issue_labels (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX issue_labels_issue_idx ON issue_labels(issue_id);
CREATE INDEX issue_labels_label_idx ON issue_labels(label_id);
```

### agents

Registered AI agents (Claude Code, OpenAI).

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL, -- Display name
  agent_type TEXT NOT NULL, -- 'claude' | 'openai'
  model TEXT NOT NULL, -- e.g., 'claude-opus-4.5', 'gpt-4o'

  -- Status
  status TEXT NOT NULL DEFAULT 'idle', -- idle, checkout, working, error
  current_issue_id TEXT REFERENCES issues(id),
  current_stage TEXT,

  -- Configuration
  work_dir TEXT NOT NULL, -- Path to git worktree
  config TEXT, -- JSON: AgentConfig

  -- Stats
  total_tasks_completed INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(project_id, name)
);

CREATE INDEX agents_project_idx ON agents(project_id);
CREATE INDEX agents_status_idx ON agents(status);
```

**TypeScript:**
```typescript
type AgentType = 'claude' | 'openai';
type AgentStatus = 'idle' | 'checkout' | 'working' | 'error';

interface AgentConfig {
  subscription?: string;  // Reference to subscription config
  maxConcurrent?: number;
}
```

### documents

Attached files for context packs, specs, research.

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  issue_id TEXT REFERENCES issues(id),

  title TEXT NOT NULL,
  doc_type TEXT NOT NULL, -- 'context_pack', 'spec', 'ai_doc', 'other'
  file_path TEXT NOT NULL, -- Relative path
  content_hash TEXT, -- SHA256 for change detection

  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, -- Agent or human name

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX documents_project_idx ON documents(project_id);
CREATE INDEX documents_issue_idx ON documents(issue_id);
CREATE INDEX documents_type_idx ON documents(doc_type);
```

### comments

Discussion threads on issues.

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  author_type TEXT NOT NULL, -- 'agent' | 'human'
  author_name TEXT NOT NULL,

  -- Optional parent for threading
  parent_id TEXT REFERENCES comments(id),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX comments_issue_idx ON comments(issue_id);
CREATE INDEX comments_author_idx ON comments(author_name);
```

### stage_messages

Messages left by agents for future stage handlers.

```sql
CREATE TABLE stage_messages (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL, -- Target stage (e.g., 'SPEC', 'IMPLEMENT')
  from_agent TEXT NOT NULL,

  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal', -- 'normal' | 'important'

  read_at INTEGER, -- NULL until read by target stage agent
  read_by TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX stage_messages_issue_idx ON stage_messages(issue_id);
CREATE INDEX stage_messages_to_stage_idx ON stage_messages(to_stage);
CREATE INDEX stage_messages_unread_idx ON stage_messages(issue_id, to_stage, read_at);
```

### workflow_runs

Audit log of agent work sessions.

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),

  stage TEXT NOT NULL,
  preset_id TEXT REFERENCES model_presets(id),

  -- Execution details
  status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'cancelled'
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,

  -- Results
  result_summary TEXT,
  error_message TEXT,

  -- Metrics
  duration_ms INTEGER,
  cost_usd REAL,
  tokens_input INTEGER,
  tokens_output INTEGER,

  -- Session reference
  session_id TEXT, -- Claude/OpenAI session ID for resume

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX workflow_runs_issue_idx ON workflow_runs(issue_id);
CREATE INDEX workflow_runs_agent_idx ON workflow_runs(agent_id);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);
```

### model_presets

Saved configurations for which models handle which stages.

```sql
CREATE TABLE model_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Configuration
  config TEXT NOT NULL, -- JSON: PresetConfig

  -- Defaults
  is_default INTEGER NOT NULL DEFAULT 0,
  for_label TEXT, -- If set, default for issues with this label

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX model_presets_name_idx ON model_presets(name);
CREATE INDEX model_presets_label_idx ON model_presets(for_label);
```

**TypeScript:**
```typescript
interface PresetConfig {
  stages: IssueStage[];  // Which stages to run
  models: {
    default: string;     // Default model
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];    // Multiple models as scouts
    judge: string;
  };
}

// Example presets
const fullPipeline: PresetConfig = {
  stages: [
    'CONTEXT_PACK', 'CONTEXT_REVIEW', 'SPEC', 'SPEC_REVIEW',
    'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER',
    'TESTING', 'DOC_REVIEW', 'MERGE_READY'
  ],
  models: {
    default: 'gpt-4o',
    overrides: {
      CONTEXT_PACK: 'gpt-4o-mini',
      SPEC: 'gpt-4o',
    }
  },
  prReview: {
    orchestrator: 'gpt-4o',
    scouts: ['gpt-4o-mini'],
    judge: 'gpt-4o',
  }
};

const quickFix: PresetConfig = {
  stages: ['CONTEXT_PACK', 'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER'],
  models: { default: 'gpt-4o-mini' },
};
```

### pr_findings

Findings from PR review (for human review screen).

```sql
CREATE TABLE pr_findings (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,

  -- Finding details
  finding_type TEXT NOT NULL, -- 'error', 'warning', 'info'
  category TEXT, -- 'security', 'performance', 'style', etc.
  file_path TEXT,
  line_number INTEGER,

  message TEXT NOT NULL,
  suggestion TEXT,

  -- Scout/Judge info
  found_by TEXT NOT NULL, -- Scout model
  confirmed_by TEXT, -- Judge model
  confidence REAL, -- 0.0 - 1.0

  -- Human review status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'dismissed'
  reviewed_by TEXT,
  review_comment TEXT,
  reviewed_at INTEGER,

  -- Fix tracking
  fixed INTEGER NOT NULL DEFAULT 0,
  fixed_in_commit TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX pr_findings_issue_idx ON pr_findings(issue_id);
CREATE INDEX pr_findings_status_idx ON pr_findings(status);
```

## Seed Data

### Default Labels

```typescript
const defaultLabels = [
  { name: 'bug', color: '#ef4444', description: 'Something isn\'t working' },
  { name: 'feature', color: '#3b82f6', description: 'New feature request' },
  { name: 'docs', color: '#8b5cf6', description: 'Documentation changes' },
  { name: 'refactor', color: '#f97316', description: 'Code refactoring' },
  { name: 'security', color: '#dc2626', description: 'Security-related' },
  { name: 'performance', color: '#eab308', description: 'Performance improvement' },
  { name: 'test', color: '#22c55e', description: 'Test coverage' },
  { name: 'ux', color: '#ec4899', description: 'User experience' },
  { name: 'data', color: '#06b6d4', description: 'Data model changes' },
  { name: 'foundation', color: '#6366f1', description: 'Core infrastructure' },
  { name: 'migration', color: '#84cc16', description: 'Data migration' },
];
```

### Default Presets

Model identifiers are stored as opaque strings and are not validated at runtime.
Examples below use current provider names and should be updated per deployment.
Quick-fix and docs-only presets skip spec stages but retain review/testing to stay compatible with the shared stage machine.

```typescript
const defaultPresets = [
  {
    name: 'full-pipeline',
    description: 'Complete workflow with all stages',
    config: {
      stages: [
        'BACKLOG', 'TODO', 'CONTEXT_PACK', 'CONTEXT_REVIEW',
        'SPEC', 'SPEC_REVIEW', 'IMPLEMENT', 'PR_REVIEW',
        'PR_HUMAN_REVIEW', 'FIXER', 'TESTING', 'DOC_REVIEW',
        'MERGE_READY', 'DONE'
      ],
      models: {
        default: 'gpt-4o',
        overrides: {
          CONTEXT_PACK: 'gpt-4o-mini',
          SPEC: 'gpt-4o',
          IMPLEMENT: 'gpt-4o',
          PR_REVIEW: 'gpt-4o',
        },
      },
      prReview: {
        orchestrator: 'gpt-4o',
        scouts: ['gpt-4o-mini'],
        judge: 'gpt-4o',
      },
    },
    isDefault: true,
  },
  {
    name: 'quick-fix',
    description: 'Skip spec for minor bug fixes',
    config: {
      stages: [
        'BACKLOG', 'TODO', 'CONTEXT_PACK', 'CONTEXT_REVIEW',
        'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'TESTING',
        'DOC_REVIEW', 'MERGE_READY', 'DONE'
      ],
      models: { default: 'gpt-4o-mini' },
    },
  },
  {
    name: 'docs-only',
    description: 'Documentation-only workflow',
    config: {
      stages: [
        'BACKLOG', 'TODO', 'CONTEXT_PACK', 'CONTEXT_REVIEW',
        'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'TESTING',
        'DOC_REVIEW', 'MERGE_READY', 'DONE'
      ],
      models: { default: 'gpt-4o-mini' },
    },
    forLabel: 'docs',
  },
];
```

## Migration Strategy

### Initial Migration

```typescript
// src/pm/db/migrations/0001_initial.ts
import { sql } from 'drizzle-orm';
import { db } from '../connection';

export async function up() {
  await db.run(sql`
    CREATE TABLE projects (...);
    CREATE TABLE issues (...);
    CREATE TABLE labels (...);
    -- etc.
  `);
}

export async function down() {
  await db.run(sql`
    DROP TABLE IF EXISTS pr_findings;
    DROP TABLE IF EXISTS workflow_runs;
    -- reverse order
  `);
}
```

### Migration Commands

```bash
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit migrate   # Apply migrations
npx drizzle-kit push      # Push schema directly (dev only)
```

## JSON Column Patterns

Use `text` mode for JSON columns (supports SQLite JSON functions):

```typescript
// Schema definition
config: text('config', { mode: 'json' }).$type<ProjectConfig>(),

// Querying JSON fields
const projectsWithGithub = await db.select()
  .from(projects)
  .where(sql`json_extract(${projects.config}, '$.github') IS NOT NULL`);
```

## Indexes Strategy

1. **Primary lookups**: id (automatic)
2. **Foreign keys**: All `_id` columns indexed
3. **Status filtering**: status, stage columns
4. **Unique constraints**: slug, (project_id, name), (project_id, number)
5. **Composite**: Frequently filtered combinations
