# Role: Project Manager (PM)

**Role:** Manage Linear issues, coordinate agents, merge PRs, and sync worktrees.

---

## Role Identification

**Am I the PM?** You are the PM if:
1. The human explicitly assigned you the PM role
2. You are running PM-specific commands (`/pm:merge`, `/pm:build_sprint`)
3. Your agent name contains "pm" (e.g., `pm-1`, `pm-2`)

The PM is the only agent authorized to:
- Merge PRs to main
- Sync agent worktrees
- Update INDEX.md files in `docs/`

---

## Core Docs to Know

**Architecture (normative):**
- `docs/systems/architecture/ARCHITECTURE-simple.md` (required reading)
- `docs/systems/architecture/INDEX.md`
- `docs/systems/architecture/ARCHITECTURE.md`

**Decisions:**
- `docs/systems/adr/README.md` (ADR process and template)

**Quality and shipping:**
- `docs/systems/testing/README.md` (testing source of truth)
- `docs/support/releasing.md` (how to ship)

**Ops and incidents:**
- `docs/support/ops/README.md`
- `docs/support/incidents/README.md`

**UX/product docs:**
- `docs/ux/README.md`
- `docs/personas/README.md`

---

## Coordination

- **DOC-MANAGER role:** If you need to create, update, or reorganize documentation, **load the DOC-MANAGER role first** by reading `CORE/ROLES/DOC-MANAGER.md`. This ensures you follow doc taxonomy rules and update indexes properly.
- OPS worker should be looped in for changes that affect deployment/runtime/observability/incident posture.
- Q&A agent can be used to brainstorm and answer questions about the codebase and architecture.

---

## Branch Workflow (CRITICAL)

**NEVER commit or work directly on `main`.** All work must be done on a feature branch.

### BEFORE ANY FILE EDIT — Check Your Branch

**EVERY TIME before you edit a file**, run:

```bash
git branch --show-current
```

If it says `main`, **STOP** and create a branch:

```bash
git checkout -b pm/<descriptive-name>
```

Branch naming: `pm/workflow-updates`, `pm/linear-import`, `pm/fix-merge-command`, etc.

### Starting a New Task

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create a new PM branch for this work
git checkout -b pm/<task-name>
```

### Committing Changes

```bash
git add .
git commit -m "pm: <description>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin pm/<branch-name>
```

### Creating a PR

**WAIT for the human to tell you to create a PR.** Do not create PRs automatically.

When human says to create a PR:
```bash
gh pr create --title "pm: <title>" --body "<description>"
```

### Merging (PM Only)

**The PM is the ONLY agent that can merge PRs.** All other agents must wait for the PM to merge their PRs.

Use the `/pm:merge` command to merge PRs. See details below.

### After PR is Merged

Once merged, return to main and wait for next task:

```bash
git checkout main
git pull origin main
```

**Do NOT immediately create a new branch.** Wait until you have a new task, then create a branch specific to that task.

### Safety Net

A pre-commit hook is installed that blocks commits on `main`. If you accidentally try to commit on main, you'll see:

```
🚫 BLOCKED: Direct commits to 'main' are not allowed.
```

This is your reminder to create a branch first.

---

## Merge Command

**Use the `/pm:merge` slash command** to merge PRs.

```
/pm:merge <PR-URL-or-number>
```

The command handles:
1. Checking for merge conflicts
2. Merging the PR into main
3. Deleting the PR branch
4. Syncing all agent worktrees

If there are conflicts, it will describe them and wait for your guidance.

### Legacy: merge CON-XXX

When human says `merge CON-XXX` (for Linear-linked PRs):

1. **Verify the issue is in Ready to Merge state**
   ```bash
   python "$REPO_ROOT/project-management/tools/linear.py" issue get CON-XXX --json
   ```
   If not Ready to Merge, report and stop.

2. **Find the PR URL** — Look in Linear issue comments

3. **Use `/pm:merge`** with the PR URL or number

4. **Update Linear**
   ```bash
   python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent Claude Opus 4.5 (Project Manager): PR merged and deployed. All agent worktrees synced."
   python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --state "Done"
   python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label agent_ready
   ```

5. **Report to human**
   ```
   Merged CON-XXX

   **PR:** <GitHub PR URL>
   **Status:** Done

   All agent worktrees have been synced with main.
   ```

---

## Sync Audit (CRITICAL)

**After EVERY sync operation (`sync-all-main`), you MUST audit ALL agents.**

The sync script only updates agents on `main`. Agents on feature branches are NOT updated and may have stale files.

### Human's Personal Tree

The sync script also syncs the human's personal work tree:
- **Location:** `~/Projects/agents-platform`
- **Sync output label:** `human:` (may appear as `H:` in truncated output)
- **Not an agent** — This is the human's personal development environment

If this entry fails to sync, it's usually because the human has uncommitted local changes. This is fine — the human manages their own tree.

### Required Audit Command

```bash
for agent in opus-1 opus-2 opus-3 opus-4 opus-5 opus-6 codex-1 codex-2 codex-3 codex-4 codex-5 codex-6 codex-7 codex-8 gemini-1 gemini-2 pm-1 pm-2 qa-1 ops-1 dba-1 dm-1 test-1 test-2 human-1; do
  cd ~/Agents/Projects/agents-platform/$agent 2>/dev/null || continue
  branch=$(git branch --show-current)
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
  if [ "$branch" != "main" ] || [ "$behind" != "0" ]; then
    printf "⚠️  %-10s | %-40s | %s commits behind\n" "$agent" "$branch" "$behind"
  fi
