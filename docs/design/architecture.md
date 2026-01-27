# Architecture Design Document

## System Overview

Falcon-PM is an AI agent orchestration platform that replaces Linear with a custom project management system designed for multi-agent workflows. It manages issues through automated stages, coordinates agent work across isolated git worktrees, and provides real-time visibility into orchestration.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Falcon-PM System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │   Dashboard  │────▶│   REST API   │────▶│   Database   │            │
│  │   (React)    │◀────│   (Express)  │◀────│   (SQLite)   │            │
│  └──────────────┘     └──────┬───────┘     └──────────────┘            │
│         │                    │                                          │
│         │ WebSocket          │                                          │
│         ▼                    ▼                                          │
│  ┌──────────────┐     ┌──────────────┐                                 │
│  │  Real-Time   │     │ Orchestrator │                                 │
│  │   Updates    │◀────│    Engine    │                                 │
│  └──────────────┘     └──────┬───────┘                                 │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │                   Agent Infrastructure                    │          │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │          │
│  │  │ opus-1  │  │ opus-2  │  │sonnet-1 │  │openai-1 │     │          │
│  │  │(claude) │  │(claude) │  │(claude) │  │ (openai)│     │          │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │          │
│  │       │            │            │            │           │          │
│  │       └────────────┴────────────┴────────────┘           │          │
│  │                         │                                 │          │
│  │                    Git Worktrees                          │          │
│  └──────────────────────────────────────────────────────────┘          │
│                              │                                          │
│                              ▼                                          │
│                       ┌──────────────┐                                 │
│                       │    GitHub    │                                 │
│                       │ Integration  │                                 │
│                       └──────────────┘                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Module Boundaries

### falcon-pm (Project Management)

Core project management functionality:
- **Database Layer** (`src/pm/db/`): SQLite with Drizzle ORM
- Connection is cached at module scope; call `closePmDb()` after tests and CLI runs.
- Migrations load from `src/pm/db/migrations` in-repo with a fallback to `dist/pm/db/migrations`.
- `DATABASE_URL` must be a `file:` URI (defaults to `~/.falcon/pm.db`).
- `FALCON_HOME` is validated as absolute, traversal-free, and outside system directories; symlinks are resolved before checks.
- Windows path checks are case-insensitive and reject UNC paths for local storage.
- **REST API** (`src/pm/api/`): Express server for all CRUD and orchestration
- **Dashboard** (`apps/pm-dashboard/`): React frontend with Kanban, settings, PR review (standalone Vite app)

### falcon-orchestrator

Workflow automation engine:
- **State Machine** (`src/pm/orchestrator/state-machine.ts`): Issue stage transitions
- **Dispatcher** (`src/pm/orchestrator/dispatcher.ts`): Agent assignment
- **Workflow Executor** (`src/pm/orchestrator/workflow-executor.ts`): Stage execution
- **Presets** (`src/pm/orchestrator/presets.ts`): Model preset configurations

### falcon-agent-infra

Agent management infrastructure:
- **Provisioner** (`src/pm/agents/provisioner.ts`): Folder creation, git clone
- **Git Sync** (`src/pm/agents/git-sync.ts`): Branch operations, push/pull
- **Lifecycle** (`src/pm/agents/lifecycle.ts`): Agent state machine (IDLE/WORKING)
- **Invoker** (`src/pm/agents/invoker.ts`): Non-interactive agent invocation

### falcon-github

GitHub integration:
- **PR Creator** (`src/pm/github/pr-creator.ts`): Create pull requests
- **Comment Poster** (`src/pm/github/comment-poster.ts`): Post findings
- **Merger** (`src/pm/github/merger.ts`): Handle merge operations

## Directory Structure

### Application Source (`src/pm/`)

