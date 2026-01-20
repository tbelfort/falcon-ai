# Task: Checkout Linear Issue

Instructions for checking out a Linear issue. Read when you receive `checkout CON-XXX`.

**CRITICAL: One task per checkout.** After completing ANY task file, return to main and STOP. Do not re-route or continue to the next phase. The human will run `/checkout` again for the next phase.

---

## Step 0: Parse Arguments

The checkout command can include optional overrides:
- `CON-XXX` — Issue ID only (default routing)
- `CON-XXX --fix` — Force fix mode for "In Review" issues
- `CON-XXX --review` — Force review mode for "In Review" issues (re-review even if review-failed label exists)
- `CON-XXX --agents <N>` — Use N sub-agents for implementation (2-4, only for "Ready to Start"/"Work Started")

Extract the issue ID and any flags from the command.

**Store for later:**
- `ISSUE_ID` — The CON-XXX identifier
- `OVERRIDE_FLAG` — `--fix`, `--review`, or none
- `SUB_AGENT_COUNT` — Number from `--agents N`, or 0 if not specified

---

## Step 1: Get Issue Details

```bash
# Use /linear-tool skill for Linear operations
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
# Use /linear-tool skill for Linear operations
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
# Use /linear-tool skill for Linear operations
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

Example for a package (<CONFIG>Example package path</CONFIG>):
1. Root `CLAUDE.md` (already read)
2. Check each intermediate `CLAUDE.md` along the path (if exists)
3. Check the target package's `CLAUDE.md` (if exists)

---

## Step 5: Route Based on State

| State | Action |
|-------|--------|
| Backlog | **FAIL** — "Issue is in Backlog. Move to Todo first." |
| Todo | Read `CORE/TASKS/WORKFLOW/CONTEXT_PACK.md` |
| Context Pack In Progress | **FAIL** — "Another agent is working on the context pack." |
| Context Pack In Review | Check labels (see below) |
| Ready for Spec | Read `CORE/TASKS/WORKFLOW/SPEC.md` |
| Spec In Progress | **FAIL** — "Another agent is working on the spec." |
| Spec Drafted | Read `CORE/TASKS/WORKFLOW/SPEC_HARDENING_TESTS.md` |
| Spec - Hardening Tests | **FAIL** — "Another agent is hardening the spec tests." |
| Spec In Review | Read `CORE/TASKS/WORKFLOW/SPEC_REVIEW.md` |
| Ready to Start | Read `CORE/TASKS/WORKFLOW/IMPLEMENT.md` (pass `SUB_AGENT_COUNT` if > 0) |
| Work Started | Read `CORE/TASKS/WORKFLOW/IMPLEMENT.md` (pass `SUB_AGENT_COUNT` if > 0) |
| In Review | Check labels and override (see below) |
| Review Passed | Read `CORE/TASKS/WORKFLOW/TESTING.md` |
| Testing | **FAIL** — "Another agent is running tests." |
| Ready to Merge | Read `CORE/TASKS/WORKFLOW/MERGE.md` |

### Context Pack In Review — Label Check

When issue is in **Context Pack In Review**, check for the improvement label:

1. **If `needs_improve_context_pack` label exists:** Read `CORE/TASKS/WORKFLOW/CONTEXT_PACK_IMPROVE.md`
2. **Otherwise (no label):** Read `CORE/TASKS/WORKFLOW/CONTEXT_PACK_REVIEW.md`

**Flow:**
- Review finds gaps → adds `needs_improve_context_pack` label, stays in same state
- Next checkout sees label → routes to IMPROVE task
- After improvement → goes directly to "Ready for Spec" (no re-review)

### In Review State — Label Check and Override

When issue is in **In Review**, determine fix vs review mode:

1. **If `--fix` override provided:** Read `CORE/TASKS/WORKFLOW/FIX_REVIEW.md`
2. **If `--review` override provided:** Read `CORE/TASKS/WORKFLOW/PR_REVIEW.md`
3. **If `code-review-failed` label exists:** Read `CORE/TASKS/WORKFLOW/FIX_REVIEW.md`
4. **If `spec-review-fail` label exists:** Read `CORE/TASKS/WORKFLOW/FIX_REVIEW.md` (spec compliance issues)
5. **Otherwise (no label, no override):** Read `CORE/TASKS/WORKFLOW/PR_REVIEW.md`

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