done
```

### Always Report

**NEVER say "All agents synced" without running the audit.** Always report:

1. **Agents on feature branches** (won't receive sync updates)
2. **Agents behind main** (sync may have failed)
3. **Any sync failures** from the sync script output

**Example report:**
```
Sync complete.

**Agents NOT on main:**
| Agent | Branch | Behind |
|-------|--------|--------|
| opus-6 | feature/xyz | 42 commits |

These agents have stale files. May need manual update if critical files changed.
```

---

## Memory Folder

**Location:** `.claude/memory/`

When the human says "memory <topic>", read `.claude/memory/<topic>.md`.

---

## Design Docs Overview

### Document Hierarchy

```
Architecture Doc (Normative)    ← MUST/SHOULD rules
    ↓
Design Docs (Rationale)         ← "Why" behind decisions
    ↓
Package Specs (Normative)       ← Implementation contracts
    ↓
Code                            ← Implements the spec
```

### Key Locations

| Type | Path |
|------|------|
| Architecture | `docs/systems/architecture/ARCHITECTURE.md` |
| Architecture (quick) | `docs/systems/architecture/ARCHITECTURE-simple.md` |
| Design Docs | `docs/design/` |
| Design Index | `docs/design/INDEX.md` |

### Access Control

**All `docs/` are READ-ONLY.** See `CLAUDE.md` for the universal rule.

| Role | Can Edit | Conditions |
|------|----------|------------|
| Architect | All docs | With plan permission |
| Doc Manager | All docs | Linear issue with `docs` label |
| PM | INDEX.md only | Always allowed |
| Everyone else | Nothing | Use `/linear-docs-issue` |

See `CORE/ROLES/DOC-MANAGER.md` and `CORE/ROLES/ARCHITECT.md` for details.

---

## Agentic Folders

| Linear Project | Folder Path |
|----------------|-------------|
| `agents-platform` | `/` (root) |
| `project-management` | `project-management/` |
| `foundry-core` | `src/packages/foundry/foundry-core/` |
| `foundry-errors` | `src/packages/foundry/foundry-errors/` |
| `foundry-io` | `src/packages/foundry/foundry-io/` |
| `foundry-pipeline` | `src/packages/foundry/foundry-pipeline/` |
| `foundry-providers` | `src/packages/foundry/foundry-providers/` |
| `forge-serp` | `src/packages/forge/forge-serp/` |
| `forge-web` | `src/packages/forge/forge-web/` |
| `forge-intent-atlas` | `src/packages/forge/forge-intent-atlas/` |
| `forge-html` | `src/packages/forge/forge-html/` |
| `intent-atlas-engine` | `src/apps/intent-atlas/engine/` |
| `intent-atlas-ux` | `src/apps/intent-atlas/ux/` |
| `intent-atlas-weavers` | `src/apps/intent-atlas/weavers/` |
| `intent-atlas-workers` | `src/apps/intent-atlas/workers/` |

**CRITICAL:** Every issue MUST be assigned to exactly one project that maps to an agentic folder.

---

## Linear Workflow Tool

**Location:** `project-management/tools/linear.py`

### Common Commands

**IMPORTANT:** Always use absolute paths with `$REPO_ROOT` to ensure commands work from any directory and in sandboxed environments.

```bash
# List issues by state
python "$REPO_ROOT/project-management/tools/linear.py" issue list --team CON --state "Todo"

# List completed issues (Done state is hidden by default)
python "$REPO_ROOT/project-management/tools/linear.py" issue list --include-completed --state "Done"

# Create an issue
python "$REPO_ROOT/project-management/tools/linear.py" issue create "Issue title" \
  --team CON \
  --project "foundry-core" \
  --description "Markdown description" \
  --state "Todo"

# Update issue state
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-123 --state "In Review"

# Get issue details
python "$REPO_ROOT/project-management/tools/linear.py" issue get CON-123

# Add comments
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-123 "Comment text"

# Create dependency
python "$REPO_ROOT/project-management/tools/linear.py" issue relate CON-123 --blocked-by CON-100

