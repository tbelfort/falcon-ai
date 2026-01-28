# Architecture Overview

## What This System Is

Falcon-ai is a pattern-based guardrail system for multi-agent software development. It orchestrates AI agents through a 14-stage workflow pipeline (from backlog to merge), tracks PR review findings, and injects learned warnings into future agent prompts to prevent recurring issues. The system consists of a Node.js/TypeScript backend with REST API, WebSocket real-time updates, a React Kanban dashboard, and a CLI for workspace/project management.

## System Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Backend API** | `src/pm/api/` | Express REST API + WebSocket hub |
| **Orchestrator** | `src/pm/orchestrator/` | Polls issues, dispatches agents, manages stage transitions |
| **Agent Infrastructure** | `src/pm/agents/` | Lifecycle, provisioning, git sync, CLI invokers, output streaming |
| **Dashboard** | `apps/pm-dashboard/` | React SPA with Kanban board, drag-drop, real-time updates |
| **CLI** | `src/cli/` | Commander.js CLI for init, workspaces, projects, injection, health |
| **GitHub Integration** | `src/pm/github/` | PR creation, bot comments, merging, webhook processing |
| **PM Database** | `src/pm/db/` | SQLite via Drizzle ORM (11 tables) — workflow state |
| **Core Domain** | `src/pm/core/` | Types, stage machine, services, repos, errors |
| **Attribution Engine** | `src/guardrail/attribution/` | Traces PR findings to guidance — agent, decision tree, noncompliance check |
| **Injection System** | `src/guardrail/injection/` | Selects and formats warnings for agent prompts (6-warning cap) |
| **Evolution System** | `src/guardrail/evolution/` | Confidence decay, alert promotion, salience detection, daily maintenance |
| **Workflow Hooks** | `src/guardrail/workflow/` | Hooks into context-pack, spec, PR review stages for injection/attribution |
| **Guardrail Database** | `src/guardrail/storage/` | SQLite (better-sqlite3, 13 tables) — patterns, principles, alerts |
| **Schemas** | `src/guardrail/schemas/` | Zod schemas for all guardrail entities (20+ types) |
| **Config** | `src/config/` | YAML config loader, scope resolver, session management |
| **Metrics** | `src/guardrail/metrics/` | 30-day rolling attribution health metrics and reporting |
| **Services** | `src/guardrail/services/` | Kill switch service (pause/resume pattern creation) |

## The 14-Stage Workflow Pipeline

```
BACKLOG ──► TODO ──► CONTEXT_PACK ──► CONTEXT_REVIEW ──► SPEC ──► SPEC_REVIEW
                                            │                         │
                                            ▼                         ▼
                                        IMPLEMENT ◄──────────────── (loop)
                                            │
                                            ▼
                                        PR_REVIEW ──► PR_HUMAN_REVIEW ──► TESTING ──► DOC_REVIEW ──► MERGE_READY ──► DONE
                                            ▲                │                │
                                            │                ▼                ▼
                                          FIXER          (human gate)    IMPLEMENT (loop)
```

**Exact transitions** (from `src/pm/core/stage-machine.ts`):

| From | To |
|------|-----|
| BACKLOG | TODO |
| TODO | CONTEXT_PACK |
| CONTEXT_PACK | CONTEXT_REVIEW |
| CONTEXT_REVIEW | SPEC, IMPLEMENT |
| SPEC | SPEC_REVIEW |
| SPEC_REVIEW | IMPLEMENT, SPEC |
| IMPLEMENT | PR_REVIEW |
| PR_REVIEW | PR_HUMAN_REVIEW |
| PR_HUMAN_REVIEW | FIXER, TESTING |
| FIXER | PR_REVIEW |
| TESTING | DOC_REVIEW, IMPLEMENT |
| DOC_REVIEW | MERGE_READY |
| MERGE_READY | DONE |
| DONE | (terminal) |

**Auto-advance stages:** TODO (skipped automatically by orchestrator).
**Human gates:** PR_HUMAN_REVIEW, MERGE_READY (require human action).

## Where Code Lives

