# Comprehensive Architecture Reference

## 1. System Overview

### What It Is
Falcon-ai is a pattern-based guardrail system for multi-agent software development. It orchestrates AI agents through a structured workflow pipeline, tracks PR review findings, and injects learned warnings into future agent prompts to prevent recurring issues.

### Tech Stack
- **Runtime**: Node.js with TypeScript (strict mode)
- **Backend**: Express.js REST API + WebSocket (ws library)
- **PM Database**: SQLite via better-sqlite3 + Drizzle ORM (11 tables at `~/.falcon/pm.db`)
- **Guardrail Database**: SQLite via better-sqlite3 (13 tables at `~/.falcon-ai/db/falcon.db`)
- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3 + Zustand + dnd-kit
- **CLI**: Commander.js
- **GitHub**: Octokit REST client
- **Git**: simple-git library
- **LLM Integration**: Anthropic SDK (attribution agent)
- **Schema Validation**: Zod (guardrail entities)
- **Testing**: Vitest, @testing-library/react, MSW 2

### How to Run
```bash
# API server (development, in-memory repos)
# Entry: src/pm/api/main.ts → listens on http://localhost:3002

# Dashboard
cd apps/pm-dashboard && npm run dev  # → http://localhost:5174

# CLI
falcon init / falcon status / falcon health / etc.
```

### Key Environment Variables
| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | GitHub API authentication for PR operations |
| `GITHUB_WEBHOOK_SECRET` | HMAC-SHA256 secret for webhook verification |
| `FALCON_PM_CORS_ORIGINS` | Comma-separated allowed CORS origins |
| `VITE_API_BASE_URL` | Dashboard API base URL (omit for MSW mock mode) |

---

## 2. Layered Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                    CLI (src/cli/)                                  │  User-facing commands
├───────────────────────────────────────────────────────────────────┤
│              Dashboard (apps/pm-dashboard/)                        │  React SPA
├───────────────────────────────┬───────────────────────────────────┤
│    API Layer (src/pm/api/)    │  Workflow Hooks (src/guardrail/workflow/)    │  Express routes + injection hooks
├───────────────────────────────┼────────────────────────────────────────────┤
│ Orchestrator (src/pm/orch.)   │  Attribution (src/guardrail/attribution/)  │  Dispatch + feedback loop
├───────────────────────────────┼────────────────────────────────────────────┤
│ Agent Infra (src/pm/agents/)  │  Injection (src/guardrail/injection/)      │  Invokers + warning selection
├───────────────────────────────┼────────────────────────────────────────────┤
│ GitHub (src/pm/github/)       │  Evolution (src/guardrail/evolution/)      │  PR ops + lifecycle maintenance
├───────────────────────────────┼────────────────────────────────────────────┤
│ Core Domain (src/pm/core/)    │  Schemas (src/guardrail/schemas/)          │  Types + Zod validation
├───────────────────────────────┼────────────────────────────────────────────┤
│ PM Database (src/pm/db/)      │  Guardrail DB (src/guardrail/storage/)     │  Two separate SQLite databases
└───────────────────────────────┴───────────────────────────────────┘
```

The left column is the **PM subsystem** (workflow orchestration). The right column is the **Guardrail subsystem** (pattern attribution → injection feedback loop). They connect at the Workflow Hooks layer.

---

## 3. Source Code Map

### Top-Level Structure
```
drizzle.config.ts                # Drizzle ORM migration configuration
vitest.config.ts                 # Vitest test runner configuration

src/
├── cli/                         # CLI entry point and commands
│   ├── index.ts                 # Commander.js app (15 registered commands)
│   └── commands/                # Individual command modules
├── config/                      # YAML config loader, scope resolver (shared)
├── types/                       # Shared type definitions
├── guardrail/                   # All guardrail modules grouped here
│   ├── attribution/             # Pattern attribution engine (Phase 2)
│   ├── injection/               # Warning injection system (Phase 3)
│   ├── workflow/                # Workflow integration hooks (Phase 4)
│   ├── evolution/               # Pattern lifecycle maintenance (Phase 5)
│   ├── storage/                 # Guardrail database + repositories
│   ├── schemas/                 # Zod schemas for all guardrail entities
│   ├── metrics/                 # Attribution health metrics
│   ├── services/                # Kill switch service
│   └── utils/                   # Category mapping utilities
└── pm/
    ├── core/                    # Domain model
    ├── api/                     # HTTP + WebSocket
    ├── orchestrator/            # Workflow automation
    ├── agents/                  # Agent infrastructure
    ├── github/                  # GitHub integration
    ├── db/                      # PM database layer
    └── contracts/               # Shared DTOs and WS types

apps/
└── pm-dashboard/                # React frontend
    └── src/
        ├── components/          # KanbanBoard, IssueColumn, IssueCard, StageBadge, IssueDetailModal
        ├── stores/              # Zustand stores (projects, issues, ui, types)
        ├── api/                 # API client and DTO types
        ├── hooks/               # useWebSocket
        ├── utils/               # Stage utilities, assertNever
        └── mocks/               # MSW handlers, browser/server setup, mock data
