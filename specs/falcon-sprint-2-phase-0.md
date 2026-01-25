# Falcon Sprint 2 - Phase 0: Database Foundation

**Status**: Draft
**Depends On**: None
**Outputs Required By**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/architecture.md`, `docs/design/data-model.md`, `docs/design/security.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 0 (Database Foundation) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-0.md` as the source of truth (its Context Pack contains all required schema/contracts and relevant Drizzle notes). Implement the Deliverables Checklist exactly, respect the modular boundaries (`src/pm/core` pure, `src/pm/contracts` browser-safe, `src/pm/db` Node-only), and make the Test Plan pass (`npm test`) while adding the required db migrate/seed scripts.
```

## Context Pack (Read This, Then Implement)

### System Summary

Falcon PM is a local-first project management + orchestration system. This phase establishes the new Falcon PM database and its pure domain types. It does not touch the existing falcon-ai pattern DB (`~/.falcon-ai/db/falcon.db`).

### Repo Reality (Build/Test Constraints)

- Node: `>= 20` (repo is ESM: `package.json` has `"type": "module"`)
- TypeScript: `module`/`moduleResolution` are `NodeNext` (`tsconfig.json`)
- Output: `tsc` emits to `dist/` from `src/` only
- Import convention (important): use `.js` in TS imports for local files, e.g. `import { x } from './x.js'` (matches emitted ESM filenames)
- Tests: `vitest` runs `tests/**/*.test.ts` (`vitest.config.ts`)

### Frozen Module Boundaries (No Exceptions)

- `src/pm/core/**`: pure types + pure functions (no IO imports)
- `src/pm/contracts/**`: browser-safe DTO/types (no Node builtins)
- `src/pm/db/**`: DB + migrations + seed (Node-only)
- No UX code in `src/pm/**` (dashboard lives in `apps/pm-dashboard/` in Phase 2)

### Drizzle + SQLite (Relevant Extract)

From `ai_docs/sqlite-drizzle-patterns.md`:

Install:

```bash
npm i drizzle-orm
npm i -D drizzle-kit
```

`drizzle.config.ts` (repo root):

```ts
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

Generate/apply migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Programmatic migration:

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// migrate(db, { migrationsFolder: './src/pm/db/migrations' });
```

### Authoritative Domain Types (Minimum)

These types are required and must be stable (used by API/UI/orchestrator):

```ts
export type IssueStage =
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

export type AgentType = 'claude' | 'codex';
export type AgentStatus = 'idle' | 'checkout' | 'working' | 'error';
```

### Authoritative Stage Transitions (Pure)

This is the canonical stage transition map used by both API validation and orchestration:

```ts
export const STAGE_TRANSITIONS: Record<IssueStage, readonly IssueStage[]> = {
  BACKLOG: ['TODO'],
  TODO: ['CONTEXT_PACK'],
  CONTEXT_PACK: ['CONTEXT_REVIEW'],
  CONTEXT_REVIEW: ['SPEC', 'IMPLEMENT'],
  SPEC: ['SPEC_REVIEW'],
  SPEC_REVIEW: ['IMPLEMENT', 'SPEC'],
  IMPLEMENT: ['PR_REVIEW'],
  PR_REVIEW: ['PR_HUMAN_REVIEW'],
  PR_HUMAN_REVIEW: ['FIXER', 'TESTING'],
  FIXER: ['PR_REVIEW'],
  TESTING: ['DOC_REVIEW', 'IMPLEMENT'],
  DOC_REVIEW: ['MERGE_READY'],
  MERGE_READY: ['DONE'],
  DONE: [],
};
```

### Authoritative DB Schema (v1)

The following SQL is the authoritative schema. Implement it with Drizzle tables + drizzle-kit migrations.