```
src/
├── cli/                       # CLI entry point (Commander.js, 15 commands)
│   ├── index.ts               # Commander.js app definition
│   └── commands/              # Individual command files (init, status, health, inject, etc.)
├── config/                    # YAML config loader, scope resolver
├── types/                     # Shared type definitions
├── guardrail/                 # All guardrail modules grouped here
│   ├── attribution/           # Phase 2: Pattern attribution engine
│   │   ├── agent.ts           # LLM agent for evidence extraction (EvidenceBundle)
│   │   ├── failure-mode-resolver.ts # Deterministic 5-step decision tree (NOT LLM)
│   │   ├── noncompliance-checker.ts # Execution noncompliance detection
│   │   ├── orchestrator.ts    # Attribution pipeline (agent → resolver → storage)
│   │   └── prompts/           # LLM prompt templates for attribution agent
│   ├── injection/             # Phase 3: Warning injection into agent prompts
│   │   ├── selector.ts        # Tiered warning selection (6-cap: 2 baseline + 4 learned)
│   │   ├── confidence.ts      # Attribution confidence + injection priority scoring
│   │   ├── formatter.ts       # Markdown formatting for prompt injection
│   │   ├── task-profile-extractor.ts # Touch/technology/taskType extraction from issues
│   │   ├── task-profile-validator.ts # Auto-correction of missing touches
│   │   └── kill-switch-check.ts # Kill switch state queries
│   ├── evolution/             # Phase 5: Pattern lifecycle maintenance
│   │   ├── decay-processor.ts # Confidence decay, archives patterns < 0.2
│   │   ├── promotion-checker.ts # Pattern → DerivedPrinciple promotion (3+ projects)
│   │   ├── provisional-alert-processor.ts # Alert expiry/promotion (14-day TTL)
│   │   ├── salience-detector.ts # Detects guidance ignored 3+ times in 30 days
│   │   ├── doc-change-watcher.ts # Invalidates patterns on document changes
│   │   ├── tagging-miss-resolver.ts # Analyzes/resolves tagging misses
│   │   └── scheduler.ts       # Daily maintenance orchestration
│   ├── workflow/              # Phase 4: Workflow integration hooks
│   │   ├── context-pack-hook.ts # beforeContextPackAgent() — inject warnings
│   │   ├── spec-hook.ts       # beforeSpecAgent() — inject warnings
│   │   ├── pr-review-hook.ts  # onPRReviewComplete() — run attribution
│   │   ├── adherence-updater.ts # Track if injected warnings were followed
│   │   ├── tagging-miss-checker.ts # Detect patterns that should have been injected
│   │   └── provisional-alert-promoter.ts # Promote alerts to patterns on recurrence
│   ├── storage/               # Guardrail database (separate from PM database)
│   │   ├── db.ts              # SQLite at ~/.falcon-ai/db/falcon.db (13 tables)
│   │   ├── repositories/      # 13 repository classes (patterns, principles, alerts, etc.)
│   │   └── seed/              # Baseline principle seeding for falcon init
│   ├── schemas/               # Zod schemas for all guardrail entities (20+ types)
│   ├── metrics/               # 30-day rolling attribution health metrics
│   ├── services/              # Kill switch service (pause/resume pattern creation)
│   └── utils/                 # Category mapping utilities
└── pm/                        # Project management subsystem
    ├── core/
    │   ├── types.ts           # All entity interfaces (Project, Issue, Agent, etc.)
    │   ├── stage-machine.ts   # 14-stage transition map
    │   ├── events.ts          # WebSocket event factory functions
    │   ├── presets.ts         # PresetConfig interface (stages, models, prReview)
    │   ├── errors.ts          # ErrorCode enum and ServiceError
    │   ├── repos/             # Repository interfaces (8 repos)
    │   ├── services/          # Business logic services (8 services)
    │   └── testing/           # In-memory repo implementations
    ├── api/
    │   ├── server.ts          # Express app setup, CORS, rate limiting, security headers
    │   ├── routes/            # REST endpoints (projects, issues, labels, comments, docs, agent, webhook)
    │   ├── websocket.ts       # WebSocket hub with pub/sub channels
    │   ├── broadcast.ts       # Event broadcasting to WS channels
    │   └── validation.ts      # Field limits, pagination, path safety
    ├── orchestrator/
    │   ├── runner.ts          # Main poll loop, dispatch, finalization, auto-merge
    │   ├── workflow-executor.ts # Prompt building, XML sanitization, agent invocation
    │   ├── preset-resolver.ts # Model preset resolution and stage model overrides
    │   └── dispatcher.ts      # Agent selection (idle + model + project match)
    ├── agents/
    │   ├── lifecycle.ts       # Agent state machine (INIT→IDLE→CHECKOUT→WORKING→DONE→IDLE)
    │   ├── registry.ts        # In-memory agent tracking (AgentRegistry interface)
    │   ├── provisioner.ts     # Clone repo, configure git, symlink shared resources
    │   ├── git-sync.ts        # Clone, checkout, sync, pull-rebase, commit-push
    │   ├── fs-layout.ts       # Directory structure ({falconHome}/projects/{slug}/agents/{name}/)
    │   ├── invokers/          # ClaudeCodeInvoker, CodexCliInvoker, FakeAgentInvoker
    │   └── output/            # OutputBus (pub/sub for agent stdout streaming)
    ├── github/
    │   ├── adapter.ts         # GitHubAdapter interface + OctokitGitHubAdapter
    │   ├── client.ts          # Octokit factory from GITHUB_TOKEN env var
    │   ├── pr-creator.ts      # createPullRequest()
    │   ├── comment-poster.ts  # upsertBotComment() with marker-based upsert
    │   ├── merger.ts          # mergePullRequest() (squash default)
    │   ├── pr-status.ts       # getPullRequestStatus() with review aggregation
    │   └── repo.ts            # parseRepoUrl() (HTTPS, SSH, short formats)
    ├── db/
    │   ├── schema.ts          # Drizzle schema (11 tables)
    │   ├── connection.ts      # SQLite connection (WAL mode, foreign keys, 0o700 perms)
    │   ├── migrate.ts         # Migration runner
    │   ├── seed.ts            # Seeds 11 builtin labels + 3 presets (full-pipeline, quick-fix, docs-only)
    │   ├── paths.ts           # getFalconHome(), getPmDbPath()
    │   ├── cli.ts             # Database CLI commands (migrate, seed)
    │   └── repos/             # Drizzle repository implementations
    └── contracts/
        ├── http.ts            # All DTOs and API response types
        └── ws.ts              # WebSocket event types and message shapes

apps/pm-dashboard/             # React SPA (Vite + Tailwind + Zustand + dnd-kit)
```