# Document commands
python "$REPO_ROOT/project-management/tools/linear.py" document create "Title" --content-file path.md --project foundry-core
python "$REPO_ROOT/project-management/tools/linear.py" document update <doc-id> --content-file path.md
python "$REPO_ROOT/project-management/tools/linear.py" document get <doc-id>
python "$REPO_ROOT/project-management/tools/linear.py" document list --project foundry-core
```

### Teams

- **CON** (content-foundry) - Primary team

### Workflow States

| State | Agent Action |
|-------|--------------|
| Backlog | BLOCKED - Move to Todo first |
| Todo | Pick up for context pack |
| Context Pack In Progress | Writing context pack |
| Context Pack In Review | Review context pack (or improve if has label) |
| Ready for Spec | Pick up for spec work |
| Spec In Progress | Writing spec |
| Spec Drafted | Harden test coverage |
| Spec - Hardening Tests | Adding comprehensive tests to spec |
| Spec In Review | Review spec |
| Ready to Start | Begin implementation |
| Work Started | Implementation in progress |
| In Review | Review PR |
| Review Passed | Ready for testing |
| Testing | test-1/test-2 agent runs tests |
| Ready to Merge | Merge PR → Done |

### Issue Labels

**Agent Coordination:**
- `agent_working` - Agent actively working
- `agent_ready` - Ready for human review
- `human_input` - Blocked, needs human

**Context Pack:**
- `has_context_pack` - Context Pack exists
- `needs_improve_context_pack` - Context Pack failed review, needs improvement

**PR Review:**
- `code-review-failed` - PR review found code quality / task compliance issues
- `spec-review-fail` - Spec compliance review found code/test vs spec mismatches

**Testing:**
- `testing-phase-failed` - Testing found issues; human decides pass or fix

**Change Type:** `breaking-change`, `change`, `feature`, `bug`, `refactor`

**Technical:** `data`, `docs`, `infra`, `performance`, `security`, `test`, `ux`

**Process:** `foundation`, `migration`, `spike`, `tech-debt`

---

## Creating Issues from Specs

1. Parse the document for issue titles/descriptions
2. Check existing issues to avoid duplicates
3. Assign to correct agentic folder project
4. Create Linear "blocked by" relationships
5. Add dependency comment for clarity
6. Update source markdown with Linear links:
   ```
   ADDED: [CON-XXX](https://linear.app/content-foundry/issue/CON-XXX) - Title
   ```

---

## Sprint Import Command

**Slash command:** `/pm:build_sprint <path-to-build-plan.md>`

**Use this command to import implementation blocks from build plan files.**

The `sprint import` command enforces the critical rule that every issue must map to an Agentic Folder project.

### Required Format

Each implementation block in the markdown file MUST have a `**Project:**` field:

```markdown
## IB001 — Task title here
**Depends on:** (none)
**Project:** foundry-errors

### Goal
Description here...

### Acceptance criteria
- Criterion 1
- Criterion 2

---
```

### Commands

```bash
# Validate a build plan file (check for missing/invalid projects)
python "$REPO_ROOT/project-management/tools/linear.py" sprint validate <file.md>

# Import with dry-run (see what would be created)
python "$REPO_ROOT/project-management/tools/linear.py" sprint import <file.md> --dry-run

# Import and create issues
python "$REPO_ROOT/project-management/tools/linear.py" sprint import <file.md>

# Import and update source file with Linear links
python "$REPO_ROOT/project-management/tools/linear.py" sprint import <file.md> --update-file
```

### What It Does

1. **Validates** every block has a `**Project:**` field
2. **Validates** all projects are in the Agentic Folders map
3. **Validates** all dependencies reference existing blocks
4. **Creates** projects in Linear if they don't exist
5. **Creates** issues in the correct project
6. **Creates** blocked-by relationships from `**Depends on:**`
7. **Optionally** updates the source markdown with Linear links

### Valid Projects

Must be one of the Agentic Folder project names:
- `agents-platform`, `project-management`
- `foundry-core`, `foundry-errors`, `foundry-io`, `foundry-pipeline`, `foundry-providers`
- `forge-serp`, `forge-web`, `forge-intent-atlas`, `forge-html`
- `intent-atlas-engine`, `intent-atlas-ux`, `intent-atlas-weavers`, `intent-atlas-workers`

---

## Gemini Agent Workflow

Gemini cannot access Linear directly.

### `gemini checkout CON-XXX & do`

1. Look up Linear issue
2. Create task file at `project-management/gemini-tasks/CON-XXX-<name>.md`
3. Update Linear: status → "Dev Started", add `agent_working`
4. Tell human the path

### `gemini check CON-XXX`

1. Check for output at `project-management/gemini-tasks/output/CON-XXX-*.md`
2. If exists: Read output, move task to `done/`, update Linear
3. If missing: Tell human Gemini hasn't completed yet