```sql
-- projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX projects_slug_idx ON projects(slug);

-- issues
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  stage TEXT NOT NULL DEFAULT 'BACKLOG',
  priority TEXT DEFAULT 'medium',
  preset_id TEXT REFERENCES model_presets(id),
  branch_name TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  assigned_agent_id TEXT REFERENCES agents(id),
  assigned_human TEXT,
  attributes TEXT,
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
CREATE INDEX issues_preset_idx ON issues(preset_id);

-- labels
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

-- issue_labels
CREATE TABLE issue_labels (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (issue_id, label_id)
);
CREATE INDEX issue_labels_issue_idx ON issue_labels(issue_id);
CREATE INDEX issue_labels_label_idx ON issue_labels(label_id);

-- agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  current_issue_id TEXT REFERENCES issues(id),
  current_stage TEXT,
  work_dir TEXT NOT NULL,
  config TEXT,
  total_tasks_completed INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project_id, name)
);
CREATE INDEX agents_project_idx ON agents(project_id);
CREATE INDEX agents_status_idx ON agents(status);

-- documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  issue_id TEXT REFERENCES issues(id),
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX documents_project_idx ON documents(project_id);
CREATE INDEX documents_issue_idx ON documents(issue_id);
CREATE INDEX documents_type_idx ON documents(doc_type);

-- comments
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX comments_issue_idx ON comments(issue_id);
CREATE INDEX comments_author_idx ON comments(author_name);

-- stage_messages
CREATE TABLE stage_messages (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  read_at INTEGER,
  read_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX stage_messages_issue_idx ON stage_messages(issue_id);
CREATE INDEX stage_messages_to_stage_idx ON stage_messages(to_stage);
CREATE INDEX stage_messages_unread_idx ON stage_messages(issue_id, to_stage, read_at);

-- model_presets
CREATE TABLE model_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  config TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  for_label TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX model_presets_name_idx ON model_presets(name);
CREATE INDEX model_presets_label_idx ON model_presets(for_label);

-- workflow_runs
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  stage TEXT NOT NULL,
  preset_id TEXT REFERENCES model_presets(id),
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  result_summary TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  cost_usd REAL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX workflow_runs_issue_idx ON workflow_runs(issue_id);
CREATE INDEX workflow_runs_agent_idx ON workflow_runs(agent_id);
CREATE INDEX workflow_runs_status_idx ON workflow_runs(status);

-- pr_findings
CREATE TABLE pr_findings (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  finding_type TEXT NOT NULL,
  category TEXT,
  file_path TEXT,
  line_number INTEGER,
  message TEXT NOT NULL,
  suggestion TEXT,
  found_by TEXT NOT NULL,
  confirmed_by TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  review_comment TEXT,
  reviewed_at INTEGER,
  fixed INTEGER NOT NULL DEFAULT 0,
  fixed_in_commit TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX pr_findings_issue_idx ON pr_findings(issue_id);
CREATE INDEX pr_findings_status_idx ON pr_findings(status);
```

### Authoritative Seed Data (v1)

Built-in labels (names only; colors/descriptions optional but supported):

```
bug, data, docs, foundation, feature, migration, performance, refactor, security, test, ux
```

Default presets (minimum):
- `full-pipeline` (must exist and be `is_default = 1`)
- `quick-fix` (recommended)
- `docs-only` (recommended; `for_label = 'docs'`)

PresetConfig JSON shape stored in `model_presets.config`:

```ts
export interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];
    judge: string;
  };
}
```

## Goal

Establish the Falcon PM persistence layer as a clean, testable module:
- SQLite DB at `~/.falcon/pm.db` (not the existing `~/.falcon-ai/` DB)
- Drizzle schema + migrations + seed data
- Pure domain types in `src/pm/core/` and API/WS contracts in `src/pm/contracts/`

This phase must not introduce any UX code or any Express server code.

---

## npm Dependencies (Phase 0 Only)

Add:

Runtime:
- `drizzle-orm`

Dev:
- `drizzle-kit`

Already present in this repo (do not add duplicates):
- `better-sqlite3`
- `@types/better-sqlite3`

