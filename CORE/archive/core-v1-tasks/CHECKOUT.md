# Task: Checkout Linear Issue

Instructions for checking out a Linear issue. Read when you receive `checkout CON-XXX`.

---

## Step 0: Parse Arguments

The checkout command can include optional overrides:
- `CON-XXX` — Issue ID only (default routing)
- `CON-XXX --fix` — Force fix mode for "In Review" issues
- `CON-XXX --review` — Force review mode for "In Review" issues (re-review even if review-failed label exists)

Extract the issue ID and any override flag from the command.

---

## Step 1: Get Issue Details

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue get CON-XXX --json
```

Parse the response to extract:
- **state** (workflow state)
- **project** (Linear project name)
- **labels** (array of label names)

---

## Step 1.5: Claim Issue (Add Agent Name to Title)

**Only the first agent to work on an issue claims it.** If another agent's name is already in the title, do NOT change it.

If the issue title doesn't already have an agent name pattern `(<name>)`, prepend yours:

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --title "($AGENT_NAME) <original title>"
```

**Example:** Title `Implement feature X` becomes `(opus-1) Implement feature X`

**Skip this step if:**
- Title already starts with ANY `(<name>)` pattern (e.g., `(opus-1)`, `(sonnet-2)`, etc.) — even if it's a different agent
- `$AGENT_NAME` is not set or empty

**Note:** The agent name in the title indicates who first claimed the issue, not necessarily who is currently working on it. Multiple agents may work on an issue across different workflow states.

---

## Step 2: Checkout Feature Branch

**Always work on a feature branch from the start.** This ensures isolation for all phases (context pack, spec, implementation).

### Get the Branch Name

The Linear issue has a `Branch:` field with the suggested branch name:

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue get CON-XXX
```

Look for the `Branch:` line in the output.

### Checkout or Create the Branch

```bash
# Ensure main is up to date first
git fetch origin

# Check if branch exists on remote
git ls-remote --heads origin <branch-name-from-linear>
```

**If branch exists on remote:**
```bash
git checkout <branch-name-from-linear>
git reset --hard origin/<branch-name-from-linear>
```

**If branch does NOT exist:**
```bash
git checkout main
git pull origin main
git checkout -b <branch-name-from-linear>
```

### Verify You're on the Correct Branch

```bash
git branch --show-current
# Should output: <branch-name-from-linear>
```

**IMPORTANT:** All subsequent work (context pack, spec, implementation) happens on this branch. Do NOT stay on main.

---

## Step 3: Validate Project

Look up the project name in the Project Map (from CLAUDE.md).

**If project is not in the map, FAIL:**
```
Unknown project: `<project-name>`. Add it to the project map.
```

---

## Step 4: Load Hierarchical Context

Navigate to the project folder, reading CLAUDE.md at each level of the path.

Example for `foundry-core` (`packages/foundry/foundry-core/`):
1. Root `CLAUDE.md` (already read)
2. Check `packages/CLAUDE.md` (if exists)
3. Check `packages/foundry/CLAUDE.md` (if exists)
4. Check `packages/foundry/foundry-core/CLAUDE.md` (if exists)

---

## Step 5: Route Based on State

| State | Action |
|-------|--------|
| Backlog | **FAIL** — "Issue is in Backlog. Move to Todo first." |
| Todo | Read `.claude/CORE/TASKS/CONTEXT_PACK.md` |
| Context Pack in Progress | **FAIL** — "Another agent is working on the context pack." |
| Context Pack Drafted | Read `.claude/CORE/TASKS/SPEC.md` |
| Spec In Progress | **FAIL** — "Another agent is working on the spec." |
| Spec Drafted | Read `.claude/CORE/TASKS/SPEC_HARDENING_TESTS.md` |
| Spec - Hardening Tests | **FAIL** — "Another agent is hardening the spec tests." |
| Spec In Review | Read `.claude/CORE/TASKS/SPEC_REVIEW.md` |
| Ready to Start | Read `.claude/CORE/TASKS/IMPLEMENT.md` |
| Work Started | Read `.claude/CORE/TASKS/IMPLEMENT.md` |
| In Review | Check labels and override (see below) |
| Review Passed | Read `.claude/CORE/TASKS/TESTING.md` |
| Testing | **FAIL** — "Another agent is running tests." |
| Ready to Merge | Read `.claude/CORE/TASKS/MERGE.md` |

> **Note:** All issues in Todo get Context Pack work first. If `needs_improve_context_pack` label exists on a "Context Pack Drafted" issue, read `.claude/CORE/TASKS/CONTEXT_PACK_IMPROVE.md` instead of SPEC.md.

### In Review State — Label Check and Override

When issue is in **In Review**, determine fix vs review mode:

1. **If `--fix` override provided:** Read `.claude/CORE/TASKS/FIX_REVIEW.md`
2. **If `--review` override provided:** Read `.claude/CORE/TASKS/PR_REVIEW.md`
3. **If `code-review-failed` label exists:** Read `.claude/CORE/TASKS/FIX_REVIEW.md`
4. **If `spec-review-fail` label exists:** Read `.claude/CORE/TASKS/FIX_REVIEW.md` (spec compliance issues)
5. **Otherwise (no label, no override):** Read `.claude/CORE/TASKS/PR_REVIEW.md`

**Use cases for override:**
- `--fix`: Force fix mode even if label was accidentally removed
- `--review`: Re-review after fixes to confirm issues are resolved and check for new issues

**Review labels (for tracking):**
- `code-review-failed` — PR review found code quality / task compliance issues
- `spec-review-fail` — Spec compliance review found code/test vs spec mismatches

---

## Step 6: Execute the Task

Follow the instructions in the task file you were routed to.

---

## Step 7: When Task Complete

**Return to main when done:**
```bash
git checkout main
```

**Note:** You were working on a feature branch. Returning to main prepares your worktree for the next task.
