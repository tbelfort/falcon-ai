---
description: Merge a PR into main, delete the branch, and sync all agents
argument-hint: "[PR-URL-or-number] (optional - uses current branch if omitted)"
---

# PM: Merge PR

You are the Project Manager agent. Your task is to merge a pull request into main.

**PR to merge:** $ARGUMENTS

---

## CRITICAL: Only PM Can Merge

**The PM agent is the ONLY agent authorized to merge PRs.** All other agents must wait for the PM to merge their work.

---

## Step 1: Determine Which PR to Merge

### If argument provided:
The argument can be:
- A full PR URL: `https://github.com/<CONFIG>GitHub repository</CONFIG>/pull/123`
- A short PR number: `123` or `#123`

Extract the PR number for use with `gh` commands.

### If NO argument provided (merge current branch):

1. **Check current branch:**
   ```bash
   git branch --show-current
   ```

2. **If on `main`, STOP:**
   ```
   **Error:** You are on the main branch. Nothing to merge.

   Either:
   - Provide a PR number: `/pm:merge 123`
   - Switch to a feature branch first
   ```

3. **If on a feature branch, check for existing PR:**
   ```bash
   gh pr list --head $(git branch --show-current) --json number,title,state --jq '.[0]'
   ```

4. **If PR exists:** Use that PR number and continue to Step 2.

5. **If NO PR exists, create one:**
   ```bash
   # First, ensure branch is pushed
   git push -u origin $(git branch --show-current)

   # Create PR with auto-generated title from branch name
   gh pr create --fill --base main
   ```

   This will output the PR URL. Extract the number and continue to Step 2.

---

## Step 2: Get PR Details

```bash
gh pr view <pr-number> --json number,title,headRefName,baseRefName,mergeable,mergeStateStatus
```

Check the response:
- `mergeable`: Should be `MERGEABLE`
- `mergeStateStatus`: Should be `CLEAN` or `UNSTABLE` (tests passing or allowed to merge)

---

## Step 3: Check for Conflicts

If the PR is NOT mergeable or has conflicts:

1. **Describe the conflicts to the human:**
   ```bash
   gh pr view <pr-number> --json mergeable,mergeStateStatus,commits
   ```

2. **Report to human and STOP:**
   ```
   **Merge blocked for PR #<number>**

   **Status:** <mergeable status>
   **Merge state:** <mergeStateStatus>

   **Conflict details:**
   <describe what files/branches are in conflict>

   **Waiting for guidance.** Options:
   1. Resolve conflicts manually and tell me to try again
   2. Close the PR and recreate from a fresh branch
   3. Force merge (not recommended)
   ```

3. **DO NOT proceed.** Wait for human instruction.

---

## Step 4: Merge the PR (No Conflicts)

If the PR is clean and mergeable:

```bash
gh pr merge <pr-number> --merge --delete-branch
```

This will:
- Merge the PR into the base branch (usually main)
- Delete the source branch

---

## Step 5: Checkout Main (if on feature branch)

If you were on a feature branch (no argument provided), checkout main:

```bash
git checkout main && git pull
```

This ensures you're back on main after the merge.

---

## Step 6: Sync All Agent Worktrees

After successful merge, sync all agents:

```bash
<CONFIG>Sync script path</CONFIG>
```

**Check the output carefully.** Look for any `✗ failed` entries.

---

## Step 7: Report Result

**CRITICAL:** The sync script output has TWO sections you MUST check:
1. The per-agent sync status (✓ synced/pulled or ✗ failed)
2. The "FEATURE BRANCHES BEHIND MAIN" section at the bottom

**You MUST report BOTH sections.** Never say "All agents are now up to date" if there are feature branches behind main.

### If ALL agents synced AND no feature branches behind:

```
**Merged PR #<number>**

**Title:** <PR title>
**Branch:** <headRefName> -> <baseRefName>

**Actions completed:**
1. PR merged into main
2. Branch `<headRefName>` deleted
3. All agent worktrees synced with main

The merge is complete. All agents are now up to date.
```

### If agents are on feature branches behind main (ALWAYS REPORT THIS):

```
**Merged PR #<number>**

**Title:** <PR title>
**Branch:** <headRefName> -> <baseRefName>

**Actions completed:**
1. PR merged into main
2. Branch `<headRefName>` deleted
3. All agent worktrees synced with main

**Agents on feature branches behind main:**

| Agent | Branch | Behind |
|-------|--------|--------|
| <agent> | <branch-name> | <N> commits |
| ... | ... | ... |

These agents have their local `main` updated, but their feature branches need to merge main to get latest changes.
```

### If ANY agent failed to sync:

```
**Merged PR #<number>** — ⚠️ SYNC FAILED

**Title:** <PR title>
**Branch:** <headRefName> -> <baseRefName>

**PR merged successfully, but agent sync had failures:**

**Failed agents:**
- <agent-1>: <error if known>
- <agent-2>: <error if known>

**Succeeded:** <count> agents
**Failed:** <count> agents

**Action required:** Investigate and fix the failed agents before they can receive updates.

Common fix: `cd <CONFIG>Agent base directory</CONFIG>/<agent> && rm -f .claude.json && git pull`
```

**IMPORTANT:** If even ONE agent fails to sync, report it as a sync failure. Do not say "All agents are now up to date" unless every single agent succeeded.

---

## Error Handling

### PR not found
```
**Error:** PR #<number> not found.

Please verify:
- The PR number is correct
- The PR exists in the <CONFIG>GitHub repository</CONFIG> repository
```

### Merge fails
```
**Error:** Merge failed.

<error message from gh>

**Waiting for guidance.**
```

### Sync script fails to run
If the sync script itself fails to execute:
```
**Warning:** PR merged successfully but sync script failed to run.

<error message>

Run manually: <CONFIG>Sync script path</CONFIG>
```

---

## DO NOT

- Merge PRs without checking for conflicts first
- Force merge without explicit human approval
- Skip the sync-all-main step
- Merge to any branch other than what the PR targets (usually main)
- Say "All agents are now up to date" when there are feature branches behind main
- Skip reporting the "FEATURE BRANCHES BEHIND MAIN" section from sync output
