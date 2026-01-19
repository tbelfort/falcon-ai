# Task: Merge a Pull Request

Instructions for merging PRs linked to Linear issues. **PM Agent only** — read after receiving `merge CON-XXX` command.

---

## Overview

This task is exclusive to the PM agent. When the human requests a merge, complete the merge workflow including documentation review.

**CRITICAL: Stay in your lane.**

- **Do NOT investigate, debug, or analyze CI failures** — that's for other agents
- **Do NOT redo code reviews** — if the human says merge, trust that review is done
- **Do NOT take liberties** — do exactly what is instructed, nothing more
- **Your job is merge + doc review** — stick to that scope

If the human says to merge, assume the PR has passed all necessary reviews. Any CI or review issues are handled separately.

---

## Step 1: Verify Ready to Merge

```bash
# Get issue details
python project-management/tools/linear.py issue get CON-XXX --json
```

Verify:
- Issue is in **Ready to Merge** state
- PR has been reviewed and approved

If not in Ready to Merge:
```
❌ Cannot merge CON-XXX — issue is not in Ready to Merge state.

Current state: <state>

Please ensure the PR has been reviewed and approved first.
```

---

## Step 2: Find the PR

Look in Linear issue comments for the GitHub PR URL.

```bash
gh pr view <pr-number>
```

---

## Step 3: Doc Review (Inline)

**Before merging, check if documentation needs updating or adding.**

> **CRITICAL: What counts as documentation**
>
> **Documentation = `docs/` folder. NOTHING ELSE.**
>
> These are NOT documentation — do NOT consider them when reviewing:
> - **Specs (`specs/`)** — Pre-development artifacts. Dead after implementation. NOT DOCS.
> - **Code** — Implementation, not documentation. NOT DOCS.
> - **Code comments** — Implementation notes. NOT DOCS.
> - **Docstrings** — IDE tooltips. NOT DOCS.
> - **PR descriptions** — Ephemeral. NOT DOCS.
> - **README files outside `docs/`** — Package metadata. NOT DOCS.
> - **CLAUDE.md files** — Agent instructions. NOT DOCS (but may need updating for project map changes).
>
> **The question is ONLY:** Does `docs/` need to be updated or added to?

### 3a. Get PR diff and analyze impact

```bash
gh pr diff <pr-number>
```

### 3b. Check for architecture doc updates

Ask these questions about the changes:

| Question | If YES, action needed |
|----------|----------------------|
| Do changes add/remove/rename packages or apps? | Update `CLAUDE.md` project map, `SYSTEM-MAP.md` |
| Do changes modify layer boundaries (what can import what)? | Update `LAYERS.md` |
| Do changes add new artifact types or schemas? | Update `ARCHITECTURE.md`, possibly `ARTIFACTS.md` |
| Do changes affect the extension model or plugin system? | Update `ARCHITECTURE-simple.md` |
| Do changes move files to different locations? | Update `SYSTEM-MAP.md` |

### 3c. Check for new documentation needs

Ask these questions about what documentation should be **added**:

| Question | If YES, action needed |
|----------|----------------------|
| Do changes add new API endpoints or services? | Add to `docs/api/<service>/` |
| Do changes add new environment variables or config? | Add to `docs/config/` |
| Do changes add integrations with external services? | Add to `docs/integrations/` |
| Do changes introduce common failure modes or gotchas? | Add to `docs/troubleshooting/` |
| Do changes add new CLI tools or scripts? | Add to `docs/ops/` (runbook or usage guide) |
| Do changes add new database tables or schemas? | Add to `docs/dbs/` |
| Do changes add new workflows or processes? | Add to `docs/ops/` or relevant README |
| Are there non-obvious behaviors that future developers will need to understand? | Add to `docs/design_docs/` or `docs/architecture/` |

**If ALL answers are NO in both 3b and 3c:** Proceed directly to Step 4 (merge).

### 3d. If documentation updates or additions are needed

**Load the DOC-MANAGER role** by reading `CORE/ROLES/DOC-MANAGER.md` before making doc changes.

1. Checkout the PR branch:
   ```bash
   gh pr checkout <pr-number>
   ```

2. Edit the relevant docs using the Edit tool

3. **Update the folder's index** (README.md or INDEX.md) for any folder where you added or modified docs

4. Commit and push:
   ```bash
   git add -A && git commit -m "docs: update documentation for <brief description>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" && git push
   ```

5. Return to main:
   ```bash
   git checkout main
   ```

6. Proceed to Step 4

---

## Step 4: Extract Future Tasks

**Check context packs and specs for "future tasks" mentions.**

This captures deferred work items that were identified during development but not implemented.

### 4a. Find the context pack and spec

Look in the Linear issue comments for:
- `**Context Pack:**` link/path
- `**Spec:**` path

If the issue has `has_context_pack` or `has_spec` labels, these files should exist in the PR's package folder.

### 4b. Search for future task mentions

Look for sections or phrases like:
- "Future work"
- "Future tasks"
- "Out of scope"
- "Deferred"
- "TODO (future)"
- "Phase 2" / "Phase 3"
- "Later iteration"

```bash
# Example: search in the package's specs/ folder
grep -ri "future\|deferred\|out of scope\|phase 2\|later" packages/<package>/specs/
```

### 4c. If future tasks found, add to index

1. If not already on PR branch, checkout:
   ```bash
   gh pr checkout <pr-number>
   ```

2. Edit `docs/future-tasks/INDEX.md` and add entries under "## Pending Tasks":

   ```markdown
   ### CON-XXX - Brief description of future task

   **Source:** `packages/<package>/specs/<spec-file>.md`
   **Extracted:** YYYY-MM-DD
   **Status:** Pending

   <paste the relevant future task description>
   ```

3. Commit and push:
   ```bash
   git add docs/future-tasks/INDEX.md
   git commit -m "docs: extract future tasks from CON-XXX

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   git push
   ```

4. Return to main:
   ```bash
   git checkout main
   ```

### 4d. If no future tasks found

Proceed directly to Step 5 (merge).

---

## Step 5: Merge the PR

```bash
gh pr merge <pr-number> --merge --delete-branch
```

If merge fails, report to human with the error.

---

## Step 6: Sync All Agent Worktrees

Run the sync script to update all agent worktrees:

```bash
"$REPO_ROOT/../sync-all-main"
```

This safely updates main for all agents:
- Agents on main: pulls latest
- Agents on feature branches: updates their main ref without disrupting work

**Note:** The sync script should be in the parent directory of the repo root.

---

## Step 7: Update Linear

```bash
# Comment
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR merged and deployed.

All agent worktrees synced with main."

# Move to Done
python project-management/tools/linear.py issue update CON-XXX --state "Done"

# Remove labels
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
```

---

## Step 8: Report to Human

```
✅ Merged CON-XXX

**PR:** <GitHub PR URL>
**Status:** Done
**Doc Review:** <summary of doc updates/additions or "No changes needed">
**Future Tasks:** <count extracted or "None found">

All agent worktrees have been synced with main.
```

