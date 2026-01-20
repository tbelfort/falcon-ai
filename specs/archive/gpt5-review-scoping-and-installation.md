# GPT-5 Review Request: Global Scoping & Installation Architecture

**Date:** 2026-01-19
**Requested by:** Human
**Priority:** HIGH - Blocks implementation

---

## Context

The Pattern Attribution System spec (v1.0) was written with implicit single-project assumptions. We need to redesign it as a **general-purpose, globally installable system** for Claude Code that can manage multiple projects while sharing baseline knowledge.

**Integrations:** Linear (issue tracking) + Git (source of truth for specs/context packs)

**Your task:** Review the existing specs, identify all places that need updates, and make edits to implement:
1. Option C (hierarchical scoping)
2. Installation/CLI architecture
3. Git-managed specs and context packs (Linear docs reference git, not vice versa)

---

## Part 1: Scoping Architecture Gap

### Current Problem

The spec has no project/workspace scoping. Key entities lack isolation:

```typescript
// Current - no scoping
interface PatternDefinition {
  id: string;
  patternKey: string;
  // No projectId, workspaceId, or scope field
}

interface PatternOccurrence {
  issueId: string;      // "CON-123" is just an example, not a real constraint
  prNumber: number;
  // No project context
}
```

**Issues this causes:**
1. Unclear if patterns from Project A should warn Project B
2. Baseline principles (universal truths) mixed with learned patterns (project-specific)
3. No way to install once and use across multiple codebases
4. ProvisionalAlerts have no clear scope for promotion decisions

### Proposed Solution: Option C (Hierarchical Scoping)

```
┌─────────────────────────────────────────────────────────────────┐
│                     GLOBAL (~/.falcon-ai/)                       │
│  • CLI tool binary                                               │
│  • System-wide database (patterns, occurrences, etc.)           │
│  • Workspace configurations                                      │
├─────────────────────────────────────────────────────────────────┤
│                     WORKSPACE (Organization)                     │
│  • Baseline principles (B01-B11) - shared across all projects   │
│  • Derived principles from pattern clusters                      │
│  • Workspace-level configuration                                 │
├─────────────────────────────────────────────────────────────────┤
│                     PROJECT (.falcon/ in repo)                   │
│  • CORE files (TASKS, ROLES, TEMPLATES, agents, commands)       │
│  • Specs and context packs (git-managed)                         │
│  • Learned patterns (from this project's PR reviews)            │
│  • PatternOccurrences, ProvisionalAlerts                        │
│  • ExecutionNoncompliance records, InjectionLogs                │
│  • Project-specific configuration                                │
└─────────────────────────────────────────────────────────────────┘
```

### Schema Changes Required

**Add to all relevant entities:**

```typescript
// New: Scope discriminator
type Scope =
  | { level: 'global' }
  | { level: 'workspace'; workspaceId: string }
  | { level: 'project'; workspaceId: string; projectId: string };

// Updated PatternDefinition
interface PatternDefinition {
  id: string;
  scope: Scope;                    // NEW: Where does this pattern live?
  // ... rest unchanged
}

// Updated DerivedPrinciple
interface DerivedPrinciple {
  id: string;
  scope: Scope;                    // Baselines: workspace level
  // ... rest unchanged
}

// Updated PatternOccurrence
interface PatternOccurrence {
  id: string;
  projectId: string;               // NEW: Which project generated this?
  workspaceId: string;             // NEW: Which workspace?
  // ... rest unchanged
}
```

### Injection Behavior Changes

Update `selectWarningsForInjection()` to query hierarchically:

```
1. Load baseline principles from WORKSPACE level (always)
2. Load learned patterns from PROJECT level (filtered by taskProfile)
3. Optionally: Load high-severity patterns from sibling projects in same workspace
   (configurable: workspace.crossProjectWarnings = true/false)
```

### Pattern Promotion Path

```
ProvisionalAlert (project)
    → Pattern (project)
    → [if 3+ projects affected] → DerivedPrinciple (workspace)
```

---

## Part 1.5: Git-Managed Specs & Context Packs

### Current Problem (in CORE/TASKS/WORKFLOW/SPEC.md)

The current workflow says:
> "Linear is the source of truth for specs. The Linear document is canonical; the file on disk is a convenience copy."