## Key Interfaces

- **AgentInvoker** (`src/pm/agents/invokers/agent-invoker.ts`): `invokeStage(args) → { runId }` — implemented by ClaudeCodeInvoker, CodexCliInvoker, FakeAgentInvoker
- **AgentRegistry** (`src/pm/agents/registry.ts`): In-memory tracking of agent status (INIT/IDLE/CHECKOUT/WORKING/DONE/ERROR)
- **GitHubAdapter** (`src/pm/github/adapter.ts`): `createPullRequest()`, `upsertBotComment()`, `mergePullRequest()`, `getPullRequestStatus()`
- **PmRepos** (`src/pm/core/repos/index.ts`): Aggregate of all 8 PM repository interfaces (projects, issues, labels, comments, documents, agents, stageMessages, workflowRuns)
- **AttributionOrchestrator** (`src/guardrail/attribution/orchestrator.ts`): `attributeFinding(input) → AttributionResult` — runs the full attribution pipeline (agent → resolver → storage)
- **EvidenceBundle** (`src/guardrail/schemas/index.ts`): Structured evidence extracted by the Attribution Agent — carrier quote, citation, vagueness signals, conflict signals
- **TaskProfile** (`src/guardrail/schemas/index.ts`): `{ touches[], technologies[], taskTypes[], confidence }` — used for injection targeting

## Two Databases

The system uses two separate SQLite databases:

| Database | Location | ORM | Purpose |
|----------|----------|-----|---------|
| **PM Database** | `~/.falcon/pm.db` | Drizzle ORM | 11 tables — workflow state (projects, issues, agents, etc.) |
| **Guardrail Database** | `~/.falcon-ai/db/falcon.db` | raw better-sqlite3 | 13 tables — patterns, principles, alerts, injection logs, etc. |

## Data Flow Summary

1. **Issue lifecycle**: Issues progress through 14 stages. The orchestrator polls for actionable issues, resolves model presets, selects idle agents, and dispatches work.
2. **Agent dispatch**: Orchestrator assigns an idle agent, updates its status to WORKING, builds an XML-sanitized prompt, and invokes the agent CLI. On completion, the issue advances to the next stage.
3. **Output streaming**: Agent stdout flows through OutputBus → WebSocket hub → dashboard clients subscribed to `run:{runId}` channels.
4. **PR flow**: At PR_REVIEW stage, orchestrator ensures a GitHub PR exists. At PR_HUMAN_REVIEW, it posts review comments. At MERGE_READY with autoMerge, it checks approval/mergeable status and squash-merges.
5. **Real-time updates**: All CRUD operations broadcast domain events to `project:{id}` and `issue:{id}` WebSocket channels. The dashboard subscribes and refreshes data.
6. **Attribution feedback loop**: After PR review, `onPRReviewComplete()` runs the Attribution Agent on each confirmed finding → deterministic failure mode resolver → pattern/noncompliance/alert storage. Adherence is tracked; tagging misses are detected.
7. **Warning injection**: Before context-pack and spec agents run, `beforeContextPackAgent()` / `beforeSpecAgent()` extract a TaskProfile from the issue, select up to 6 warnings (2 baseline principles + 4 learned patterns, security-first), and inject formatted markdown into the agent prompt.
8. **Evolution**: Daily maintenance processes confidence decay (archives patterns < 0.2), expires provisional alerts (14-day TTL), promotes patterns appearing in 3+ projects to DerivedPrinciples, and detects salience issues (guidance ignored 3+ times in 30 days).
