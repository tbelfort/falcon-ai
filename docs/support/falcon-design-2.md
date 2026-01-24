# Falcon Design Sprint 2 - Progress Report

**Date**: January 24, 2026
**Sprint Goal**: Complete research and design documentation for Falcon PM expansion
**Status**: Complete - Ready for human review

---

## Sprint Overview

This sprint transformed the Falcon PM expansion vision into actionable design documentation. The goal was to research required technologies and create comprehensive design documents that will guide implementation across 8 phases.

### Background

Falcon-ai is expanding from a pattern-based guardrail system into a complete AI agent orchestration platform. This involves:
- Replacing Linear with a custom project management system
- Building agent infrastructure for Claude Code and Codex
- Creating an orchestration engine for automated workflows
- Integrating with GitHub for PR management

### Vision Document Reference

The expansion vision is defined in `docs/design/falcon-new-vision.md`, which outlines:
- Custom Kanban-based PM system
- Multi-agent orchestration with model presets
- Automated workflow from issue creation to merge
- PR review with human approval gates

---

## Deliverables Completed

### Research Documents (ai_docs/)

7 research documents created covering technologies needed for implementation:

| Document | Purpose | Key Insights |
|----------|---------|--------------|
| `claude-code-noninteractive.md` | Claude Code CLI and Agent SDK | Use `query()` async generator for streaming; SDK handles tool execution automatically |
| `codex-cli-noninteractive.md` | Codex CLI programmatic invocation | `codex exec` with `--json` for JSONL streaming; SDK available via `@openai/codex-sdk` |
| `react-typescript-llm-patterns.md` | LLM-friendly React patterns | Discriminated unions, Zustand for state, typed props, generic components |
| `sqlite-drizzle-patterns.md` | Drizzle ORM with SQLite | Code-first schema, relational queries, JSON columns with text mode |
| `websocket-realtime-patterns.md` | Real-time dashboard updates | `ws` library for streaming, channel-based subscriptions, throttled output |
| `git-automation-patterns.md` | Agent workspace git operations | simple-git for clone/checkout/push, symlinks for large files |
| `github-api-patterns.md` | PR creation and management | Octokit patterns, upsert comments, review posting |

### Design Documents (docs/design/)

8 design documents created defining the complete system:

| Document | Contents |
|----------|----------|
| `architecture.md` | System overview diagram, module boundaries (falcon-pm, falcon-orchestrator, falcon-agent-infra, falcon-github), directory structure, tech stack decisions, phase dependencies |
| `data-model.md` | 10 database tables with full SQL schema, entity relationships, TypeScript types, seed data for labels and presets, JSON column patterns |
| `api.md` | Complete REST API specification with 40+ endpoints, request/response schemas, agent-facing API, WebSocket events, validation patterns |
| `ux.md` | 5 main screens (Dashboard, Kanban, Agents, PR Review, Settings), component library specs, user flows, real-time update patterns |
| `agent-lifecycle.md` | Agent state machine (INIT→IDLE→CHECKOUT→WORKING→DONE/ERROR), provisioning workflow, git operations per state, subscription slot management |
| `orchestration.md` | 14-stage issue workflow, transition rules, agent assignment algorithm, preset system, branch naming with Haiku, error handling |
| `integrations.md` | GitHub integration (PR, comments, merge, webhooks), Claude/Codex invocation patterns, WebSocket streaming, future integration points |
| `security.md` | Authentication strategy, GitHub token management, folder permissions, agent sandboxing, input validation, rate limiting |

---

## Key Design Decisions

### Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Database | SQLite + Drizzle ORM | File-based, TypeScript-first, excellent LLM code generation |
| Backend | Express.js | Simple, well-understood, good tooling |
| Frontend | React + TypeScript + Zustand | Component-based, lightweight state management |
| Styling | Tailwind CSS | Utility-first, rapid development |
| WebSocket | ws | Native, lightweight, no Socket.IO overhead needed |
| Git | simple-git | Promise-based, comprehensive API |
| GitHub | Octokit | Official SDK, TypeScript support |

### Architecture Decisions

1. **No API Keys for Agents**: Uses subscription-based auth (Claude Code sessions, Codex CLI auth)
2. **Isolated Git Worktrees**: Each agent operates in its own cloned repository
3. **Symlinks for Large Files**: `node_modules`, `.falcon/CORE` shared via symlinks to primary
4. **Stage-Based Communication**: Agents leave messages for stages, not specific agents
5. **Human Gates**: PR review requires human approval before fixer runs
6. **Preset System**: Configurable model selection per stage per issue type

### Workflow Stages (14 total)

```
BACKLOG → TODO → CONTEXT_PACK → CONTEXT_REVIEW → SPEC → SPEC_REVIEW →
IMPLEMENT → PR_REVIEW → PR_HUMAN_REVIEW → FIXER → TESTING → DOC_REVIEW →
MERGE_READY → DONE
```

### Database Entities (10 tables)