Reference: `ai_docs/sqlite-drizzle-patterns.md`.

---

## Hard Modularity Rules (Phase Gate)

1. `src/pm/core/**` must be IO-free (no filesystem, no network, no child_process, no better-sqlite3 imports).
2. `src/pm/contracts/**` must be IO-free and safe to import from a browser build.
3. `src/pm/db/**` may use filesystem + SQLite, but must not import Express/React.
4. No code under `src/cli/**` is modified in this phase.

---

## Deliverables Checklist

- [ ] `src/pm/core/types.ts` (PM domain types and enums)
- [ ] `src/pm/core/stage-machine.ts` (pure stage transition rules + validation)
- [ ] `src/pm/core/presets.ts` (preset type + default preset identifiers)
- [ ] `src/pm/contracts/http.ts` (REST DTO types + optional zod schemas)
- [ ] `src/pm/contracts/ws.ts` (WebSocket event payload types)
- [ ] `src/pm/db/schema.ts` (Drizzle schema matching this spec's "Authoritative DB Schema (v1)")
- [ ] `src/pm/db/connection.ts` (open DB, enforce pragmas, return drizzle client)
- [ ] `src/pm/db/migrate.ts` (migration runner)
- [ ] `src/pm/db/migrations/` (generated SQL migrations + drizzle meta)
- [ ] `src/pm/db/seed.ts` (seed built-in labels + default presets)
- [ ] `src/pm/db/cli.ts` (internal dev CLI: migrate/seed)
- [ ] `src/pm/db/paths.ts` (Falcon home + pm.db path resolution)
- [ ] `drizzle.config.ts` (drizzle-kit config for sqlite)
- [ ] `tests/pm/db/migrations.test.ts`
- [ ] `tests/pm/db/seed.test.ts`
- [ ] `tests/pm/contracts/contracts-are-browser-safe.test.ts`
- [ ] `tests/pm/core/stage-machine.test.ts`

Optional but recommended:
- [ ] Root `package.json` export for contracts: `./pm-contracts` (types-only import path for the dashboard app)

---

## Data Location and Permissions

### Falcon Home

Implement `getFalconHome()` with this precedence:
1. `FALCON_HOME` env var (tests/dev override)
2. `~/.falcon` (default)

### Database Path

`pm.db` must live at:
`path.join(getFalconHome(), 'pm.db')`

### Permissions

- Create `~/.falcon` with `0o700`
- Create `pm.db` with `0o600` on first creation
- Set pragmas (match existing patterns in `src/storage/db.ts`):
  - `journal_mode = WAL`
  - `foreign_keys = ON`
  - `synchronous = NORMAL`

---

## Schema (Minimum v1)

Implement tables from this spec's "Authoritative DB Schema (v1)":
- `projects`
- `issues`
- `labels`
- `issue_labels`
- `agents`
- `documents`
- `comments`
- `stage_messages`
- `workflow_runs`
- `model_presets`
- `pr_findings`

Notes:
- Use UUIDs as `TEXT` primary keys.
- Use integer unix timestamps (seconds) like the design docs (`unixepoch()`).
- If you deviate from this spec (e.g., add/remove columns), update this spec accordingly (and optionally keep `docs/design/data-model.md` in sync).

---

## Seed Data

Seed the built-in labels (project-scoped) and at least one default model preset.

### Built-in labels (v1)

```
bug, data, docs, foundation, feature, migration, performance, refactor, security, test, ux
```

### Default preset (minimum)

Create a preset named `full-pipeline` with:
- a default model per provider (placeholder strings are OK in Phase 0)
- per-stage overrides supported (even if not used yet)

---

## Implementation Steps

1. Create `src/pm/core/types.ts`
   - Define `IssueStage` union matching this spec's "Authoritative Domain Types (Minimum)"
   - Define `AgentStatus`, `AgentType`
   - Define entity types for the DB rows (Project, Issue, Agent, Label, Document, Comment, StageMessage, ModelPreset, WorkflowRun, PRFinding)

2. Create `src/pm/core/stage-machine.ts`
   - Export:
     - `const STAGE_TRANSITIONS: Record<IssueStage, readonly IssueStage[]>`
     - `function canTransition(from: IssueStage, to: IssueStage): boolean`
   - Transitions must match this spec's "Authoritative Stage Transitions (Pure)"

3. Create `src/pm/core/presets.ts`
   - Define the `PresetConfig` type used by orchestration (Phase 5)
   - Export a stable default preset id/name: `full-pipeline`

4. Create `src/pm/contracts/http.ts` and `src/pm/contracts/ws.ts`
   - Export *types only* (and optional zod schemas)
   - No imports from Node builtins
   - Define canonical response envelope type:
     - `{ data: T, meta?: {...} }` for success
     - `{ error: { code, message, details? } }` for errors

5. Create `src/pm/db/paths.ts`
   - `getFalconHome()`
   - `getPmDbPath()`

6. Create `src/pm/db/connection.ts`
   - `openPmSqlite()` returning `better-sqlite3` DB instance
   - `getPmDb()` returning a drizzle client wired to that DB

7. Create `src/pm/db/schema.ts`
   - Drizzle schema mirroring this spec's "Authoritative DB Schema (v1)"
   - Keep all Drizzle table defs in one place to simplify migrations

8. Create `src/pm/db/migrate.ts`
   - Provide a single `migratePmDb()` function used by both runtime and tests
   - Use `drizzle-orm/better-sqlite3/migrator` + `src/pm/db/migrations` (generated by drizzle-kit)
   - Migrations folder is committed to git (required for deterministic setup)

9. Create `src/pm/db/seed.ts`
   - Idempotent seed (safe to run multiple times)
   - Enforce uniqueness constraints (no duplicate built-in labels)

10. Add `drizzle.config.ts` (repo root)
   - `out: './src/pm/db/migrations'`
   - `schema: './src/pm/db/schema.ts'`
   - `dialect: 'sqlite'`
   - `dbCredentials.url` uses `process.env.DATABASE_URL ?? 'file:~/.falcon/pm.db'`

11. Add `src/pm/db/cli.ts`
   - Commands:
     - `migrate` runs `migratePmDb()`
     - `seed` runs `seedPmDb()`
   - This is a dev tool invoked via npm scripts (not the end-user `falcon` CLI)

---

## Test Plan (Must Be Runnable Locally)

### `tests/pm/db/migrations.test.ts`

- Creates a temp DB file (or `:memory:` if supported by your migration approach)
- Runs `migratePmDb()`
- Asserts that all required tables exist (query `sqlite_master`)

### `tests/pm/db/seed.test.ts`

- Fresh DB, migrate, then run seed twice
- Asserts:
  - exactly 11 built-in labels exist for a project
  - seeding is idempotent (counts unchanged after 2nd run)

### `tests/pm/contracts/contracts-are-browser-safe.test.ts`

- Imports `src/pm/contracts/http.ts` and `src/pm/contracts/ws.ts`
- Asserts they do not import Node builtins (simple heuristic: the module loads under `vitest` + `environment: node` without touching filesystem/network)
- If you add zod schemas, they must still be browser-safe

### `tests/pm/core/stage-machine.test.ts`

- Asserts a few critical allowed transitions (e.g., BACKLOG -> TODO, TODO -> CONTEXT_PACK)
- Asserts a few critical invalid transitions are rejected (e.g., BACKLOG -> IMPLEMENT)

---

## How To Run (Phase 0)

From repo root:

```bash
npm test
```

To run migrations + seed locally (after implementation):

```bash
npm run pm:db:migrate
npm run pm:db:seed
```

Required scripts to add to root `package.json`:
- `pm:db:migrate`: `npm run build && node dist/pm/db/cli.js migrate`
- `pm:db:seed`: `npm run build && node dist/pm/db/cli.js seed`