**This is backwards.** Linear docs are hard to version, diff, and machine-parse. Git is better for:
- Version history
- Diffs and blame
- Machine-readable formats (JSON/YAML frontmatter + markdown)
- CI/CD integration
- Cross-referencing between specs and context packs

### New Architecture: Git as Source of Truth

```
┌─────────────────────────────────────────────────────────────────┐
│                        GIT (Source of Truth)                     │
│                                                                  │
│  project/.falcon/                                                │
│  ├── context_packs/                                              │
│  │   ├── ISSUE-123.md          # Machine-readable context pack  │
│  │   ├── ISSUE-124.md                                           │
│  │   └── ...                                                     │
│  ├── specs/                                                      │
│  │   ├── ISSUE-123.md          # Machine-readable spec          │
│  │   ├── ISSUE-124.md                                           │
│  │   └── ...                                                     │
│  └── project.json              # Project config                  │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Sync (agents upload, with backlink)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LINEAR (Human-Readable View)                 │
│                                                                  │
│  Linear Doc: "ISSUE-123 Context Pack"                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ > **Source:** `project/.falcon/context_packs/ISSUE-123.md`  ││
│  │ > **Commit:** abc1234                                        ││
│  │ > **Branch:** feature/issue-123                              ││
│  │                                                              ││
│  │ [Human-readable content rendered from git version]           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Machine-Readable Format

Context packs and specs should have structured frontmatter:

```markdown
---
# Machine-readable header (YAML)
type: context_pack  # or "spec"
issue_id: ISSUE-123
project_id: proj_abc123
workspace_id: ws_xyz789
version: 1
created_at: 2026-01-19T10:00:00Z
updated_at: 2026-01-19T14:30:00Z
author_agent: context-pack-agent
linear_doc_id: doc_abc123  # Reference to Linear doc (for sync)
status: drafted  # drafted | reviewed | approved | implemented

# For context packs
component_type: api
task_profile:
  touches: [database, user_input, api]
  technologies: [postgres, typescript]
  task_types: [api, crud]
  confidence: 0.85

# Source map (for attribution)
sources_consulted:
  - path: docs/architecture/LAYERS.md
    commit: abc1234
    sections: ["3.1", "3.2"]
  - path: docs/security/INPUT_VALIDATION.md
    commit: abc1234
    sections: ["2.1"]
---

# Context Pack: ISSUE-123

## Goal
[One sentence goal]

## Non-Goals
[What this does NOT cover]