1. `projects` - Project configuration
2. `issues` - Work items with stage tracking
3. `labels` - Categorization
4. `issue_labels` - Many-to-many junction
5. `agents` - Registered AI agents
6. `documents` - Context packs, specs, ai_docs
7. `comments` - Discussion threads
8. `stage_messages` - Inter-stage communication
9. `workflow_runs` - Audit log of agent work
10. `model_presets` - Stage-model configurations
11. `pr_findings` - PR review findings for human review

---

## Directory Structure

### Created Files

```
ai_docs/
├── claude-code-noninteractive.md    # NEW
├── codex-cli-noninteractive.md      # NEW
├── react-typescript-llm-patterns.md # NEW
├── sqlite-drizzle-patterns.md       # NEW
├── websocket-realtime-patterns.md   # NEW
├── git-automation-patterns.md       # NEW
└── github-api-patterns.md           # NEW

docs/design/
├── architecture.md      # NEW
├── data-model.md        # NEW
├── api.md               # NEW
├── ux.md                # NEW
├── agent-lifecycle.md   # NEW
├── orchestration.md     # NEW
├── integrations.md      # NEW
└── security.md          # NEW
```

### Planned Implementation Structure

```
src/pm/
├── db/           # Phase 0
├── api/          # Phase 1
├── dashboard/    # Phase 2
├── agents/       # Phase 3-4
├── orchestrator/ # Phase 5
└── github/       # Phase 7

~/.falcon/
├── pm.db
├── config.yaml
└── projects/<slug>/
    ├── primary/
    ├── agents/<name>/
    └── issues/<id>/
```

---

## Implementation Phases

### Phase Dependencies

```
Phase 0 (Database) ─────────────────┐
          │                         │
          ▼                         ▼
Phase 1 (API) ──────────┬──── Phase 3 (Agent Infra)
          │             │           │
          ▼             │           ▼
Phase 2 (Kanban)        │     Phase 4 (Agent Comm)
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

### Phase Summary

| Phase | Name | Key Deliverables | Dependencies |
|-------|------|------------------|--------------|
| 0 | Database Foundation | Drizzle schema, migrations, seed data | None |
| 1 | REST API | Express server, CRUD endpoints, validation | Phase 0 |
| 2 | Kanban UI | React app, drag-drop board, issue modal | Phase 1 |
| 3 | Agent Infra | Provisioner, git-sync, lifecycle management | Phase 0 |
| 4 | Agent Comm | Agent API, non-interactive invocation, streaming | Phase 1, 3 |
| 5 | Orchestration | State machine, dispatcher, presets | Phase 3, 4 |
| 6 | Dashboard | Active agents view, PR review UI, settings | Phase 2, 5 |
| 7 | GitHub | PR creation, comments, merge, webhooks | Phase 5, 6 |

### Parallelization

Phases 2 (Kanban) and 3 (Agent Infra) can run in parallel after Phase 1 completes.

---

## Context for Implementors

### Key Patterns to Follow

1. **Schema-First**: Define Drizzle schema, let types flow from there
2. **Repository Pattern**: Wrap database access in repository modules
3. **Zod Validation**: All API inputs validated with Zod schemas
4. **WebSocket Channels**: `project:<slug>`, `issue:<id>`, `agent:<name>`
5. **Agent Tools**: `falcon_comment`, `falcon_stage_message`, `falcon_work_complete`

### Important Constraints

1. **No API Keys**: Agents use subscription auth only
2. **docs/design/ is Pre-System**: Agents do NOT read from design docs
3. **Single Machine**: No Redis, no distributed architecture
4. **Human Gates**: PR review always requires human action
5. **Branch Names via Haiku**: Use Claude Haiku for creative branch naming

### Files to Reference

| Need | Reference |
|------|-----------|
| Existing CLI patterns | `src/cli/commands/` |
| Repository pattern | `src/storage/repositories/base.repo.ts` |
| Database setup example | `src/storage/db.ts` |
| Streaming implementation | `src/cli/commands/checkout.ts` |
| Test patterns | `tests/` |

---

## Outstanding Questions for Review

1. **Subscription Management**: How to handle multiple Claude/Codex subscriptions?
2. **Agent Limits**: Maximum concurrent agents per project?
3. **Conflict Resolution**: Auto-resolution vs always-human for merge conflicts?
4. **Cost Tracking**: Should we track and display per-issue costs?
5. **Backup Strategy**: Database backup frequency and retention?

---

## Next Steps

1. **Human Review**: Review all design documents for accuracy
2. **Design Approval**: Approve or request changes to designs
3. **Finalize Docs**: Move approved content to `docs/system/`
4. **Phase 0 Spec**: Write detailed spec for database phase
5. **Begin Implementation**: Start Phase 0 (Database Foundation)

---

## Sprint Metrics

| Metric | Value |
|--------|-------|
| Research docs created | 7 |
| Design docs created | 8 |
| Database tables designed | 11 |
| API endpoints defined | 40+ |
| Workflow stages defined | 14 |
| Total documentation | ~2,500 lines |

---

## References

- Vision: `docs/design/falcon-new-vision.md`
- Original plan: Provided in conversation context
- Existing patterns: `src/`, `CORE/`, `specs/archive/`
