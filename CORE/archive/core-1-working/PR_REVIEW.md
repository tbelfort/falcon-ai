# Task: Review a Pull Request

Instructions for reviewing PRs. Read after checking out a task in **In Review** state.

---

## Overview

Review the PR for correctness, spec compliance, code quality, and architectural fit.

**CRITICAL: Review only — do NOT fix issues.**

Your job is to **review and report**, not to fix. If you find issues:
- Document them on GitHub
- Report to human
- Let a different agent (or the same agent with `--fix`) handle fixes

Only fix issues if explicitly asked with `/checkout CON-XXX --fix`.

## Step 1: Setup

1. **Check Linear issue comments** — Read what the implementing agent wrote
2. **Find the PR link** — Look in issue comments for the GitHub PR URL
   - If PR link is missing, report to the human — don't proceed
3. **CHECK CI STATUS (BLOCKER)** — Do this BEFORE any other work
   ```bash
   gh pr view <pr-number> --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
   ```
   - If **ALL checks show `SUCCESS`** → Continue to step 4
   - If **ANY check shows `FAILURE`** → **STOP. Do not proceed with review.**
     ```
     CI is failing on PR #<number>. Cannot review until CI passes.

     **Failed checks:**
     - <check-name>: FAILURE

     **Next steps:** Fix CI failures first, then request re-review.
     ```
     Report this to human and end the review.
4. **Checkout the PR branch** — You need to be on the branch to review
   ```bash
   git fetch origin && git checkout <pr-branch-name>
   ```
5. **Swap labels** — Remove `agent_ready`, add `agent_working`
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_working
   ```
6. **Comment that you're starting review**
   ```bash
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting PR review."
   ```

## Step 2: Determine Review Type

Check GitHub PR comments to see if this is **first-time review** or **re-review**:

```bash
gh pr view <pr-number> --comments
```

### First-Time Review

No previous review comments from agents — proceed with full review:

1. **Check for spec** — Look for `has_spec` label on the issue
2. **If spec exists:**
   - Find the `**Spec:**` line in Linear comments with the full path
   - Read the spec file thoroughly
   - Read `ai_docs/` folder — contains API references and context created for this task
3. **Read the architecture quick reference** — `docs/architecture/ARCHITECTURE-simple.md`
   - Use `docs/architecture/INDEX.md` to route to any other relevant subdocs
   - If the PR touches dependency boundaries: also read `docs/architecture/LAYERS.md`
   - If the PR touches artifact IO / receipts / manifests: also read `docs/architecture/ARTIFACTS.md`
4. **Do a deep code review** of the PR branch:
   - Check all changed files
   - Verify implementation fits the codebase architecture
   - Use the review checklist below

### Re-Review

Previous review comments exist + new commits since:

1. **Read previous review comments** — Know what issues were raised
2. **Check commits since last review:**
   ```bash
   gh pr view <pr-number> --json commits
   ```
3. **Verify each issue is fixed** — Go through raised issues one by one
4. **Check for NEW issues** — Fixes may have introduced new problems
5. **Focus on changed code** — Don't re-review unchanged code

## Step 3: Review Checklist

### Spec Compliance Triangle (if spec exists)

**Code, tests, and spec must ALL agree.** If any two match but the third differs, the PR fails review.

- [ ] **Code matches spec** — Implementation behavior matches spec requirements
- [ ] **Tests match spec** — Tests verify the spec's expected behavior (not just what the code does)
- [ ] **Tests match code** — Tests actually exercise the implemented code paths
- [ ] All MUST requirements from the spec are met
- [ ] No extra features beyond spec

**Pay special attention to:**
- Exit codes and error handling (verify against spec tables)
- Edge cases and failure modes (spec often defines these explicitly)
- Boundary conditions (what happens at limits)

> **Warning:** Tests passing is necessary but NOT sufficient. Tests might encode the wrong behavior if they weren't written against the spec.

### Task Compliance (if no spec)
- [ ] Implementation matches the Linear issue requirements
- [ ] Changes are minimal and scoped to the task

### Code Quality
- [ ] Code is readable and follows existing patterns
- [ ] No obvious bugs or edge cases missed
- [ ] Error handling is appropriate

### Non-Negotiables
- [ ] Forge packs don't import app code
- [ ] Forge stages only read/write declared artifacts
- [ ] Side effects write receipt artifacts
- [ ] Multi-file outputs use manifest artifacts

### Codebase Size (PR Reviewers Only)

Check line count for the affected codebase:

```bash
DIR="packages/foundry/foundry_core"  # adjust path
git ls-files "$DIR" | rg -e '\.(py|ts|tsx|js|jsx)$' | xargs wc -l | awk '$2!="total"{sum+=$1} END{print sum}'
```

- **> 10,000 lines:** Warn human ("over soft cap; refactor/split plan required")
- **≥ 20,000 lines:** Block PR ("hard cap exceeded; must refactor before merge")

## Step 4: Document Your Review

**CRITICAL: GitHub is the source of truth for PR review feedback.**

All detailed review comments go on GitHub, not Linear. Linear gets only brief status updates.

**MANDATORY: Start every GitHub comment with your identity:**
```
**[Model Name] Agent $AGENT_NAME**

<your comment here>
```
Example: `**[Claude Opus 4.5] Agent opus-1**`

- Be specific about issues found
- Suggest fixes when possible
- Reference line numbers and file paths

## Step 5a: If Issues Found

1. **Comment on GitHub PR with ALL details** — List every issue, suggest fixes
2. **Comment on Linear with summary ONLY** — Brief note with PR link

**GitHub comment** (with full details):
```
**[Model Name] Agent $AGENT_NAME**

PR review complete — changes requested.

**Issues found:**
1. [Detailed issue description with file:line references]
2. [Detailed issue description with file:line references]
...

**Suggested fixes:**
- [Specific fix suggestions]
```

**Linear comment** (summary only — NO issue details):
```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review complete — changes requested.

**PR:** <GitHub PR URL>

See PR comments for specific issues and suggested fixes.

**Next steps:** Run \`/checkout CON-XXX --fix\` to fix the issues."
```

**IMPORTANT:** Never duplicate issue details in Linear. GitHub is the source of truth for review feedback.

3. **Add code-review-failed label and swap working → ready:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --add-label code-review-failed
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```

4. **Report to human:**
   ```
   PR review complete for CON-XXX — changes requested.

   **PR:** <GitHub PR URL>
   **Label:** code-review-failed added

   **Next steps:** Run `/checkout CON-XXX --fix` to fix the issues.
   ```

---

## Step 5b: If Approved

1. **Comment on GitHub PR:**
   ```
   **[Model Name] Agent $AGENT_NAME**

   PR review complete — approved.

   No issues found. Ready for human to move to Review Passed.
   ```

2. **Update Linear (brief — details are on GitHub):**
   ```bash
   # Comment (short)
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review passed.

   **PR:** <GitHub PR URL>

   Ready for human to move to Review Passed."

   # CRITICAL: Swap labels (you started with agent_working, end with agent_ready)
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```

   **DO NOT move the issue to Review Passed.** The human will do this after verifying the review.

3. **Report to human:**
   ```
   PR review complete for CON-XXX — approved.

   **PR:** <GitHub PR URL>
   **Status:** Awaiting human to move to Review Passed

   **Action required:** Move CON-XXX to "Review Passed" to proceed with testing.
   ```

