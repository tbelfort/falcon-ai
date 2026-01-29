# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **falcon-ai**, a pattern-based guardrail system for multi-agent software development. It traces PR review findings back to guidance correlated with them, then injects warnings into future agent runs to prevent recurring issues. Note: the system accumulates guardrails empirically through correlation, not proven causation.

The core innovation is closing the feedback loop that existing systems (like say-your-harmony) failed to close: patterns are stored with structured IDs and content hashes (not LLM-generated names), and injection is a first-class design requirement.

## Key Architecture

### System Components

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
| **Attribution Engine** | `src/guardrail/attribution/` | Traces PR findings to guidance — agent, decision tree, noncompliance |
| **Injection System** | `src/guardrail/injection/` | Selects/formats warnings for agent prompts (6-cap) |
| **Evolution System** | `src/guardrail/evolution/` | Confidence decay, alert promotion, salience detection |
| **Workflow Hooks** | `src/guardrail/workflow/` | Hooks into context-pack, spec, PR review for injection/attribution |
| **Guardrail Database** | `src/guardrail/storage/` | SQLite (13 tables) — patterns, principles, alerts, injection logs |

### The 14-Stage Workflow Pipeline

```
BACKLOG → TODO → CONTEXT_PACK → CONTEXT_REVIEW → SPEC → SPEC_REVIEW
                                       │                      │
                                       ▼                      ▼
                                   IMPLEMENT ◄──────────── (loop)
                                       │
                                       ▼
                                   PR_REVIEW → PR_HUMAN_REVIEW → TESTING → DOC_REVIEW → MERGE_READY → DONE
                                       ▲            │               │
                                       │            ▼               ▼
                                     FIXER     (human gate)     IMPLEMENT (loop)
```

Exact transitions defined in `src/pm/core/stage-machine.ts`. Auto-advance: TODO. Human gates: PR_HUMAN_REVIEW, MERGE_READY.

### Key Interfaces
- **AgentInvoker** (`src/pm/agents/invokers/agent-invoker.ts`): `invokeStage(args) → { runId }` — implemented by ClaudeCodeInvoker, CodexCliInvoker, FakeAgentInvoker
- **AgentRegistry** (`src/pm/agents/registry.ts`): In-memory tracking of agent status (INIT/IDLE/CHECKOUT/WORKING/DONE/ERROR)
- **GitHubAdapter** (`src/pm/github/adapter.ts`): `createPullRequest()`, `upsertBotComment()`, `mergePullRequest()`, `getPullRequestStatus()`
- **PmRepos** (`src/pm/core/repos/index.ts`): Aggregate of all 8 PM repository interfaces
- **AttributionOrchestrator** (`src/guardrail/attribution/orchestrator.ts`): `attributeFinding(input) → AttributionResult` — full attribution pipeline
- **EvidenceBundle** / **TaskProfile** (`src/guardrail/schemas/index.ts`): Core guardrail types for attribution and injection

### Pattern Attribution Flow
1. PR Review scouts find issues, judges confirm them
2. Attribution Agent extracts structured evidence (EvidenceBundle)
3. Deterministic resolver classifies failureMode (not LLM judgment)
4. Patterns stored with provenance chain and content hashes
5. Warnings injected into future Context Pack/Spec agent prompts

### Key Entities
- **PatternDefinition**: Reusable pattern representing bad guidance
- **PatternOccurrence**: Specific instance of a pattern (append-only)
- **DerivedPrinciple**: Baseline guardrails or derived from pattern clusters
- **ExecutionNoncompliance**: When agent ignored correct guidance (distinct from Pattern)
- **ProvisionalAlert**: Short-lived alerts for CRITICAL findings not yet meeting pattern gate

## System Documentation

The `docs/system/` directory contains authoritative technical documentation derived from source code. When conflicting with `docs/design/` or other docs, `docs/system/` is authoritative.

| Document | Purpose |
|----------|---------|
| `docs/system/architecture-simple.md` | 40,000ft overview — both subsystems, pipeline, code map |
| `docs/system/architecture.md` | Comprehensive reference — 18 sections covering PM + guardrail subsystems |
| `docs/system/db.md` | PM database schema — 11 tables, columns, indexes, relationships |
| `docs/system/schemas.md` | API contracts — endpoints, DTOs, validation, WebSocket |
| `docs/system/agents.md` | Agent infrastructure — lifecycle, provisioning, invokers |
| `docs/system/security.md` | Security measures — HTTP, WebSocket, Git, credentials |
| `docs/system/ux.md` | Dashboard UX — components, stores, WebSocket integration |

## Repository Structure

After `falcon init`, the following files are installed in your project:

```
.falcon/                 # Falcon configuration and CORE files
├── config.yaml          # Project configuration
└── CORE/
    ├── TASKS/WORKFLOW/  # Workflow task files (SPEC.md, IMPLEMENT.md, etc.)
    ├── ROLES/           # Agent role definitions (ARCHITECT.md, PM.md, etc.)
    └── TEMPLATES/       # Research and documentation templates

.claude/                 # Claude Code integration files
├── commands/            # User-invokable commands (checkout, doc-review, etc.)
└── agents/              # PR review agents (scouts, judges)
```

Falcon-ai source structure:

```
src/
├── cli/                    # CLI entry point (Commander.js, 12 commands)
├── config/                 # YAML config loader, scope resolver (shared infrastructure)
├── types/                  # Ambient type declarations
├── guardrail/              # All guardrail modules grouped here
│   ├── attribution/        # Pattern attribution engine
│   ├── injection/          # Warning injection system
│   ├── evolution/          # Pattern lifecycle maintenance
│   ├── workflow/           # Integration hooks (PM ↔ guardrail bridge)
│   ├── storage/            # Guardrail SQLite DB + 13 repos
│   ├── schemas/            # Zod schemas for guardrail entities
│   ├── services/           # KillSwitchService
│   ├── metrics/            # Attribution health metrics
│   └── utils/              # Category mapping utilities
└── pm/                     # Project management subsystem
    ├── core/               # Domain model (types, stage machine, services, repos)
    ├── api/                # Express REST API + WebSocket hub + routes
    ├── orchestrator/       # Poll loop, dispatch, preset resolution
    ├── agents/             # Lifecycle, provisioning, invokers, output streaming
    ├── github/             # PR creation, comments, merge, webhooks
    ├── db/                 # SQLite + Drizzle ORM (schema, connection, repos)
    └── contracts/          # DTOs and WebSocket types

apps/pm-dashboard/          # React SPA (Vite + Tailwind + Zustand + dnd-kit)

docs/system/                # Authoritative system documentation (see above)

CORE/                       # Source files (copied during init)
├── TASKS/WORKFLOW/
├── ROLES/
├── commands/               # → .claude/commands/
├── agents/                 # → .claude/agents/
└── TEMPLATES/

specs/                      # Implementation specifications
ai_docs/                    # AI-generated documentation and research
```

## Development Workflow

This project uses a structured multi-agent workflow with Linear integration:

### Issue States
`Todo` → `Context Pack Drafted` → `Spec In Progress` → `Spec Drafted` → `Ready to Start` → `In Progress` → `In Review` → `Done`

### Key Task Files
- `.falcon/CORE/TASKS/WORKFLOW/CONTEXT_PACK.md` - Creating context packs
- `.falcon/CORE/TASKS/WORKFLOW/SPEC.md` - Writing specifications
- `.falcon/CORE/TASKS/WORKFLOW/IMPLEMENT.md` - Implementation
- `.falcon/CORE/TASKS/WORKFLOW/PR_REVIEW.md` - PR review process

### Linear Integration
```bash
# Get issue details
python project-management/tools/linear.py issue get CON-XXX

# Update issue state
python project-management/tools/linear.py issue update CON-XXX --state "Spec In Progress"

# Add/remove labels
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready

# Create document in Linear
python project-management/tools/linear.py document create "Title" --content-file path.md --project <project>
```

## Critical Design Principles

### Pattern Attribution
1. **Deterministic over LLM judgment** - Use structured evidence features and decision trees
2. **Append-only history** - Never mutate occurrence records; mark inactive instead
3. **Separate belief from action** - Attribution confidence ≠ injection priority
4. **Distinguish guidance errors from execution errors** - Pattern vs ExecutionNoncompliance
5. **Token-conscious injection** - Cap warnings at 6 (2 baseline + 4 learned)
6. **Security bias** - Security patterns get priority in injection

### Failure Modes to Avoid (from say-your-harmony)
1. **LLM-generated pattern names** - Use structured IDs with content hashes
2. **Rich extraction, narrow storage** - Store actual guidance content
3. **Query functions never called** - Design injection points FIRST
4. **No injection** - Injection is part of core design

## Spec Conventions

Specs use RFC 2119 language (MUST/SHOULD/MAY). Key sections:
- Summary, Requirements, Dependencies (with ai_docs references)
- Interface, Behavior, Known Issues & Mitigations
- Testing requirements

## Context Pack Rules

The Context Pack is the ONLY input for the Spec agent. When writing specs:
- Read the Context Pack first
- Do NOT read additional architecture docs (Context Pack already extracted them)
- If Context Pack is insufficient, flag with `needs_improve_context_pack` label
- Citations come from Context Pack's Source Map

## Branch Workflow

Always work on feature branches, never directly on main:
```bash
git checkout main && git pull
git checkout -b <branchName-from-linear>
# ... make changes ...
git push -u origin <branch-name>
```

Use Linear's branch name for consistency across agents.