```
src/pm/
├── db/
│   ├── schema.ts           # Drizzle schema definitions
│   ├── connection.ts       # Database connection
│   ├── seed.ts             # Default data seeding
│   └── migrations/         # Generated migrations
├── api/
│   ├── server.ts           # Express server entry
│   ├── routes/
│   │   ├── projects.ts     # Project CRUD
│   │   ├── issues.ts       # Issue CRUD + transitions
│   │   ├── agents.ts       # Agent management
│   │   ├── documents.ts    # Document attachment
│   │   ├── comments.ts     # Comments
│   │   ├── agent-api.ts    # Agent-facing endpoints
│   │   ├── studies.ts      # Study data routes
│   │   └── github-webhook.ts
│   ├── middleware/
│   │   └── validation.ts   # Zod request validation
│   └── websocket.ts        # WebSocket server
├── agents/
│   ├── provisioner.ts      # Agent folder setup
│   ├── git-sync.ts         # Git operations
│   ├── lifecycle.ts        # Agent state machine
│   ├── registry.ts         # Agent availability
│   ├── toolset.ts          # Agent tool definitions
│   ├── invoker.ts          # Non-interactive invocation
│   └── output-stream.ts    # WebSocket streaming
├── orchestrator/
│   ├── state-machine.ts    # Issue stages
│   ├── dispatcher.ts       # Agent assignment
│   ├── workflow-executor.ts
│   ├── presets.ts          # Model presets
│   ├── branch-namer.ts     # Haiku branch names
│   └── runner.ts           # Main orchestration loop
└── github/
    ├── client.ts           # Octokit wrapper
    ├── pr-creator.ts
    ├── comment-poster.ts
    └── merger.ts

apps/pm-dashboard/           # Standalone Vite React app
├── src/
│   ├── App.tsx              # Main React app
│   ├── main.tsx             # Entry point
│   ├── components/
│   │   ├── KanbanBoard.tsx
│   │   ├── IssueCard.tsx
│   │   ├── IssueColumn.tsx
│   │   ├── IssueDetailModal.tsx
│   │   └── StageBadge.tsx
│   ├── stores/
│   │   ├── issues.ts        # Zustand issue store
│   │   ├── projects.ts      # Zustand project store
│   │   ├── ui.ts            # UI state store
│   │   └── types.ts         # AsyncState types
│   ├── hooks/
│   │   └── useWebSocket.ts
│   ├── api/
│   │   ├── client.ts        # API client
│   │   └── types.ts         # DTO types
│   ├── utils/
│   │   └── stages.ts        # Stage order and styling
│   └── mocks/               # MSW mocks for testing
├── vite.config.ts
└── vitest.config.ts
```

### Data Directory (`~/.falcon/`)

```
~/.falcon/
├── pm.db                    # SQLite database
├── config.yaml              # Global configuration
└── projects/
    └── <project-slug>/
        ├── config.yaml      # Project configuration
        ├── primary/         # Large files (symlinked to agents)
        ├── agents/
        │   ├── opus-1/      # Git clone for agent
        │   ├── opus-2/
        │   ├── sonnet-1/
        │   └── openai-1/
        └── issues/
            └── <issue-id>/
                ├── context/     # Context pack files
                ├── specs/       # Specification files
                └── ai_docs/     # Issue-specific research
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Database | SQLite + Drizzle ORM | Lightweight, file-based, TypeScript-first ORM |
| Backend | Express.js | Simple, well-understood, good LLM support |
| Frontend | React + TypeScript | Component-based, excellent LLM code generation |
| State Management | Zustand | Lightweight, TypeScript-friendly |
| Styling | Tailwind CSS | Utility-first, rapid development |
| WebSocket | ws | Native, lightweight, performant |
| Git Operations | simple-git | Promise-based, comprehensive API |
| GitHub API | Octokit | Official GitHub SDK |

## Component Interaction Flows

### Issue Creation Flow

```
User creates issue in Dashboard
         │
         ▼
   REST API /api/issues
         │
         ▼
   Database insert
         │
         ▼
   Orchestrator notified
         │
         ▼
   Haiku generates branch name
         │
         ▼
   Branch attached to issue
         │
         ▼
   WebSocket broadcasts update
         │
         ▼
   Dashboard updates in real-time