```

### `src/pm/core/` — Domain Model
| File | Purpose |
|------|---------|
| `types.ts` | All entity interfaces: Project, Issue, Label, Agent, Document, Comment, StageMessage, ModelPreset, WorkflowRun, PRFinding. Type aliases: IssueStage (14 values), AgentType, AgentStatus |
| `stage-machine.ts` | `STAGE_TRANSITIONS` map and `canTransition(from, to)` function |
| `events.ts` | WebSocket event factory functions: `projectEvent()`, `issueEvent()`, `commentCreatedEvent()`, `labelCreatedEvent()`, `documentCreatedEvent()`, `isWsEvent()` type guard |
| `presets.ts` | `PresetConfig` interface: `{ stages: IssueStage[], models: { default, overrides? }, prReview?: { orchestrator, scouts, judge } }`, `DEFAULT_PRESET_NAME = 'full-pipeline'` |
| `errors.ts` | ErrorCode type (NOT_FOUND, VALIDATION_ERROR, CONFLICT, AGENT_BUSY, INVALID_TRANSITION, INTERNAL_ERROR), ServiceError interface, `createError()` factory |
| `repos/index.ts` | `PmRepos` aggregate interface of all 8 repositories |
| `repos/projects.ts` | ProjectRepo: list, getById, getBySlug, create, update, delete |
| `repos/issues.ts` | IssueRepo: listByProject, getById, create, update, delete, setLabels, nextNumber |
| `repos/labels.ts` | LabelRepo: listByProject, getById, getByName, create |
| `repos/comments.ts` | CommentRepo: listByIssue, create |
| `repos/documents.ts` | DocumentRepo: listByIssue, create |
| `repos/agents.ts` | AgentRepo: listByProject, getById, create, update |
| `repos/stage-messages.ts` | StageMessageRepo: listByIssue, listUnreadByStage, create, markRead |
| `repos/workflow-runs.ts` | WorkflowRunRepo: listByIssue, getById, create, update |
| `services/index.ts` | `createPmServices(repos)` factory returning all services |
| `services/*.ts` | ProjectsService, IssuesService, LabelsService, CommentsService, DocumentsService, AgentsService, StageMessagesService, WorkflowRunsService |
| `testing/in-memory-repos.ts` | In-memory implementations of all repos for testing |
| `utils/time.ts` | `unixSeconds()` helper |
| `utils/slugify.ts` | Slug generation utility for project slugs |
| `services/service-result.ts` | `ServiceResult<T>` type for service return values |

### `src/pm/api/` — API Layer
| File | Purpose |
|------|---------|
| `server.ts` | Express app factory: CORS, security headers, rate limiting, route mounting |
| `main.ts` | Entry point: creates server with in-memory repos, listens on port 3002 |
| `websocket.ts` | WebSocket hub: client tracking, pub/sub channels, output bus bridging |
| `broadcast.ts` | `WsBroadcaster` type, `broadcastEvents()` routing to project/issue channels |
| `validation.ts` | `LIMITS` object, `PAGINATION` defaults, `requireString()`, `isSafeRelativePath()`, `parsePagination()` |
| `response.ts` | `sendSuccess(res, data, meta?)` |
| `http-errors.ts` | `HTTP_STATUS_BY_CODE` map, `sendError(res, error)` |
| `routes/projects.ts` | CRUD: GET /, POST /, GET /:id, PATCH /:id, DELETE /:id |
| `routes/issues.ts` | CRUD + workflow: GET /, POST /, GET /:id, PATCH /:id, DELETE /:id, POST /:id/start, POST /:id/transition |
| `routes/labels.ts` | GET /, POST / |
| `routes/comments.ts` | GET /, POST / |
| `routes/documents.ts` | GET /, POST / |
| `routes/agent/issues.ts` | Agent endpoints: GET /:id/context, GET /:id/messages, POST /:id/comment, POST /:id/stage-message, POST /:id/work-complete, POST /:id/error |
| `routes/github-webhook.ts` | POST /: HMAC verification, replay protection, PR event processing |

### `src/pm/orchestrator/` — Workflow Automation
| File | Purpose |
|------|---------|
| `runner.ts` | `OrchestratorRunner` class: poll loop, tick(), finalizeRuns(), dispatchStage(), autoAdvance, ensurePullRequest, maybePostReviewComment, maybeAutoMerge, syncIdleAgents |
| `workflow-executor.ts` | `WorkflowExecutor` class: builds XML-sanitized prompts, invokes agents via `AgentInvoker` |
| `preset-resolver.ts` | `resolvePreset()` (by presetId → isDefault → name), `resolveStageModel()`, `nextStageForPreset()` |
| `dispatcher.ts` | `selectAgentForStage()`: finds idle agent matching project + model |
| `state.ts` | `OrchestratorState`, `OrchestratorRunState`, `IssueOrchestrationAttributes` types |

### `src/pm/agents/` — Agent Infrastructure
| File | Purpose |
|------|---------|
| `lifecycle.ts` | Pure functions: createLifecycleState, markIdle, beginCheckout, markWorking, markDone, markError, releaseAgent |
| `registry.ts` | `AgentRegistry` interface + `InMemoryAgentRegistry`: getAgent, listAgents, upsertAgent, updateAgent, removeAgent |
| `provisioner.ts` | `provisionAgent()`: ensure project layout, validate git config, clone repo, configure git user, symlink shared resources |
| `git-sync.ts` | `cloneAgentRepository()`, `checkoutIssueBranch()`, `syncIdleAgentToBase()`, `pullRebase()`, `commitAndPushAgentWork()`, `getAgentStatus()` |
| `fs-layout.ts` | Path construction: getProjectRoot, getPrimaryPath, getAgentsRoot, getAgentWorktreePath, getIssuesRoot, getIssuePath. All with path traversal validation |
| `invokers/agent-invoker.ts` | `AgentInvoker` interface: `invokeStage(args) → { runId }` |
| `invokers/claude-code-invoker.ts` | `ClaudeCodeInvoker`: spawns Claude CLI, max 5 concurrent, 5-min timeout, 50KB prompt limit, stream-json output parsing, credential scrubbing |
| `invokers/codex-cli-invoker.ts` | `CodexCliInvoker`: spawns Codex CLI, same constraints as Claude invoker |
| `invokers/fake-agent-invoker.ts` | `FakeAgentInvoker`: test double, validates args, publishes mock output |
| `invokers/credential-scrubber.ts` | `scrubCredentials()`: 14 regex patterns replacing tokens/keys/URLs with `[REDACTED]` |
| `output/output-bus.ts` | `OutputBus` class: publish/subscribe per runId, listener error isolation |

### `src/pm/github/` — GitHub Integration
| File | Purpose |
|------|---------|
| `adapter.ts` | `GitHubAdapter` interface + `OctokitGitHubAdapter` class wrapping all operations |
| `client.ts` | `createOctokitFromEnv()`: loads GITHUB_TOKEN, 30s timeout, custom user-agent |
| `pr-creator.ts` | `createPullRequest()`: parses repo URL, creates PR via Octokit |
| `comment-poster.ts` | `upsertBotComment()`: marker-based (`<!-- falcon-bot:{id} -->`) comment upsert, 20-page search |
| `merger.ts` | `mergePullRequest()`: squash merge by default |
| `pr-status.ts` | `getPullRequestStatus()`: fetches PR + reviews, aggregates latest per reviewer, returns isApproved/isMergeable |
| `repo.ts` | `parseRepoUrl()`: HTTPS, SSH, short format → `{ owner, repo }` |

### `src/pm/db/` — Database Layer
| File | Purpose |
|------|---------|
| `schema.ts` | Drizzle table definitions for all 11 tables with indexes and constraints |
| `connection.ts` | `openPmSqlite()`: WAL mode, foreign keys, NORMAL sync, directory permission checks (0o700), atomic file creation |
| `migrate.ts` | `migratePmDb()`: runs pending Drizzle migrations |
| `seed.ts` | `seedPmDb()`: seeds 11 builtin labels (bug, data, docs, foundation, feature, migration, performance, refactor, security, test, ux) + 3 presets (full-pipeline, quick-fix, docs-only) |
| `paths.ts` | `getFalconHome()`: validates FALCON_HOME env or defaults to `~/.falcon`. `getPmDbPath()`: returns `~/.falcon/pm.db` |
| `cli.ts` | Database CLI commands: `npm run pm-db migrate`, `npm run pm-db seed` |
| `path-validation.ts` | Path traversal validation for database file paths |
| `repos/*.ts` | Drizzle implementations of all 8 PmRepos interfaces |

### `src/pm/contracts/` — Shared Types
| File | Purpose |
|------|---------|
| `http.ts` | All DTO types (ProjectDto, IssueDto, etc.), API response envelopes (ApiSuccess, ApiError), enums (IssueStatus, IssuePriority, etc.) |
| `ws.ts` | WebSocket event types (WsEventType), event interfaces (ProjectEvent, IssueEvent, etc.), server/client message types |

---

## 4. The 14-Stage Workflow State Machine

### Stage Definitions

| Stage | Status | Description |
|-------|--------|-------------|
| BACKLOG | backlog | Issue exists but not started |
| TODO | todo | Ready for work (auto-advanced by orchestrator) |
| CONTEXT_PACK | in_progress | Agent generates context pack document |
| CONTEXT_REVIEW | in_progress | Review of context pack |
| SPEC | in_progress | Agent writes specification |
| SPEC_REVIEW | in_progress | Review of specification |
| IMPLEMENT | in_progress | Agent implements the code |
| PR_REVIEW | in_progress | Automated PR review (scouts + judges) |
| PR_HUMAN_REVIEW | in_progress | Human gate — review PR findings |
| FIXER | in_progress | Agent fixes PR review findings |
| TESTING | in_progress | Testing phase |
| DOC_REVIEW | in_progress | Documentation review |
| MERGE_READY | in_progress | Human gate — approve merge |
| DONE | done | Terminal state |

### Transition Map
Source: `src/pm/core/stage-machine.ts`

```typescript
STAGE_TRANSITIONS = {
  BACKLOG:         ['TODO'],
  TODO:            ['CONTEXT_PACK'],
  CONTEXT_PACK:    ['CONTEXT_REVIEW'],
  CONTEXT_REVIEW:  ['SPEC', 'IMPLEMENT'],
  SPEC:            ['SPEC_REVIEW'],
  SPEC_REVIEW:     ['IMPLEMENT', 'SPEC'],
  IMPLEMENT:       ['PR_REVIEW'],
  PR_REVIEW:       ['PR_HUMAN_REVIEW'],
  PR_HUMAN_REVIEW: ['FIXER', 'TESTING'],
  FIXER:           ['PR_REVIEW'],
  TESTING:         ['DOC_REVIEW', 'IMPLEMENT'],
  DOC_REVIEW:      ['MERGE_READY'],
  MERGE_READY:     ['DONE'],
  DONE:            [],
}
```

### Special Stage Behaviors
- **Auto-advance**: TODO is auto-advanced (orchestrator skips it immediately)
- **Human gates**: PR_HUMAN_REVIEW and MERGE_READY require human action
- **Loop stages**: SPEC_REVIEW→SPEC (re-spec), FIXER→PR_REVIEW (re-review), TESTING→IMPLEMENT (rework)

---

## 5. Orchestrator

Source: `src/pm/orchestrator/runner.ts`

### Poll Loop
The `OrchestratorRunner` runs a continuous `tick()` loop at a configurable interval (default 2500ms, minimum 100ms):

1. **Finalize completed runs**: Check `inFlightRuns` map for completed/errored runs. Record workflow run, release agent, advance to next stage.
2. **Scan issues**: For each non-DONE, non-BACKLOG, non-in-flight issue:
   - Skip if issue has `orchestrationError` attribute
   - Resolve model preset (by presetId → isDefault → name)
   - Auto-advance through TODO
   - Handle special stages (PR_REVIEW: ensure PR; PR_HUMAN_REVIEW: post comment; MERGE_READY: auto-merge)
   - Skip human gates
   - Select idle agent matching project + model
   - Dispatch stage

### Preset Resolution
Source: `src/pm/orchestrator/preset-resolver.ts`

Resolution order:
1. By `issue.presetId` (explicit assignment)
2. By `preset.isDefault === true`
3. By `preset.name === 'default'`

Each preset has a config with:
- `stages`: ordered list of stages to execute
- `models.default`: default model name
- `models.overrides`: per-stage model overrides

### Agent Dispatch
Source: `src/pm/orchestrator/dispatcher.ts`

`selectAgentForStage()` finds an agent where:
- `agent.projectId === projectId`
- `agent.status === 'idle'` (DB status)
- `agent.model === model`
- Registry status is 'IDLE'

### Finalization
When a run completes:
1. Record `WorkflowRun` in database
2. Release agent (status → idle, currentIssueId → null)
3. Resolve next stage from preset
4. Validate transition via `canTransition()`
5. Update issue stage

### Special Stage Handling

**PR_REVIEW**: Calls `ensurePullRequest()` — creates GitHub PR if `prNumber` is null. Requires `project.repoUrl` and `issue.branchName`.

**PR_HUMAN_REVIEW**: Calls `maybePostReviewComment()` — collects unread stage messages for PR_HUMAN_REVIEW, joins them, and posts/updates a bot comment on the PR. Sets `needsHumanAttention: true`.

**MERGE_READY**: Calls `maybeAutoMerge()` — if `autoMerge` attribute is set, checks PR approval and mergeable status. Transient states (blocked, behind, unstable) are silently skipped for retry. On success, transitions to DONE and syncs all idle agents to base branch.

---

## 6. Agent Infrastructure

### Lifecycle State Machine
Source: `src/pm/agents/lifecycle.ts`

```
INIT ──► IDLE ──► CHECKOUT ──► WORKING ──► DONE ──► IDLE
                                  │                    ▲
                                  ▼                    │
                                ERROR ─────────────────┘
```

Valid transitions:
- `INIT → IDLE`
- `IDLE → CHECKOUT`
- `CHECKOUT → WORKING`
- `WORKING → DONE`
- `DONE → IDLE`
- `ERROR → IDLE`
- Any → `ERROR`

### Registry
Source: `src/pm/agents/registry.ts`

`InMemoryAgentRegistry` tracks `AgentRecord`s in a Map:
```typescript
interface AgentRecord {
  id: string;
  agentName: string;
  projectSlug: string;
  worktreePath: string;
  status: AgentStatus;  // INIT | IDLE | CHECKOUT | WORKING | DONE | ERROR
  issueId: string | null;
  lastError?: string | null;
}
```

### Provisioning
Source: `src/pm/agents/provisioner.ts`

`provisionAgent()` steps:
1. Ensure project layout: `{falconHome}/projects/{slug}/primary/`, `agents/`, `issues/`
2. Validate git config values (reject newlines/control chars to prevent injection)
3. Clone repository (hooks disabled, shallow clone, then unshallow)
4. Configure local git user.name and user.email
5. Symlink shared resources: `node_modules`, `.falcon/CORE`

### File System Layout
Source: `src/pm/agents/fs-layout.ts`

```
{FALCON_HOME}/
  projects/
    {projectSlug}/
      primary/                    # Main repository clone
      agents/
        {agentName}/              # Agent git worktree
      issues/
        {issueId}/                # Issue state directory
```

All path functions validate against path traversal (no `..`, no absolute paths, no control chars).

### Git Sync Operations
Source: `src/pm/agents/git-sync.ts`

| Function | Purpose |
|----------|---------|
| `cloneAgentRepository()` | Shallow clone with hooks disabled (`-c core.hooksPath=/dev/null`), then unshallow. Atomic mkdir to prevent TOCTOU race. |
| `checkoutIssueBranch()` | Check uncommitted changes, checkout or create branch from base |
| `syncIdleAgentToBase()` | Fetch + checkout + pull base branch (for post-merge sync) |
| `pullRebase()` | Rebase current branch on remote |
| `commitAndPushAgentWork()` | Add files (with flag injection prevention), commit, push with -u |
| `getAgentStatus()` | Return git status of agent worktree |

All operations scrub credentials from error messages.

### Invokers
Source: `src/pm/agents/invokers/`

All invokers implement `AgentInvoker`:
```typescript
interface AgentInvokeArgs {
  agentId: string;
  issueId: string;
  stage: string;
  prompt: string;
  toolBaseUrl: string;
  debug: boolean;
}
```

**ClaudeCodeInvoker**: Spawns `claude` CLI with `--print --verbose --dangerously-skip-permissions --output-format stream-json`. Max 5 concurrent, 5-min timeout, 50KB prompt limit. Parses `content_block_delta` → `assistant` → `result` events. Scrubs credentials from all output.

**CodexCliInvoker**: Spawns `codex exec` with `--json`. Same concurrency/timeout/prompt limits.

**FakeAgentInvoker**: Test double that validates args and publishes mock output.

### Output Streaming
Source: `src/pm/agents/output/output-bus.ts`

`OutputBus` is a pub/sub system keyed by `runId`:
- `publish(input)`: Adds timestamp, dispatches to all listeners for that runId
- `subscribe(runId, listener)`: Returns unsubscribe function
- Listener errors are caught and logged (won't crash server)

The WebSocket hub bridges OutputBus → `run:{runId}` channels for real-time streaming to dashboard.

---

## 7. API Layer

### Server Setup
Source: `src/pm/api/server.ts`

```typescript
function createApiServer(options: { repos: PmRepos; broadcaster?: WsBroadcaster }): Express
```

Middleware stack:
1. CORS (configurable origins, defaults to localhost:5174, localhost:3000)
2. Security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, CSP
3. Rate limiting: 100 req/min (API), 60 req/min (webhook)
4. Webhook route (registered before global JSON parser for raw body capture)
5. Global JSON parser (100kb limit)
6. Domain routes

### Route Map

| Method | Path | Router | Purpose |
|--------|------|--------|---------|
| GET | /api/projects | projects | List projects (paginated) |
| POST | /api/projects | projects | Create project |
| GET | /api/projects/:id | projects | Get project |
| PATCH | /api/projects/:id | projects | Update project |
| DELETE | /api/projects/:id | projects | Delete project |
| GET | /api/issues | issues | List issues by projectId (paginated) |
| POST | /api/issues | issues | Create issue |
| GET | /api/issues/:id | issues | Get issue |
| PATCH | /api/issues/:id | issues | Update issue (title, description, priority, labelIds) |
| DELETE | /api/issues/:id | issues | Delete issue |
| POST | /api/issues/:id/start | issues | Start issue workflow (with presetId) |
| POST | /api/issues/:id/transition | issues | Transition to stage |
| GET | /api/projects/:id/labels | labels | List labels (paginated) |
| POST | /api/projects/:id/labels | labels | Create label |
| GET | /api/issues/:id/comments | comments | List comments (paginated) |
| POST | /api/issues/:id/comments | comments | Create comment |
| GET | /api/issues/:id/documents | documents | List documents (paginated) |
| POST | /api/issues/:id/documents | documents | Create document |
| GET | /api/agent/issues/:id/context | agent | Get issue context for agent (X-Agent-ID header) |
| GET | /api/agent/issues/:id/messages | agent | Get stage messages (forStage query param) |
| POST | /api/agent/issues/:id/comment | agent | Agent posts comment |
| POST | /api/agent/issues/:id/stage-message | agent | Agent posts stage transition message |
| POST | /api/agent/issues/:id/work-complete | agent | Agent reports work completion |
| POST | /api/agent/issues/:id/error | agent | Agent reports error |
| POST | /api/github/webhook | webhook | GitHub pull_request event handler |

### Validation
Source: `src/pm/api/validation.ts`

Field limits: id=100, name=200, slug=120, title=200, description=5000, comment=5000, authorName=100, color=50, filePath=500, contentHash=256, branch=100, url=500, labelIds=50.

Pagination: defaultPage=1, defaultPerPage=50, maxPerPage=100.

Path safety: `isSafeRelativePath()` rejects absolute paths, Windows drive letters, UNC paths, `..` segments.

### Response Format

Success: `{ data: T, meta?: { total, page, perPage } }`
Error: `{ error: { code: ErrorCode, message: string, details?: unknown } }`

HTTP status mapping: NOT_FOUND→404, VALIDATION_ERROR→400, CONFLICT→409, AGENT_BUSY→409, INVALID_TRANSITION→400, INTERNAL_ERROR→500.

### WebSocket
Source: `src/pm/api/websocket.ts`

Path: `/ws`, max payload: 64KB.

Resource limits: max 100 subscriptions per client, channel name max 256 chars, regex `^[a-zA-Z0-9:_-]+$`.

Server messages: `connected`, `subscribed`, `unsubscribed`, `pong`, `event`, `error`.
Client messages: `subscribe`, `unsubscribe`, `ping`.

Channel patterns:
- `project:{projectId}` — project and issue domain events
- `issue:{issueId}` — issue-specific events
- `run:{runId}` — agent output streaming (bridges OutputBus)

---

## 8. Database

The system uses **two separate SQLite databases**:

| Database | Path | ORM | Tables | Purpose |
|----------|------|-----|--------|---------|
| **PM Database** | `~/.falcon/pm.db` | Drizzle ORM | 11 | Workflow state — projects, issues, agents, presets, runs |
| **Guardrail Database** | `~/.falcon-ai/db/falcon.db` | raw better-sqlite3 | 13 | Pattern attribution — patterns, principles, alerts, injection logs |

See Section 15 for the Guardrail Database schema.

### PM Database Technology
- **Engine**: SQLite via better-sqlite3
- **ORM**: Drizzle ORM with drizzle-kit for migrations
- **Mode**: WAL (Write-Ahead Logging) for concurrent readers
- **Settings**: Foreign keys enabled, NORMAL synchronous mode
- **Security**: Database directory permissions 0o700, atomic file creation
- **Seed data**: 11 builtin labels + 3 model presets (full-pipeline, quick-fix, docs-only)

### PM 11-Table Overview

| Table | Primary Key | Foreign Keys | Purpose |
|-------|------------|--------------|---------|
| projects | id (UUID) | — | Workspace projects |
| issues | id (UUID) | projectId → projects.id | Workflow issues with stage tracking |
| labels | id (UUID) | projectId → projects.id | Issue labels with colors |
| issue_labels | (issueId, labelId) composite | issueId → issues.id, labelId → labels.id (cascade) | Many-to-many |
| agents | id (UUID) | projectId → projects.id | AI agent records |
| documents | id (UUID) | projectId → projects.id, issueId → issues.id | Context packs, specs, etc. |
| comments | id (UUID) | issueId → issues.id (cascade) | Issue comments |
| stage_messages | id (UUID) | issueId → issues.id (cascade) | Inter-stage messages with read tracking |
| model_presets | id (UUID) | — | Model configuration presets |
| workflow_runs | id (UUID) | issueId → issues.id, agentId → agents.id, presetId → model_presets.id | Execution records with cost/token tracking |
| pr_findings | id (UUID) | issueId → issues.id (cascade) | PR review findings with fix tracking |

See `docs/system/db.md` for complete schema details.

---

## 9. Frontend / Dashboard

### Technology
- React 18.3.1 + ReactDOM
- Vite 5.4.0 (dev server on port 5174)
- TypeScript 5.5.0 (strict)
- Tailwind CSS 3.4.10 (PostCSS)
- Zustand 4.5.4 (state management)
- @dnd-kit/core + @dnd-kit/sortable (drag and drop)
- MSW 2.3.5 (API mocking)
- Vitest 2.0.0 + @testing-library/react 16.0.0

### Architecture
- **Entry**: `main.tsx` — conditionally starts MSW worker if `VITE_API_BASE_URL` not set
- **App.tsx**: Root component, loads projects/issues/labels, manages WebSocket subscriptions, handles drag-drop, renders modals/error banners

### Components
| Component | Purpose |
|-----------|---------|
| `KanbanBoard` | DndContext wrapper, groups issues by stage, renders columns |
| `IssueColumn` | Droppable column per stage, renders cards with sortable context |
| `IssueCard` | Draggable card showing issue #, title, labels, agent assignment |
| `StageBadge` | Colored badge for stage (14 distinct colors) |
| `IssueDetailModal` | Modal with metadata, description, label toggles, comments, add comment form |

### State Management (Zustand)
| Store | Key State |
|-------|-----------|
| `useProjectStore` | `projects: AsyncState<ProjectDto[]>`, `selectedProjectId`, loadProjects(), selectProject() |
| `useIssuesStore` | `issues: AsyncState<IssueDto[]>`, `labelsByProjectId`, `commentsByIssueId`, `pendingMoveOriginalStage`. Supports loadIssues(), loadLabels(), loadComments(), addComment(), moveIssueStage() (optimistic), updateLabels(), replaceIssue() |
| `useUiStore` | `selectedIssueId`, `errorBanner`, openIssue(), closeIssue(), setError(), clearError() |

`AsyncState<T>` discriminated union: `idle | loading | success | error`

### WebSocket Integration
Hook: `useWebSocket({ url, onEvent, subscriptions })` with exponential backoff reconnection (1s → 30s max), 30s ping interval.

Event routing in App.tsx:
- `issue.*` → reload issues
- `label.created` → reload labels
- `comment.created` → reload comments for affected issue

See `docs/system/ux.md` for full UX documentation.

---

## 10. GitHub Integration

### Adapter Pattern
Source: `src/pm/github/adapter.ts`

```typescript
interface GitHubAdapter {
  createPullRequest(input): Promise<PullRequestInfo>
  upsertBotComment(input): Promise<void>
  mergePullRequest(input): Promise<void>
  getPullRequestStatus(input): Promise<PullRequestStatus>
}
```

`OctokitGitHubAdapter` implements this interface, wrapping individual module functions.

### PR Operations
- **Create**: Parses repo URL → `{ owner, repo }`, calls `octokit.rest.pulls.create()`
- **Comment**: Marker-based upsert with `<!-- falcon-bot:{identifier} -->`. Searches up to 20 pages (2000 comments)
- **Merge**: Squash merge by default. `GitHubMergeError` on failure
- **Status**: Fetches PR + reviews, sorts by submitted_at, latest per reviewer wins. Returns `{ isApproved, isMergeable, mergeableState, reviewDecision }`

### Webhook Processing
Source: `src/pm/api/routes/github-webhook.ts`

1. Verify HMAC-SHA256 signature (timing-safe comparison)
2. Check delivery ID replay cache (5-min TTL, 10K max entries, 10% LRU eviction)
3. Filter for `pull_request` events only
4. Validate prNumber is positive integer
5. Match project by repo URL (case-insensitive owner+repo)
6. Match issue by prNumber or branchName
7. Update issue prNumber and prUrl

---

## 11. Pattern Attribution

Source: `src/guardrail/attribution/`

The attribution engine traces PR review findings back to the guidance that caused them. This is the core feedback mechanism.

### Attribution Pipeline

The `AttributionOrchestrator` (`src/guardrail/attribution/orchestrator.ts`) runs this pipeline for each confirmed finding:

1. **Check kill switch** — if FULLY_PAUSED, log only; if INFERRED_PAUSED, skip inferred quotes
2. **Run Attribution Agent** (`src/guardrail/attribution/agent.ts`) — calls Anthropic API (claude-sonnet-4-20250514) to extract an `EvidenceBundle` from the finding + context pack + spec
3. **Resolve failure mode** (`src/guardrail/attribution/failure-mode-resolver.ts`) — deterministic 5-step decision tree (NOT LLM):
   - Step A: Synthesis drift detection (source disagrees with carrier)
   - Step B: Mandatory doc missing check
   - Step C: Unresolved conflicts detection
   - Step D: Ambiguity vs incompleteness scoring
   - Step E: Default based on carrierInstructionKind
4. **Check for noncompliance** (`src/guardrail/attribution/noncompliance-checker.ts`) — keyword search for existing guidance the agent ignored (relevanceScore >= 0.3)
5. **Route by kill switch state** — ACTIVE: create pattern; INFERRED_PAUSED: verbatim/paraphrase only; FULLY_PAUSED: record outcome only
6. **Handle decisions findings** — creates DocUpdateRequest for decisions category
7. **Check for provisional alert** — HIGH/CRITICAL + inferred quote → short-lived alert
8. **Create/update pattern + occurrence** — dedup by SHA-256 patternKey, track severity escalation
9. **Record attribution outcome** — for kill switch health evaluation

### Key Design Decisions

- **patternKey** = SHA-256(carrierStage | patternContent | findingCategory) — deterministic, not LLM-named
- **Evidence quality ranking**: verbatim > paraphrase > inferred (affects confidence base: 0.75, 0.55, 0.4)
- **Touch extraction** via regex: user_input, database, network, auth, authz, caching, schema, logging, config, api
- **Provenance chain**: fingerprint chain from carrier → origin documents

### Files

| File | Purpose |
|------|---------|
| `agent.ts` | LLM agent: calls Anthropic API, validates EvidenceBundle via Zod |
| `failure-mode-resolver.ts` | Deterministic 5-step decision tree → FailureMode + confidenceModifier |
| `noncompliance-checker.ts` | Keyword-based search of context pack/spec for violated guidance |
| `orchestrator.ts` | Full pipeline: kill switch → agent → resolver → noncompliance → pattern → alert |
| `prompts/attribution-agent.ts` | System and user prompt templates for the Attribution Agent LLM call |
| `index.ts` | Re-exports all public APIs |

### Failure Modes (enum)

`incorrect`, `incomplete`, `missing_reference`, `ambiguous`, `conflict_unresolved`, `synthesis_drift`

---

## 12. Injection System

Source: `src/guardrail/injection/`

The injection system selects warnings from stored patterns and principles, then formats them for inclusion in agent prompts.

### Warning Selection Algorithm

`selectWarningsForInjection()` (`src/guardrail/injection/selector.ts`) uses tiered selection:

1. **Baseline principles** (workspace level): max 2 if confidence < 0.5, else 1. Sorted by touch overlap.
2. **Derived principles** (workspace level): top 1 by touch overlap + confidence.
3. **Project patterns**: filtered by target (context-pack/spec) + TaskProfile match (touches, technologies, taskTypes).
4. **Cross-project patterns** (optional): relevance gate ≥2 touch overlap OR (≥1 touch + ≥1 tech). 5% priority penalty.
5. **Security patterns first**: 3 max slots, sorted by priority DESC, severityMax DESC.
6. **Fill remaining**: non-security patterns up to maxTotal=6.
7. **Low-confidence fallback**: if confidence < 0.5, add 2 high-severity patterns at 80% priority.
8. **Provisional alerts**: additive (not counted against 6-cap), filtered by active + not expired + touch overlap.

**Total cap**: 6 warnings (2 baseline + 4 learned), plus unbounded alerts.

### Confidence and Priority Scoring

`computeAttributionConfidence()` (`src/guardrail/injection/confidence.ts`):
- Base by quote type: verbatim=0.75, paraphrase=0.55, inferred=0.4
- Occurrence boost: min(activeOccurrences - 1, 5) × 0.05 (max +0.25)
- Decay penalty: min(daysSince / 90, 1.0) × 0.15 (90-day half-life)
- Synthesis drift flag: -0.15
- Clamped to [0, 1]

`computeInjectionPriority()`:
- Formula: confidence × severityWeight × relevanceWeight × recencyWeight × crossProjectMultiplier
- Severity weights: CRITICAL=1.0, HIGH=0.9, MEDIUM=0.7, LOW=0.5
- Relevance: min(1.0 + 0.15×touchOverlaps + 0.05×techOverlaps, 1.5)
- Recency: ≤7d=1.0, ≤30d=0.95, ≤90d=0.9, >90d=0.8
- Cross-project penalty: 0.95

### Task Profile Extraction

`extractTaskProfileFromIssue()` and `extractTaskProfileFromContextPack()` (`src/guardrail/injection/task-profile-extractor.ts`):
- Extract touches (10 domains), technologies (20+ keywords), taskTypes (12 types) from issue/metadata text via regex
- Auto-correction via `validateTaskProfile()` adds missing touches based on constraint patterns

### Formatting

`formatInjectionForPrompt()` (`src/guardrail/injection/formatter.ts`):
- Provisional alerts section: `## PROVISIONAL ALERTS (auto-generated)`
- Warnings section: `## Warnings from Past Issues (auto-generated)`
- Patterns show: `[CATEGORY][failureMode][severity]` + bad guidance + observed result + do instead + applies when
- Principles show: `[BASELINE|DERIVED]` + principle + rationale + applies when
- Meta-warning: "DO NOT cite these warnings as sources"

### Kill Switch

`getKillSwitchState()` (`src/guardrail/injection/kill-switch-check.ts`):
- Three states: `active` (all patterns), `inferred_paused` (verbatim/paraphrase only), `fully_paused` (log-only)
- Attribution checks state before pattern creation
- Health evaluation triggers state transitions based on 30-day rolling metrics

### Files

| File | Purpose |
|------|---------|
| `selector.ts` | Tiered warning selection with 6-cap, security priority, cross-project support |
| `confidence.ts` | Attribution confidence + injection priority scoring formulas |
| `formatter.ts` | Markdown formatting for prompt injection (patterns, principles, alerts) |
| `task-profile-extractor.ts` | Touch/technology/taskType extraction from issues and context packs |
| `task-profile-validator.ts` | Auto-correction of missing touches based on constraint patterns |
| `kill-switch-check.ts` | Kill switch state queries (active, inferred_paused, fully_paused) |
| `context-pack-metadata.ts` | Context pack metadata extraction |
| `index.ts` | Re-exports all public APIs |

---

## 13. Evolution System

Source: `src/guardrail/evolution/`

Manages pattern lifecycle: confidence decay, provisional alert expiry/promotion, salience detection, tagging miss resolution, and pattern-to-principle promotion.

### Daily Maintenance

`runDailyMaintenance()` (`src/guardrail/evolution/scheduler.ts`) orchestrates:

1. **Confidence decay** (`decay-processor.ts`): Archives patterns with confidence < 0.2. Skips permanent patterns.
2. **Provisional alert expiry** (`provisional-alert-processor.ts`): 14-day TTL. Promotes to pattern if 2+ occurrences, otherwise marks expired.
3. **Salience detection** (`salience-detector.ts`): Detects guidance ignored 3+ times within 30 days. Creates SalienceIssue for human review.
4. **Kill switch auto-resume**: Checks if health metrics warrant state change.

### Pattern → Principle Promotion

`checkForPromotion()` (`src/guardrail/evolution/promotion-checker.ts`):
- Criteria: 3+ projects within workspace, HIGH/CRITICAL severity, security priority
- Creates DerivedPrinciple at workspace scope with computed confidence
- Idempotent via promotionKey = hash(workspaceId, patternKey, carrierStage, findingCategory)

### Document Change Handling

`onDocumentChange()` (`src/guardrail/evolution/doc-change-watcher.ts`):
- Invalidates affected pattern occurrences (status='inactive', inactiveReason='superseded_doc')

### Tagging Miss Analysis

`analyzeTaggingMisses()` (`src/guardrail/evolution/tagging-miss-resolver.ts`):
- Groups misses by pattern, counts frequent missing tags for diagnostics

### Files

| File | Purpose |
|------|---------|
| `decay-processor.ts` | Archives patterns below 0.2 confidence threshold |
| `promotion-checker.ts` | Promotes patterns seen in 3+ projects to DerivedPrinciples |
| `provisional-alert-processor.ts` | Expires alerts after 14 days; promotes if 2+ occurrences |
| `salience-detector.ts` | Flags guidance ignored 3+ times in 30-day window |
| `doc-change-watcher.ts` | Invalidates occurrences when source documents change |
| `tagging-miss-resolver.ts` | Analyzes and resolves tagging miss records |
| `scheduler.ts` | Daily maintenance orchestration (decay + alerts + salience + kill switch) |
| `index.ts` | Re-exports all public APIs |

---

## 14. Workflow Hooks

Source: `src/guardrail/workflow/`

Hooks integrate the guardrail subsystem with the PM workflow at specific pipeline stages.

### Before Context Pack Agent

`beforeContextPackAgent()` (`src/guardrail/workflow/context-pack-hook.ts`):
1. Extract preliminary TaskProfile from issue title/description/labels
2. Select warnings for `context-pack` target (maxWarnings=6)
3. Format warnings as markdown
4. Log injection event to guardrail DB
5. Return: warningsMarkdown, taskProfile, injectionLogId

`buildContextPackPrompt()`: Inserts warnings before "## Examples" section, wrapped with non-citable meta-warning.

### Before Spec Agent

`beforeSpecAgent()` (`src/guardrail/workflow/spec-hook.ts`):
1. Extract refined TaskProfile from Context Pack metadata (higher fidelity)
2. Select warnings for `spec` target (maxWarnings=6)
3. Format and log injection
4. Return: warningsMarkdown, taskProfile, injectionLogId

`buildSpecPrompt()`: Appends warnings at end of prompt.

### After PR Review

`onPRReviewComplete()` (`src/guardrail/workflow/pr-review-hook.ts`):
1. For each confirmed finding: run `AttributionOrchestrator.attributeFinding()`
2. Check for provisional alert promotion via `onOccurrenceCreated()`
3. Update adherence tracking via `updateAdherence()`
4. Check for tagging misses via `checkForTaggingMisses()`
5. Return: attributionResults[], taggingMisses count, summary

### Adherence Tracking

`updateAdherence()` (`src/guardrail/workflow/adherence-updater.ts`):
- Gets injection logs for issue
- For each injected pattern: checks if a related finding occurred (category + keyword match)
- If finding occurred → wasAdheredTo = false (agent ignored the warning)

### Tagging Miss Detection

`checkForTaggingMisses()` (`src/guardrail/workflow/tagging-miss-checker.ts`):
- For each attribution result where pattern was NOT injected: checks if it would have matched with the actual TaskProfile
- If no match → creates TaggingMiss record (the pattern's tags didn't cover this issue's profile)

### Provisional Alert Promotion

`checkAndPromoteAlert()` (`src/guardrail/workflow/provisional-alert-promoter.ts`):
- Pattern gate thresholds: minOccurrences=3, minUniqueIssues=2, minConfidence=0.7, maxDaysOld=90
- On promotion: creates Pattern, updates alert status to 'promoted', links occurrences

---

## 15. Guardrail Database

Source: `src/guardrail/storage/`

A separate SQLite database from the PM database, storing all pattern attribution and injection data.

### Configuration

| Property | Value |
|----------|-------|
| Engine | SQLite via better-sqlite3 (raw, no ORM) |
| Path | `~/.falcon-ai/db/falcon.db` |
| Mode | WAL, foreign keys enabled |

### 13-Table Overview

| Table | Purpose |
|-------|---------|
| `workspaces` | Multi-workspace support |
| `projects` | Project-workspace association |
| `pattern_definitions` | Reusable patterns (patternKey is SHA-256, immutable content) |
| `pattern_occurrences` | Append-only occurrence records with provenance chains |
| `derived_principles` | Workspace-level principles (baseline or promoted from patterns) |
| `execution_noncompliance` | When agent ignored correct guidance |
| `doc_update_requests` | Requests to update documentation based on findings |
| `tagging_misses` | Patterns that should have been injected but weren't |
| `injection_logs` | Record of every injection event (patterns, principles, alerts, task profile) |
| `provisional_alerts` | Short-lived alerts for CRITICAL findings (14-day TTL) |
| `salience_issues` | Guidance ignored 3+ times in 30 days |
| `kill_switch_status` | Pattern creation state (active/inferred_paused/fully_paused) |
| `attribution_outcomes` | Metrics data: quote type, pattern created, injection/recurrence tracking |

### 13 Repository Classes

Source: `src/guardrail/storage/repositories/`

`BaseRepository`, `WorkspaceRepository`, `ProjectRepository`, `PatternDefinitionRepository`, `PatternOccurrenceRepository`, `DerivedPrincipleRepository`, `ExecutionNoncomplianceRepository`, `DocUpdateRequestRepository`, `TaggingMissRepository`, `InjectionLogRepository`, `ProvisionalAlertRepository`, `SalienceIssueRepository`, `KillSwitchRepository`

### Baseline Seeding

Source: `src/guardrail/storage/seed/baselines.ts`

Seeds initial baseline DerivedPrinciples when a workspace is initialized via `falcon init`. These serve as the starting guardrails before any patterns are learned.

---

## 16. Schemas (Guardrail Types)

Source: `src/guardrail/schemas/index.ts`

Zod schemas defining all guardrail entities.

| File | Purpose |
|------|---------|
| `index.ts` | All entity schemas, enum types, and Zod validators |
| `validators.ts` | Shared validation utilities for schema enforcement |

Key types:

### Enums

| Enum | Values |
|------|--------|
| `FailureMode` | incorrect, incomplete, missing_reference, ambiguous, conflict_unresolved, synthesis_drift |
| `FindingCategory` | security, correctness, testing, compliance, decisions |
| `Severity` | CRITICAL, HIGH, MEDIUM, LOW |
| `Touch` | user_input, database, network, auth, authz, caching, schema, logging, config, api |
| `NoncomplianceCause` | salience, formatting, override |
| `DocUpdateType` | add_decision, clarify_guidance, fix_error, add_constraint |
| `DecisionClass` | caching, retries, timeouts, authz_model, error_contract, migrations, logging_privacy, backcompat |
| `CarrierInstructionKind` | explicitly_harmful, benign_but_missing_guardrails, descriptive, unknown |
| `PatternCreationState` | active, inferred_paused, fully_paused |

### Core Types

| Type | Key Fields |
|------|------------|
| `TaskProfile` | touches[], technologies[], taskTypes[], confidence |
| `EvidenceBundle` | carrierStage, carrierQuote, carrierQuoteType, carrierInstructionKind, hasCitation, citedSources, sourceAgreesWithCarrier, vaguenessSignals, conflictSignals (20 fields total) |
| `PatternDefinition` | patternKey (SHA-256), patternContent (immutable), failureMode, findingCategory, severity, severityMax, alternative, touches, status, permanent |
| `PatternOccurrence` | patternId, findingId, evidence, carrierFingerprint, provenanceChain, wasInjected, wasAdheredTo, status (append-only) |
| `DerivedPrinciple` | principle, rationale, origin (baseline/derived), derivedFrom, injectInto, touches, confidence, promotionKey |
| `ProvisionalAlert` | message, touches, injectInto, expiresAt, status (active/expired/promoted) |
| `KillSwitchStatus` | state, reason, autoResumeAt |
| `AttributionHealthMetrics` | 30-day rolling: totalAttributions, verbatim/paraphrase/inferredAttributions, injectionsWithoutRecurrence, attributionPrecisionScore |

### Supporting Utilities

| File | Purpose |
|------|---------|
| `src/guardrail/utils/category-mapping.ts` | Maps finding categories to canonical category names for pattern matching |
| `src/types/ws.d.ts` | WebSocket ambient type declarations |

---

## 17. Configuration, Metrics, and Services

### Config

Source: `src/config/`

| File | Purpose |
|------|---------|
| `loader.ts` | `loadConfig()`, `findConfigPath()`, `parseConfig()` — loads/validates `.falcon/config.yaml` with Zod schema (version, workspaceId, projectId, linear config, settings) |
| `scope-resolver.ts` | Resolves hierarchical scope (global → workspace → project) for queries |
| `session.ts` | Session management for CLI context (current issue, workspace) |
| `url-utils.ts` | URL parsing and normalization utilities |

### Metrics

Source: `src/guardrail/metrics/`

| File | Purpose |
|------|---------|
| `collector.ts` | `collectMetrics()` — gathers 30-day rolling attribution health data from guardrail DB |
| `reporter.ts` | `formatMetricsReport()`, `formatMetricsJson()`, `formatMetricsCsv()`, `formatMetricsSummary()` — output formatting |
| `index.ts` | Re-exports collector and reporter functions |

Used by `falcon health` CLI command.

### Services

Source: `src/guardrail/services/`

**KillSwitchService** (`src/guardrail/services/kill-switch.service.ts`):
- `getStatus(scope)` / `getFullStatus(scope)`: Query current state
- `recordAttributionOutcome(scope, outcome)`: Record for metrics
- `evaluateHealth(scope)`: Check if state should change based on 30-day metrics
- `pause(scope, reason)` / `resume(scope)`: Manual control
- `findDueForResumeEvaluation()`: Find scopes due for auto-resume check

---

## 18. CLI Commands

Source: `src/cli/index.ts`, `src/cli/commands/`

Additional: `src/cli/postinstall.ts` — npm postinstall script for package setup.

15 commands registered from 12 command files (some files export multiple commands):

| Command | File | Purpose |
|---------|------|---------|
| `init` | `init.ts` | Initialize falcon-ai in repo (creates .falcon/, .claude/, seeds baselines) |
| `workspace` | `workspace.ts` | Workspace management (list/create/archive/rename/show/delete subcommands) |
| `workspaces` | `workspace.ts` | Alias for `workspace list` |
| `project` | `project.ts` | Project management (list/archive subcommands) |
| `projects` | `project.ts` | Alias for `project list` |
| `status` | `status.ts` | Show current config and pattern statistics |
| `health` | `health.ts` | 30-day rolling attribution metrics and health indicators |
| `doctor` | `doctor.ts` | Verify installation and configuration |
| `pause` | `pause.ts` | Pause pattern creation (with optional --inferred-only) |
| `resume` | `resume.ts` | Resume pattern creation (with --force option) |
| `delete` | `delete.ts` | Delete project and all data (double confirmation) |
| `inject` | `inject.ts` | Output warnings for agent prompt injection (markdown or claude-hook format) |
| `set-context` | `set-context.ts` | Set injection context for current issue |
| `show-context` | `set-context.ts` | Show injection context for current issue |
| `checkout` | `checkout.ts` | Checkout Linear issue, set context, run workflow |