...rest of content...
```

### Workflow Changes

**Context Pack Creation:**
1. Agent creates `.falcon/context_packs/ISSUE-123.md` with frontmatter
2. Agent commits to branch
3. Agent uploads to Linear with backlink: "Source: `repo/.falcon/context_packs/ISSUE-123.md` @ commit abc1234"
4. Linear doc ID saved in frontmatter for future sync

**Spec Creation:**
1. Agent reads context pack from `.falcon/context_packs/ISSUE-123.md`
2. Agent creates `.falcon/specs/ISSUE-123.md` with frontmatter
3. Agent commits to branch
4. Agent uploads to Linear with backlink

**Updates:**
1. Agent edits the git file
2. Agent commits with message referencing the change
3. Agent updates Linear doc with new content + updated commit reference

**Attribution Benefits:**
- `DocFingerprint` can now always be `kind: 'git'` for specs/context packs
- Exact commit SHA for provenance
- Easy invalidation when source doc changes (git diff)

### Files to Update

The following workflow files need updating to flip Linear→Git source of truth:

1. `CORE/TASKS/WORKFLOW/SPEC.md`
   - Remove "Linear is source of truth"
   - Add git-first workflow (output to `.falcon/specs/ISSUE-ID.md`)
   - Add frontmatter requirements
   - Update all path references to use `.falcon/` prefix

2. `CORE/TASKS/WORKFLOW/CONTEXT_PACK.md`
   - Same changes (output to `.falcon/context_packs/ISSUE-ID.md`)

3. `CORE/TASKS/WORKFLOW/SPEC_REVIEW.md`
   - Read from `.falcon/specs/`, not Linear

4. `CORE/TASKS/WORKFLOW/CONTEXT_PACK_REVIEW.md`
   - Read from `.falcon/context_packs/`, not Linear

5. All other `CORE/TASKS/WORKFLOW/*.md` files
   - Update path references to use `.falcon/` prefix
   - Reference specs at `.falcon/specs/ISSUE-ID.md`
   - Reference context packs at `.falcon/context_packs/ISSUE-ID.md`

### New CLI Commands

```bash
# Sync commands
falcon sync                      # Sync all local specs/context packs to Linear
falcon sync --issue ISSUE-123    # Sync specific issue
falcon sync --dry-run            # Preview what would be synced

# View commands
falcon context-pack show ISSUE-123   # Show context pack (from git)
falcon spec show ISSUE-123           # Show spec (from git)
falcon diff ISSUE-123                # Show diff between git and Linear versions
```

---

## Part 2: Installation Architecture

### Goal

Install `falcon-ai` (or whatever we name it) globally for Claude Code, similar to how MCP servers or CLI tools are installed.

### Installation Targets (Hybrid: Global + Project)

The system uses a **hybrid installation model**:
- **Global (`~/.falcon-ai/`)**: CLI binary, database, workspace configs
- **Project (`.claude/`)**: Claude Code native config (CLAUDE.md with injected warnings)
- **Project (`.falcon/`)**: All Falcon content - CORE files, specs, context packs, agents

```
~/.falcon-ai/                          # Global installation root
├── bin/
│   └── falcon                         # CLI binary (add to PATH)
├── config/
│   ├── global.json                    # Global settings
│   └── workspaces/
│       └── <workspace-id>.json        # Per-workspace config
├── db/
│   └── falcon.db                      # SQLite database (all data)
└── templates/                         # Templates for project init
    └── .falcon/                       # Template for project .falcon/
```

**Per-Project (`.claude/` - Claude Code native, minimal):**
```
project/.claude/
└── CLAUDE.md                          # Auto-updated with injected warnings
                                       # References .falcon/ for workflows
```

**Per-Project (`.falcon/` - All Falcon content):**
```
project/.falcon/
├── project.json                       # Links to workspace, project ID
│
├── # === CORE (installed from CORE/) ===
├── TASKS/
│   └── WORKFLOW/                      # Workflow files
│       ├── CHECKOUT.md
│       ├── CONTEXT_PACK.md
│       ├── SPEC.md
│       ├── SPEC_REVIEW.md
│       ├── IMPLEMENT.md
│       ├── TESTING.md
│       ├── PR_REVIEW.md
│       └── ...
├── ROLES/                             # Role definitions
│   ├── ARCHITECT.md
│   ├── PM.md
│   ├── QA.md
│   └── ...
├── TEMPLATES/                         # Research templates
│   └── research/
│       ├── ai-docs-research.md
│       └── research-gotchas.md
├── agents/                            # Agent prompts
│   ├── scouts/
│   │   ├── security-scout.md
│   │   ├── docs-scout.md
│   │   ├── bug-scout.md
│   │   ├── test-scout.md
│   │   ├── decisions-scout.md
│   │   └── spec-scout.md
│   ├── judges/
│   │   ├── security-judge.md
│   │   ├── docs-judge.md
│   │   ├── bug-judge.md
│   │   ├── test-judge.md
│   │   ├── decisions-judge.md
│   │   └── spec-judge.md
│   ├── attribution-agent.md
│   ├── context-pack-agent.md
│   └── spec-agent.md
├── commands/                          # Falcon commands
│   ├── checkout.md
│   └── ...
│
├── # === Project Data (generated) ===
├── context_packs/                     # Git-managed (source of truth)
│   ├── ISSUE-123.md
│   └── ...
├── specs/                             # Git-managed (source of truth)
│   ├── ISSUE-123.md
│   └── ...
├── ai_docs/                           # Research docs tied to issues
│   ├── ISSUE-123/
│   │   ├── httpx-async-patterns.md
│   │   └── pydantic-validation.md
│   └── ...
│
└── cache/                             # Gitignored (local temp files)
    └── ...
```

**Why this structure?**
- `.falcon/` is the single home for ALL Falcon content (CORE + data)
- `.claude/CLAUDE.md` only contains injected warnings and references to `.falcon/`
- Keeps Claude Code's native directory clean
- All paths in workflow files use `.falcon/` prefix for consistency
- Global `~/.falcon-ai/` holds only the CLI and shared database

### What Gets Installed

**Global (once, to `~/.falcon-ai/`):**
- CLI tool (`falcon` binary)
- Database schema and migrations
- Workspace configuration templates

**Per-Project (on `falcon init`, to `.falcon/`):**

From `CORE/` (excluding `archive/`):
- `CORE/TASKS/*` → `.falcon/TASKS/`
- `CORE/ROLES/*` → `.falcon/ROLES/`
- `CORE/TEMPLATES/*` → `.falcon/TEMPLATES/`
- `CORE/agents/*` → `.falcon/agents/`
- `CORE/commands/*` → `.falcon/commands/`

Components that should exist in CORE (create if missing):
- Scout agent prompts (6 scouts) - `CORE/agents/scouts/`
- Judge agent prompts (6 judges) - `CORE/agents/judges/`
- Attribution agent prompt - `CORE/agents/attribution-agent.md`
- Context pack agent prompt - `CORE/agents/context-pack-agent.md`
- Spec agent prompt - `CORE/agents/spec-agent.md`
- Checkout command - `CORE/commands/checkout.md`

**Also created:**
- `.claude/CLAUDE.md` - With reference to `.falcon/` and injected warnings

### Project Initialization

When a user runs `falcon init` in a project directory:

```bash
$ cd ~/Projects/my-app
$ falcon init --workspace "my-company"

✓ Created .falcon/ directory with CORE files
✓ Created .claude/CLAUDE.md with falcon references
✓ Linked to workspace: my-company
✓ Project ID: proj_abc123
✓ Ready for falcon workflow

Next steps:
  falcon status           # View project status
  falcon patterns         # List patterns affecting this project
  /checkout ISSUE-123     # Start working on an issue
```

Creates:

**`.claude/CLAUDE.md` (Claude Code native - minimal):**
```markdown
# CLAUDE.md

This project uses the Falcon workflow system.

## Falcon Integration

Workflow files: `.falcon/TASKS/WORKFLOW/`
Role definitions: `.falcon/ROLES/`
Agent prompts: `.falcon/agents/`

To work on an issue: `/checkout ISSUE-123`

## Warnings from Past Issues (auto-injected)

[This section is auto-updated by falcon inject]
```

**`.falcon/` (All Falcon content - committed to git except cache):**
```
.falcon/
├── project.json                  # Project config (workspace link, project ID)
│
├── # CORE files (from installation)
├── TASKS/
│   └── WORKFLOW/                 # All workflow files
├── ROLES/                        # All role definitions
├── TEMPLATES/                    # Research templates
├── agents/                       # Scout, judge, and other agent prompts
├── commands/                     # Falcon command definitions
│
├── # Project data (generated during work)
├── context_packs/                # Git-managed context packs
│   └── .gitkeep
├── specs/                        # Git-managed specs
│   └── .gitkeep
├── ai_docs/                      # Research docs (organized by issue)
│   └── .gitkeep
│
└── cache/                        # Gitignored (local temp files)
    └── .gitignore
```

**What gets committed:**
- `.claude/CLAUDE.md` - Minimal, with references to .falcon/
- `.falcon/` - Everything EXCEPT `.falcon/cache/`
  - CORE files (TASKS, ROLES, TEMPLATES, agents, commands)
  - `project.json`
  - `context_packs/*`
  - `specs/*`
  - `ai_docs/*`

### Claude Code Integration

The system should integrate with Claude Code via:

1. **CLAUDE.md injection** - Auto-append relevant warnings to project CLAUDE.md
2. **Hooks** - Trigger attribution after PR reviews
3. **MCP server** (optional) - Expose pattern queries to Claude

---

## Part 3: CLI Tool Specification

### Commands

```bash
# Installation & Setup
falcon install                    # Install globally
falcon upgrade                    # Upgrade to latest version
falcon uninstall                  # Remove global installation

# Workspace Management
falcon workspace create <name>    # Create new workspace
falcon workspace list             # List all workspaces
falcon workspace switch <name>    # Set default workspace
falcon workspace config           # Edit workspace config

# Project Management
falcon init                       # Initialize project in current directory
falcon link <workspace>           # Link project to workspace
falcon unlink                     # Unlink project from workspace
falcon status                     # Show project status

# Pattern Management
falcon patterns                   # List patterns for current project
falcon patterns --workspace       # List workspace-level patterns
falcon patterns --all             # List all (project + workspace + baselines)
falcon pattern show <id>          # Show pattern details
falcon pattern archive <id>       # Archive a pattern
falcon pattern unarchive <id>     # Restore archived pattern

# Injection
falcon inject --dry-run           # Preview injection for current project
falcon inject                     # Generate warnings for Context Pack/Spec
falcon inject --target spec       # Generate warnings for Spec only

# Attribution (typically called by automation)
falcon attribute <finding-json>   # Run attribution on a finding
falcon attribute --batch <file>   # Batch attribution from file

# Monitoring & Reporting
falcon stats                      # Show statistics
falcon stats --workspace          # Workspace-wide statistics
falcon alerts                     # List active ProvisionalAlerts
falcon adherence                  # Show adherence rates
falcon misses                     # Show TaggingMiss records

# Database Management
falcon db migrate                 # Run pending migrations
falcon db backup                  # Backup database
falcon db export                  # Export data as JSON
falcon db import <file>           # Import data from JSON

# Debug & Admin
falcon debug injection <issue-id> # Debug why patterns were/weren't injected
falcon debug attribution <pr>     # Debug attribution for a PR
falcon config                     # Show current configuration
falcon logs                       # View recent activity logs
```

### Example Workflows

**View patterns affecting current project:**
```bash
$ falcon patterns

PROJECT: my-app (proj_abc123)
WORKSPACE: my-company

BASELINE PRINCIPLES (from workspace):
  B01 [database,user_input] Always use parameterized queries...
  B02 [user_input] Validate, sanitize, and bound all external input...

LEARNED PATTERNS (from this project):
  P001 [SECURITY][HIGH] SQL template literals → injection (2 occurrences)
  P002 [CORRECTNESS][MEDIUM] Missing null check → NPE (1 occurrence)

PROVISIONAL ALERTS:
  A001 [SECURITY] Potential SSRF in image proxy (expires: 2026-02-01)
```

**Debug why a pattern wasn't injected:**
```bash
$ falcon debug injection ISSUE-456

Issue: ISSUE-456
TaskProfile: { touches: [api, network], technologies: [rest], taskTypes: [api] }

PATTERN P001 (SQL injection):
  ✗ NOT INJECTED
  Reason: touches mismatch
    Pattern requires: [database, user_input]
    Task has: [api, network]

PATTERN P002 (Null check):
  ✓ INJECTED
  Reason: touches overlap (api ∩ api)
```

---

## Part 3.5: Agent Invocation & Checkout Command

### How Agents Are Invoked

The system uses Claude Code's native capabilities. Agents are NOT separate processes - they are **prompt templates** that Claude Code loads and executes.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLAUDE CODE SESSION                         │
│                                                                  │
│  User: /checkout ISSUE-123                                      │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  falcon checkout command:                                   ││
│  │  1. Fetch issue from Linear                                 ││
│  │  2. Determine issue state → select workflow                 ││
│  │  3. Load appropriate agent prompt                           ││
│  │  4. Inject relevant patterns/warnings                       ││
│  │  5. Execute as Claude Code task                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                           │                                      │
│                           ▼                                      │
│  Claude executes workflow with injected context                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Checkout Command

**`/checkout <issue-id>`** is the primary entry point. It:

1. **Fetches issue metadata** from Linear (state, labels, assignee)
2. **Determines current workflow stage:**
   - `Todo` → Run Context Pack agent
   - `Context Pack Drafted` → Run Spec agent
   - `Spec Drafted` → Run Spec Hardening agent
   - `Ready to Start` → Run Implementation agent
   - `In Review` → Run PR Review (scouts + judges)
3. **Loads the appropriate workflow file** from `.falcon/TASKS/WORKFLOW/`
4. **Injects warnings** via `falcon inject` based on issue's taskProfile
5. **Spawns Claude Code Task** with the composed prompt

```bash
# User runs:
/checkout ISSUE-123

# Falcon does (internally):
1. GET Linear issue ISSUE-123
2. State = "Context Pack Drafted" → need Spec
3. Load .falcon/TASKS/WORKFLOW/SPEC.md
4. Load context pack from .falcon/context_packs/ISSUE-123.md
5. Run: falcon inject --issue ISSUE-123 --target spec
6. Compose prompt: [SPEC.md] + [context pack] + [injected warnings]
7. Execute via Claude Code Task tool
```

### Scout and Judge Invocation

PR Review uses a **fan-out pattern**:

```
/checkout ISSUE-123  (state: In Review)
         │
         ├── Spawn 6 Scout Tasks (parallel, sonnet)
         │   ├── Security Scout
         │   ├── Docs Scout
         │   ├── Bug Scout
         │   ├── Test Scout
         │   ├── Decisions Scout
         │   └── Spec Scout
         │
         ▼ (wait for all scouts)
         │
         ├── Spawn 6 Judge Tasks (parallel, opus)
         │   └── Each judge evaluates their scout's findings
         │
         ▼ (wait for all judges)
         │
         └── Orchestrator synthesizes verdict
                    │
                    ▼
              falcon attribute --batch <findings.json>
```

### CLI Commands for Manual Invocation

```bash
# Checkout (primary command)
falcon checkout ISSUE-123              # Auto-detect workflow stage
falcon checkout ISSUE-123 --stage spec # Force specific stage

# Individual workflow stages (for debugging/manual runs)
falcon context-pack ISSUE-123          # Run context pack creation
falcon spec ISSUE-123                  # Run spec creation
falcon implement ISSUE-123             # Run implementation
falcon review ISSUE-123                # Run PR review (scouts + judges)

# Scout/Judge (typically not run manually)
falcon scout security --pr 456         # Run single scout
falcon judge security --findings <file> # Run single judge
```

### Claude Code Integration Points

**Skills (user-invoked):**
- `/checkout` - Main workflow entry
- `/falcon status` - Show project status
- `/falcon patterns` - List patterns

**Hooks (automatic):**
- `PostPRMerge` - Trigger attribution if PR had review findings
- `PreToolUse:Write` - (optional) Check for pattern violations before writes

**MCP Server (optional, for advanced queries):**
- `falcon://patterns/query` - Query patterns programmatically
- `falcon://inject` - Get injection payload for current context

---

## Part 4: Files Requiring Updates

Please review and update these files:

### Spec Files
1. `specs/spec-pattern-attribution-v1.0.md`
   - Add Scope type and fields to all entities
   - Update injection algorithm for hierarchical queries
   - Add workspace/project configuration sections
   - Update examples to show scoping

2. `specs/implementation-plan-master.md`
   - Add Phase 0: Installation & CLI
   - Update Phase 1 for scoped storage layer
   - Add CLI implementation tasks

3. `specs/phases/phase-1-data-layer.md`
   - Add Scope schema
   - Add workspace/project tables
   - Update all entity schemas with scope fields

4. `specs/phases/phase-3-injection-system.md`
   - Update injection algorithm for hierarchical queries
   - Add cross-project warning configuration

### New Files to Create

**Specs:**
1. `specs/installation-spec.md` - Full installation specification
2. `specs/cli-spec.md` - CLI tool specification
3. `specs/git-workflow-spec.md` - Git-as-source-of-truth workflow

**CORE reorganization (installs to project `.falcon/`):**

Current CORE structure needs these additions:
```
CORE/
├── agents/                      # NEW directory
│   ├── scouts/
│   │   ├── security-scout.md
│   │   ├── docs-scout.md
│   │   ├── bug-scout.md
│   │   ├── test-scout.md
│   │   ├── decisions-scout.md
│   │   └── spec-scout.md
│   ├── judges/
│   │   ├── security-judge.md
│   │   ├── docs-judge.md
│   │   ├── bug-judge.md
│   │   ├── test-judge.md
│   │   ├── decisions-judge.md
│   │   └── spec-judge.md
│   ├── attribution-agent.md
│   ├── context-pack-agent.md
│   └── spec-agent.md
├── commands/                    # NEW directory
│   ├── checkout.md              # /checkout command definition
│   ├── status.md                # /falcon status
│   └── patterns.md              # /falcon patterns
├── TASKS/
│   └── WORKFLOW/                # (existing, needs path updates)
├── ROLES/                       # (existing)
└── TEMPLATES/                   # (existing)
```

**Note:** The `archive/` directory should NOT be included in installation.

### Path Updates Required in CORE Files

All CORE files that reference paths need updating to use `.falcon/` prefix.

**Example changes needed in `CORE/TASKS/WORKFLOW/SPEC.md`:**
```diff
# Output location change:
- Place specs in the `specs/` folder of the package being modified
- (e.g., src/packages/foundry/foundry-core/specs/)
+ Place specs in `.falcon/specs/ISSUE-ID.md`
+ (e.g., .falcon/specs/PROJ-123.md)

# Source of truth change:
- Linear is the source of truth for specs. The Linear document is canonical.
+ Git (`.falcon/specs/`) is the source of truth. Linear docs reference git.

# Context pack location change:
- Read context pack from Linear document
+ Read context pack from `.falcon/context_packs/ISSUE-ID.md`

# Workflow file references (when referencing other workflows):
- Read CORE/TASKS/WORKFLOW/IMPLEMENT.md
+ Read .falcon/TASKS/WORKFLOW/IMPLEMENT.md

# Role file references:
- Read CORE/ROLES/ARCHITECT.md
+ Read .falcon/ROLES/ARCHITECT.md

# Template references:
- Use template from CORE/TEMPLATES/research/ai-docs-research.md
+ Use template from .falcon/TEMPLATES/research/ai-docs-research.md
```

**Note:** Project docs (like `docs/architecture/...`) stay in the project - those paths don't change. Only CORE paths and spec/context pack output paths change.

**Decision needed for `ai_docs`:**
The current SPEC.md creates `ai_docs` in package folders (e.g., `src/packages/foundry/ai_docs/`). Options:
1. Keep ai_docs in package folders (project-specific research)
2. Move to `.falcon/ai_docs/` for consistency
3. Move to `.falcon/ai_docs/ISSUE-ID/` to tie them to issues

Recommendation: Option 3 - `.falcon/ai_docs/ISSUE-ID/` keeps all falcon-generated artifacts together and enables attribution tracking.

**Files that need path updates:**
- `CORE/TASKS/WORKFLOW/SPEC.md` - Spec output location, Linear references
- `CORE/TASKS/WORKFLOW/CONTEXT_PACK.md` - Context pack output location
- `CORE/TASKS/WORKFLOW/SPEC_REVIEW.md` - Where to read specs from
- `CORE/TASKS/WORKFLOW/CONTEXT_PACK_REVIEW.md` - Where to read context packs from
- `CORE/TASKS/WORKFLOW/IMPLEMENT.md` - Where to read specs from
- `CORE/TASKS/WORKFLOW/PR_REVIEW.md` - Where to read specs/context packs
- `CORE/ROLES/*.md` - Any path references
- `CORE/TEMPLATES/*.md` - Any path references

**Key pattern for all files:**
- Specs go to: `.falcon/specs/ISSUE-ID.md`
- Context packs go to: `.falcon/context_packs/ISSUE-ID.md`
- ai_docs go to: `.falcon/ai_docs/ISSUE-ID/<library-topic>.md`
- Workflow files are at: `.falcon/TASKS/WORKFLOW/`
- Role files are at: `.falcon/ROLES/`
- Templates are at: `.falcon/TEMPLATES/`
- Agent prompts are at: `.falcon/agents/`
- Commands are at: `.falcon/commands/`

---

## Part 5: Open Questions for GPT-5

### Architecture Questions

1. **Cross-project pattern sharing:** Should high-severity patterns from Project A automatically warn Project B in the same workspace? Or require explicit opt-in?

2. **Workspace ↔ Linear mapping:** Should falcon workspaces map 1:1 with Linear workspaces? Or be independent? (Leaning toward: 1:1 mapping by default, with ability to override)

3. **Pattern promotion threshold:** When should a project-level pattern become a workspace-level DerivedPrinciple? Current thought: 3+ projects affected.

4. **Database location:** Single SQLite at `~/.falcon-ai/db/falcon.db` or per-workspace databases? (Leaning toward: single DB with workspace/project scoping in tables)

### Distribution Questions

5. **CLI distribution:** npm package? Homebrew? Direct binary download? All of the above?

6. **Cross-platform paths:**
   - macOS/Linux: `~/.falcon-ai/`
   - Windows: `%APPDATA%\falcon-ai\` or `%LOCALAPPDATA%\falcon-ai\`?
   - Should we use XDG spec on Linux (`~/.config/falcon-ai/`, `~/.local/share/falcon-ai/`)?

### Operational Questions

7. **Offline support:** Should the system work fully offline, or require network for Linear integration? (Thinking: Linear required for checkout, but patterns/injection work offline)

8. **Migration from existing:** If someone already has patterns in a single-project setup, how do we migrate to the hierarchical model?

9. **Conflict between git and Linear:** If Linear doc is edited directly (out of band), how do we detect/resolve the conflict with git version?

### Workflow Questions

10. **Issue ID format:** The current workflow uses `CON-XXX` format (Linear). Should we:
    - Keep Linear format (e.g., `PROJ-123`)
    - Use our own format (e.g., `issue_abc123`)
    - Accept both with normalization?

11. **Multiple repos per project:** Can a Linear project span multiple git repos? If so, how do we handle `.falcon/` in each?

### Upgrade & Maintenance Questions

12. **CORE file versioning:** When CORE files (TASKS, ROLES, agents, etc.) are updated in the falcon-ai repo, how do projects get updates?
    - Manual `falcon upgrade` command?
    - Auto-detect on checkout and prompt?
    - Track CORE version in `project.json`?

13. **ai_docs location (confirm):** Move ai_docs to `.falcon/ai_docs/ISSUE-ID/` as recommended? Or keep in package folders?

14. **Linear API key storage:** Where do Linear API credentials go?
    - Global `~/.falcon-ai/config/global.json`?
    - Per-workspace config?
    - Environment variable only?

15. **Model configuration:** Scouts use sonnet, judges use opus per the spec. Should this be configurable per-workspace or hardcoded?

16. **Custom baseline principles:** Can workspaces add their own baseline principles beyond the default B01-B11? If yes, what's the approval process?

17. **Branch naming:** Should falcon enforce Linear's branch naming convention, or allow customization?

---

## Deliverables Expected

After your review:

### Spec Updates
1. Updated `specs/spec-pattern-attribution-v1.0.md` with scoping (Scope type, workspace/project fields)
2. Updated `specs/implementation-plan-master.md` with Phase 0: Installation & CLI
3. Updated `specs/phases/phase-1-data-layer.md` with scoped schemas
4. Updated `specs/phases/phase-3-injection-system.md` with hierarchical injection

### New Specs
5. New `specs/installation-spec.md` - Full installation specification
6. New `specs/cli-spec.md` - CLI tool specification
7. New `specs/git-workflow-spec.md` - Git-as-source-of-truth workflow

### CORE File Updates
8. Updated `CORE/TASKS/WORKFLOW/*.md` - All paths changed to `.falcon/` prefix
9. Updated `CORE/ROLES/*.md` - Any path references updated
10. Updated `CORE/TEMPLATES/*.md` - Any path references updated

### New CORE Files (if not already created)
11. `CORE/agents/scouts/*.md` - 6 scout agent prompts
12. `CORE/agents/judges/*.md` - 6 judge agent prompts
13. `CORE/agents/attribution-agent.md`
14. `CORE/agents/context-pack-agent.md`
15. `CORE/agents/spec-agent.md`
16. `CORE/commands/checkout.md`

### Documentation
17. Answers to all 17 open questions above
18. List of any additional gaps or concerns discovered
19. Recommended implementation order if different from current phases

---

## Reference: Current Spec Location

All specs are in: `/Users/tbelfort/Projects/falcon-ai/specs/`

Key files:
- `spec-pattern-attribution-v1.0.md` (main spec)
- `implementation-plan-master.md`
- `phases/phase-1-data-layer.md`
- `phases/phase-2-attribution-engine.md`
- `phases/phase-3-injection-system.md`
- `phases/phase-4-integration.md`
- `phases/phase-5-monitoring.md`