```

### Agent Work Flow

```
Human starts issue (selects preset)
         │
         ▼
   Orchestrator selects available agent
         │
         ▼
   Agent workspace prepared (checkout branch)
         │
         ▼
   Claude/OpenAI invoked non-interactively
         │
         ▼
   Agent executes stage task
         │
   ┌─────┴─────┐
   │           │
   ▼           ▼
Output      API calls
streamed    (comments,
via WS      stage messages)
   │           │
   └─────┬─────┘
         │
         ▼
   Agent signals work complete
         │
         ▼
   Orchestrator advances stage
         │
         ▼
   Next agent assigned (or human review)
```

### PR Review Flow

```
Issue reaches PR_REVIEW stage
         │
         ▼
   GitHub PR created automatically
         │
         ▼
   PR Review scouts launched
         │
         ▼
   Findings collected by orchestrator
         │
         ▼
   Judge confirms/dismisses findings
         │
         ▼
   Findings posted as PR comments
         │
         ▼
   Issue moves to PR_HUMAN_REVIEW
         │
         ▼
   Human reviews in Dashboard
         │
   ┌─────┴─────┐
   │           │
   ▼           ▼
Approve     Dismiss
findings    findings
   │           │
   └─────┬─────┘
         │
         ▼
   Launch fixer agent
         │
         ▼
   Re-review triggered
         │
         ▼
   DOC_REVIEW → MERGE_READY → DONE
```

## Phase Dependencies

```
Phase 0 (Database) ─────────────────┐
          │                         │
          ▼                         ▼
Phase 1 (API) ──────────┬──── Phase 3 (Agent Infra)
          │             │           │
          ▼             │           ▼
Phase 2 (Kanban UI)     │     Phase 4 (Agent Comm)
          │             │           │
          │             └───────────┤
          │                         │
          │              ┌──────────┘
          │              ▼
          │       Phase 5 (Orchestration)
          │              │
          └──────────────┤
                         ▼
                 Phase 6 (Dashboard)
                         │
                         ▼
                 Phase 7 (GitHub)
```

**Parallelization**: Phases 2 (Kanban) and 3 (Agent Infra) can run in parallel after Phase 1.

## API Server Structure

```
Port 3002: REST API + WebSocket
│
├── /api/projects          # Project management
├── /api/issues            # Issue CRUD + transitions
├── /api/agents            # Agent registration
├── /api/documents         # Document attachment
├── /api/comments          # Issue comments
├── /api/presets           # Model presets
├── /api/orchestrator      # Control orchestrator
├── /api/agent-api         # Agent-facing endpoints
│   ├── POST /issues/:id/comment
│   ├── POST /issues/:id/stage-message
│   ├── POST /issues/:id/work-complete
│   ├── GET  /issues/:id/context
│   └── GET  /issues/:id/messages
└── /ws                    # WebSocket connections
```

## Configuration Files

### Global Config (`~/.falcon/config.yaml`)

```yaml
github:
  token: ${GITHUB_TOKEN}
  defaultOrg: myorg

subscriptions:
  claude:
    - name: claude-primary
      # Managed via oauth/session, not API keys
  openai:
    - name: openai-primary

defaults:
  model: claude-sonnet-4
  preset: full-pipeline
```

### Project Config (`~/.falcon/projects/<slug>/config.yaml`)

```yaml
repo:
  url: https://github.com/owner/repo.git
  defaultBranch: main

agents:
  - id: opus-1
    type: claude
    model: claude-opus-4.5
  - id: sonnet-1
    type: claude
    model: claude-sonnet-4
  - id: openai-1
    type: openai
    model: gpt-4o

workflowDefaults:
  preset: full-pipeline
  labelOverrides:
    docs: quick-docs
    bug: quick-fix
