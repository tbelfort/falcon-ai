# Say-Your-Harmony: Complete System Documentation

**Version**: 1.2.5
**License**: MIT
**Package**: npm package with TypeScript

Say-Your-Harmony is a sophisticated multi-agent orchestration system for Claude Code that implements a rigorous 4-phase development methodology with continuous meta-learning.

---

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [The 4-Phase Mandate](#the-4-phase-mandate)
3. [Agent System](#agent-system)
4. [Skills System](#skills-system)
5. [Commands Reference](#commands-reference)
6. [Architecture](#architecture)
7. [Features](#features)
8. [Meta-Learning System](#meta-learning-system)
9. [Configuration](#configuration)
10. [Integration](#integration)

---

## Core Philosophy

### Key Mantras

| Phase | Mantra |
|-------|--------|
| Planning | "Correct problem definition is 50% of success" |
| Design | "Every decision needs documented rationale" |
| Implementation | "Parallel execution is key to N-way efficiency" |
| Operation | "Never stop at 'works' - push to production-ready" |

### Core Principles

1. **NO SHORTCUTS**: Every task goes through all 4 phases
2. **PARALLEL EXECUTION**: Independent tasks run concurrently (4x efficiency)
3. **DECISION DOCUMENTATION**: Every choice has documented rationale
4. **META-ANALYSIS MANDATORY**: Generate analysis after every major task
5. **CONTINUOUS IMPROVEMENT**: Use insights to improve future performance

---

## The 4-Phase Mandate

Every development task MUST progress through four mandatory phases:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│  PLANNING   │ →  │   DESIGN    │ →  │ IMPLEMENTATION  │ →  │  OPERATION  │
│   Phase 1   │    │   Phase 2   │    │     Phase 3     │    │   Phase 4   │
└─────────────┘    └─────────────┘    └─────────────────┘    └─────────────┘
      │                  │                    │                     │
      ▼                  ▼                    ▼                     ▼
  • Problem          • Architecture       • Parallel           • Deployment
  • Requirements     • Decisions          • Testing            • Verification
  • Information      • Tradeoffs          • Risk Analysis      • Meta-Analysis
```

### Phase Details

| Phase | Agent | Model | Duration | Focus |
|-------|-------|-------|----------|-------|
| **1. Planning** | planner | opus | ~5 turns | Problem definition, requirements, research |
| **2. Design** | architect | opus | ~8 turns | Architecture, decisions, tradeoffs, risks |
| **3. Implementation** | builder | sonnet | ~10 turns | Parallel coding, testing, quality |
| **4. Operation** | operator | sonnet | ~12 turns | Deployment, E2E tests, meta-analysis |

---

## Agent System

Say-Your-Harmony employs a **10-agent system** with specialized roles:

### Core 4-Phase Agents

#### Planner (Phase 1)
- **Model**: opus (EXPENSIVE)
- **Purpose**: Problem definition, requirements gathering, information collection
- **Process**:
  1. Document Discovery (Glob, Read, Task→explorer)
  2. Requirements Clarification (AskUserQuestion)
  3. Information Gathering (WebSearch)
  4. Problem Definition (structured markdown)
  5. Structured Plan with all 4 phases outlined
- **Tools**: Read, Grep, Glob, Task, AskUserQuestion, WebSearch, Write

#### Architect (Phase 2)
- **Model**: opus (EXPENSIVE)
- **Purpose**: Architecture design, decision documentation, tradeoff analysis
- **Process**:
  1. Architecture Design (component diagram, interactions, data flow)
  2. Technology Selection (Why/What/Alternatives for each choice)
  3. Tradeoff Analysis (Security vs UX, Performance vs Maintainability)
  4. Risk Classification (P0/P1/P2/P3 framework)
  5. Design Document generation
- **Tools**: Read, Grep, Glob, Write, WebSearch

#### Builder (Phase 3)
- **Model**: sonnet (CHEAP)
- **Purpose**: Parallel implementation, testing, risk mitigation
- **Key Features**:
  - Identifies independent tasks for parallel execution
  - Writes tests alongside code
  - Risk analysis during implementation
  - 100% test pass rate required
- **Tools**: Read, Write, Edit, Bash, Grep, Glob

#### Operator (Phase 4)
- **Model**: sonnet (CHEAP)
- **Purpose**: Deployment verification, E2E testing, meta-analysis
- **Process**:
  1. Deployment Verification (build, package, entry points)
  2. End-to-End Testing (happy path, errors, integration)
  3. Risk Validation (P0/P1 resolved)
  4. Meta-Analysis Generation
  5. Production-Ready Checklist
- **Tools**: Bash, Read, Task, Write

### Orchestration Agent

#### Harmony (Master Orchestrator)
- **Model**: opus (EXPENSIVE)
- **Purpose**: Enforces 4-phase workflow, coordinates transitions
- **Responsibilities**:
  - Phase completion verification
  - No phase skipping enforcement
  - Parallel execution coordination in Phase 3
  - Meta-analysis triggering after Phase 4
- **Tools**: Read, Task, TodoWrite, Bash

### Support Agents

| Agent | Model | Cost | Purpose |
|-------|-------|------|---------|
| **explorer** | haiku | CHEAP | Fast codebase search (Glob/Grep/Read) |
| **documenter** | haiku | CHEAP | Technical documentation writing |
| **meta-analyzer** | opus | EXPENSIVE | Session analysis, pattern extraction |
| **meta-aggregator** | opus | EXPENSIVE | Cross-session pattern consolidation |
| **phase-meta-extractor** | haiku | CHEAP | Background per-phase semantic extraction |

### Agent Hierarchy

```
┌──────────────────────────────────────────┐
│           HARMONY (Orchestrator)          │
└──────────────────────────────────────────┘
                    ↓
    ┌───────┬───────┼───────┬───────┐
    ↓       ↓       ↓       ↓       ↓
PLANNER ARCHITECT BUILDER OPERATOR
Phase 1  Phase 2  Phase 3  Phase 4
    │       │       │       │
    └───────┴───────┴───────┘
                ↓
    ┌───────┬───────┬────────────────┐
    ↓       ↓       ↓                ↓
EXPLORER DOCUMENTER META-ANALYZER PHASE-META
(search) (writing)  (analysis)    (background)
```

---

## Skills System

Say-Your-Harmony provides **11 skills** organized by function:

### Core Workflow Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **phase** | `/harmony`, `/plan`, `/design`, `/build`, `/operate` | Enforces 4-phase workflow |

### Enhancement Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **ultrathink** | `/ultrathink <task>` | Deep 6-phase structured analysis |
| **parallel** | `/parallel <task>` | Parallel execution (4x+ efficiency) |
| **ultrawork** | `/ultrawork` | Maximum performance mode |

### Development Skills

| Skill | Purpose |
|-------|---------|
| **git-master** | Atomic commits, rebase surgery, style detection |
| **frontend-ui-ux** | Designer-developer UI/UX creation |
| **deepinit** | Hierarchical AGENTS.md documentation |
| **release** | Automated release workflow |

### Meta-Analysis Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **meta** | `/meta` | Generate 8-section meta-analysis |
| **metaview** | `/metaview` | Pattern library dashboard |
| **metaclear** | `/metaclear` | Safe meta-analysis cleanup |

---

## Commands Reference

### Phase Commands

```bash
/plan <description>      # Start Phase 1 - Planning
/design                  # Start Phase 2 - Design
/build <task>            # Start Phase 3 - Implementation
/operate <task>          # Start Phase 4 - Operation
/harmony <task>          # Execute all 4 phases automatically
```

### Enhancement Commands

```bash
/ultrathink <question>   # Deep structured analysis mode
/parallel <task>         # Parallel execution mode
/ultrawork               # Maximum performance mode
```

### Meta-Analysis Commands

```bash
/meta                    # Generate session meta-analysis
/metaview                # View pattern library dashboard
/metaview --top 10       # Top 10 patterns
/metaview --phase design # Phase-specific patterns
/metaclear               # Preview files to delete
/metaclear --confirm     # Execute deletion
/metaclear --backup      # Backup before deleting
/aggregate               # Consolidate meta-analyses
/aggregate --force       # Full regeneration
```

---

## Architecture

### Directory Structure

```
say-your-harmony/
├── src/
│   ├── index.ts              # Main entry point
│   ├── agents/               # 10 agent definitions
│   │   ├── planner.ts
│   │   ├── architect.ts
│   │   ├── builder.ts
│   │   ├── operator.ts
│   │   ├── harmony.ts
│   │   ├── explorer.ts
│   │   ├── documenter.ts
│   │   ├── meta-analyzer.ts
│   │   ├── meta-aggregator.ts
│   │   └── phase-meta-extractor.ts
│   ├── config/               # Configuration loading
│   ├── features/             # Feature implementations
│   │   ├── magic-keywords.ts
│   │   ├── continuation-enforcement.ts
│   │   ├── background-tasks.ts
│   │   ├── boulder-state/
│   │   ├── context-injector/
│   │   ├── model-routing/
│   │   └── background-agent/
│   ├── hooks/                # 25+ Claude Code hooks
│   ├── cli/                  # CLI commands
│   ├── mcp/                  # MCP server configs
│   └── tools/                # LSP and AST tools
├── agents/                   # Agent markdown definitions
├── skills/                   # Skill definitions
├── commands/                 # Command definitions
└── examples/                 # Usage examples
```

### Core Exports

```typescript
// Main session creation
createHarmonySession(options?: HarmonyOptions): HarmonySession

// Quick prompt enhancement
enhancePrompt(prompt: string, config?: PluginConfig): string

// System prompt access
getHarmonySystemPrompt(options): string

// Agent definitions
getAgentDefinitions(): AgentDefinition[]
```

### Key Types

```typescript
type ModelType = 'sonnet' | 'opus' | 'haiku' | 'inherit'
type AgentCost = 'FREE' | 'CHEAP' | 'EXPENSIVE'
type AgentCategory = 'exploration' | 'specialist' | 'advisor' |
                     'utility' | 'orchestration' | 'planner' | 'reviewer'

interface HarmonySession {
  queryOptions: { options: SessionOptions }
  state: SessionState
  config: PluginConfig
  processPrompt: (prompt: string) => string
  detectKeywords: (prompt: string) => string[]
  backgroundTasks: BackgroundTaskManager
  shouldRunInBackground: (command: string) => TaskExecutionDecision
}
```

---

## Features

### 1. Magic Keywords

| Keyword | Aliases | Effect |
|---------|---------|--------|
| `ultrawork` | `ulw`, `uw` | Maximum performance mode |
| `search` | `find`, `locate` | Codebase search activation |
| `analyze` | `investigate`, `examine` | Deep analysis mode |
| `ultrathink` | `think`, `reason`, `ponder` | Extended thinking |

### 2. Background Tasks

Automatically identifies long-running operations:
- `npm install`, `cargo build`, `docker build`
- `git clone`, large test suites
- Any operation > 30 seconds

### 3. Model Routing

Intelligent tier selection based on task complexity:

| Tier | Model | Use Case |
|------|-------|----------|
| LOW | haiku | Simple lookups, fast searches |
| MEDIUM | sonnet | Standard implementation work |
| HIGH | opus | Complex analysis, strategic decisions |

### 4. Continuation Enforcement

Ensures tasks complete before stopping:
- Verifies all 4 phases completed
- Validates completion criteria
- Prevents premature session endings

### 5. Context Injection

Multi-source context collection:
- Project `.claude/harmony.jsonc`
- User `~/.config/say-your-harmony/config.jsonc`
- `AGENTS.md` and `CLAUDE.md` files

---

## Meta-Learning System

### The Learning Loop

```
Session N → Meta-Analysis → Pattern Library → Session N+1 (faster)
              ↓                    ↓
         8 sections          Ranked patterns
         extracted           by frequency
```

### Meta-Analysis Output (8 Sections)

1. **Work Process Structure**: Phase breakdown, tool usage
2. **Decision Trees**: Key decisions with rationale
3. **Problem-Solving Patterns**: Reusable approaches
4. **Code Quality Metrics**: LOC, coverage, complexity
5. **Efficiency Analysis**: Parallel speedup measurements
6. **Communication Analysis**: Effective patterns
7. **Best Practices Extracted**: Patterns to continue
8. **Continuous Improvement**: Actionable suggestions

### Semantic Phase Meta

Each phase generates JSON metadata:

```json
{
  "phase": "implementation",
  "accomplishment": "OAuth2 implementation complete",
  "keyInsight": "Token refresh needs mutex lock",
  "decisions": ["JWT over session", "Redis for cache"],
  "challenges": ["Race condition in refresh"],
  "risks": [{"type": "P1", "desc": "Token expiry edge case"}],
  "sequentialDeps": ["db-schema", "architecture-doc"],
  "parallelSuccesses": ["frontend-ui", "api-docs"]
}
```

### Efficiency Gains

| Metric | Without Meta | With Meta | Improvement |
|--------|--------------|-----------|-------------|
| Web searches | 5 | 0 | 100% reduction |
| Decision count | 15 | 5 | 67% reduction |
| Tool calls | 150 | 100 | 33% reduction |
| Total time | 45 min | 27 min | 40% faster |

### Learning Curve

```
Meta Count:  0     1     3     6    10+
Improvement: 0%   22%   35%   42%   47%
```

**Formula**: `improvement ≈ 25 * ln(meta_count + 1) - 5`

---

## Configuration

### Configuration File

Create `.claude/harmony.jsonc` in your project:

```jsonc
{
  // Agent model overrides
  "agents": {
    "harmony": { "model": "opus" },
    "explorer": { "model": "haiku" }
  },

  // Feature toggles
  "features": {
    "parallelExecution": true,
    "lspTools": true,
    "astTools": true,
    "continuationEnforcement": true,
    "autoContextInjection": true
  },

  // MCP servers
  "mcpServers": {
    "exa": { "enabled": true },
    "context7": { "enabled": true }
  },

  // Permissions
  "permissions": {
    "allowBash": true,
    "allowEdit": true,
    "maxBackgroundTasks": 5
  }
}
```

### Default Model Tiers

| Tier | Model | Agents |
|------|-------|--------|
| HIGH | claude-opus-4-5-20251101 | harmony, planner, architect, meta-analyzer |
| MEDIUM | claude-sonnet-4-5-20250929 | builder, operator, documenter |
| LOW | claude-haiku-4-5-20251001 | explorer, phase-meta-extractor |

---

## Integration

### With Claude Agent SDK

```typescript
import { createHarmonySession } from 'say-your-harmony';

const session = createHarmonySession({
  config: {
    features: {
      parallelExecution: true,
      continuationEnforcement: true
    }
  }
});

// Use session.queryOptions with Agent SDK
const agent = new Agent({
  systemPrompt: session.queryOptions.options.systemPrompt,
  agents: session.queryOptions.options.agents
});
```

### Keyword Detection

```typescript
const prompt = 'ultrathink about the authentication architecture';
const keywords = session.detectKeywords(prompt);
// Returns: ['ultrathink']

const enhanced = session.processPrompt(prompt);
// Returns enhanced system prompt with thinking mode
```

### MCP Servers

Supported servers:
- **Exa**: AI-powered web search
- **Context7**: Official documentation lookup
- **grep.app**: GitHub code search
- **Playwright**: Browser automation
- **Filesystem**: Extended file operations
- **Git**: Git operations

---

## The Harmony Promise

Before concluding ANY work, verify:

- [ ] All 4 phases completed
- [ ] Tests passing
- [ ] P0 risks fixed
- [ ] Meta-analysis generated
- [ ] User request FULLY satisfied

**If ANY checkbox is unchecked, YOU ARE NOT DONE. Continue working.**

---

## Quick Reference

### Workflow Commands

```bash
/harmony "Build user authentication"  # Full 4-phase workflow
/plan "Design payment system"         # Start planning only
/ultrathink "Should we use GraphQL?"  # Deep analysis
/meta                                 # Generate meta-analysis
```

### Risk Classification

| Priority | Severity | Action |
|----------|----------|--------|
| P0 | CRITICAL | Block deployment until fixed |
| P1 | HIGH | Fix before production |
| P2 | MEDIUM | Quality improvement |
| P3 | LOW | Future consideration |

### Production-Ready Checklist

1. Functionally complete
2. Well-tested (80%+ coverage)
3. Secure (P0/P1 vulnerabilities fixed)
4. Monitored (observability in place)
5. Configurable (environment-based)
6. Maintainable (clean code)
7. Documented (API docs, README)
8. Resilient (error handling)

---

*Say-Your-Harmony v1.2.5 - Multi-Agent Orchestration for Claude Code*