```

## Error Handling Contract

Different layers use different error patterns:

| Layer | Pattern | Rationale |
|-------|---------|-----------|
| `src/pm/agents/*` | Throws `Error` directly | Low-level primitives; callers handle exceptions |
| `src/pm/db/*` | Throws `Error` directly | Database operations are atomic; exceptions are appropriate |
| `src/pm/api/routes/*` | Returns HTTP status codes | REST convention |
| `src/pm/orchestrator/*` | Uses `ServiceResult<T>` | Orchestration needs structured success/failure for state machines |

**Agent layer specifics:**
- `cloneAgentRepository()` throws if worktree exists
- `checkoutIssueBranch()` throws if uncommitted changes present
- Git errors are wrapped to scrub credentials from messages
- Network/timeout errors propagate as-is (no retry at this layer)

**Git timeout:** All git operations use a 5-minute (300000ms) timeout configured via `simple-git`:

```typescript
const defaultOptions: Partial<SimpleGitOptions> = {
  timeout: { block: 300000 },  // 5 minutes
};
```

This prevents DoS via slow/malicious git servers and ensures operations don't hang indefinitely.

## Security Considerations

1. **No API Keys**: Uses subscription-based auth (Claude Code, OpenAI sessions)
2. **Token Storage**: GitHub tokens stored securely, never in database
3. **Agent Isolation**: Each agent operates in isolated git worktree
4. **Local Database**: SQLite file in `~/.falcon/` with proper permissions
5. **WebSocket Auth**: Token validation on connection upgrade

## Scalability Notes

- **Single-machine design**: Optimized for developer workstations
- **Multiple agents**: Support for N claude + M openai concurrent agents
- **SQLite sufficient**: Expected issue volumes < 10,000 per project
- **WebSocket**: Direct connections, no Redis needed for single server

## Implementation Patterns

### Abort-on-New-Request Pattern

When loading data (projects, issues, labels), the stores implement an abort-on-new-request pattern to prevent race conditions:

```typescript
const loadIssues = async (projectId) => {
  // Abort any in-flight request
  const { abortController: current } = get();
  if (current) {
    current.abort();
  }

  // Create new controller for this request
  const controller = new AbortController();
  set({ abortController: controller });

  try {
    const data = await fetchData(controller.signal);
    set({ data, abortController: null });
  } catch (error) {
    if (controller.signal.aborted) {
      return; // Ignore aborted requests
    }
    // Handle actual errors
  }
};
```

This ensures that rapid successive calls (e.g., switching projects quickly) don't result in stale data being displayed.

### VITEST Environment Detection

The codebase uses `import.meta.env.VITEST` to detect when code is running in the Vitest test environment. This is used to:

1. **Disable WebSocket connections** in tests (unless explicitly enabled via `enableInTest` option)
2. **Skip browser-only timeout features** that aren't available in the test environment

Example:
```typescript
if (import.meta.env.VITEST && !enableInTest) {
  return; // Skip WebSocket in tests
}
```

This pattern allows tests to run without WebSocket infrastructure while still allowing targeted WebSocket testing when needed.

### Dashboard Default Behaviors

The pm-dashboard has several configurable defaults:

| Setting | Default Value | Description |
|---------|---------------|-------------|
| HTTP Timeout | 30000ms | API requests timeout after 30 seconds |
| MSW Mode | Auto-activated | When `VITE_API_BASE_URL` is unset, MSW mocks are enabled |
| Project Selection | Auto-select first | On load, automatically selects the first project in the list |
| WebSocket URL | Derived from API base | Protocol swapped (http→ws, https→wss), `/ws` appended |

**MSW Mocked Mode:** When `VITE_API_BASE_URL` is not set (or empty), the dashboard activates MSW (Mock Service Worker) to provide mock API responses. This enables frontend development without a running backend. WebSocket connections are disabled in this mode.
