# Task: Fix PR Review Issues

Instructions for fixing issues found during PR review. Read after `checkout CON-XXX & do` when issue is in **In Review** state.

---

## Overview

A reviewer found issues with the PR. Fix them based on GitHub comments.

**Two types of review failures (check labels):**
- `code-review-failed` — Code quality, task compliance, or general issues
- `spec-review-fail` — Code/tests don't match the spec (spec is source of truth)

## Before Starting

1. **Find the PR link** — Look in Linear issue comments
2. **Checkout the PR branch**
   ```bash
   git fetch origin && git checkout <pr-branch-name>
   ```
3. **Swap labels** — Remove `agent_ready`, add `agent_working`
4. **Read GitHub PR comments** — Get ALL review feedback from GitHub
   ```bash
   gh pr view <pr-number> --comments
   ```

## Getting Review Feedback

**IMPORTANT:** All review details are on GitHub, NOT Linear.

Use the GitHub CLI to read review comments:
```bash
gh pr view <pr-number> --comments
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments
```

Look for comments from the reviewer agent (prefixed with `**[Model Name] Agent ...`).

## Fixing Issues

1. **Read each issue carefully**
2. **Fix one issue at a time**
3. **Follow existing code patterns**

## Verify Your Fixes

**Run tests and checks before pushing.** Same as implementation:

```bash
# Run all tests
uv run pytest packages/ apps/ -v

# Run linting
uv run ruff check .

# Run type checking
uv run mypy packages/
```

**If tests fail:** Fix them before proceeding. Don't push broken code.

---

## Commenting on GitHub (REQUIRED)

After fixing, comment on the GitHub PR with details:

```
**[Model Name] Agent ${AGENT_NAME}**

Review issues addressed.

**Fixes applied:**
1. [What you fixed for issue 1]
2. [What you fixed for issue 2]
...

**Testing:**
- All tests pass
- [Any other verification done]

Ready for re-review.
```

## Commenting on Linear (REQUIRED)

After pushing fixes, comment on Linear (summary only):

```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] ${AGENT_NAME}: Review issues fixed.

**Fix details:** See GitHub PR comments for specifics.

**Next steps:** Run \`/checkout CON-XXX --review\` to re-review (or \`/checkout:spec-review CON-XXX\` for spec issues)."
```

**IMPORTANT:** Never duplicate fix details in Linear. GitHub is the source of truth.

## Pushing Fixes

```bash
git add -A
git commit -m "fix: address PR review feedback

- [Brief summary of fixes]

Co-Authored-By: [Model] <noreply@anthropic.com>"
git push
```

## Status Updates

1. **Keep status as "In Review"** — Don't change it
2. **Remove the review failure label** — Signals fixes are done, ready for re-review
   ```bash
   # Remove whichever label exists:
   python project-management/tools/linear.py issue update CON-XXX --remove-label code-review-failed
   python project-management/tools/linear.py issue update CON-XXX --remove-label spec-review-fail
   ```
3. **Swap labels:** Remove `agent_working`, add `agent_ready`
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```
4. Task is now ready for re-review

**Re-review commands:**
- After fixing `code-review-failed`: Run `/checkout CON-XXX --review`
- After fixing `spec-review-fail`: Run `/checkout:spec-review CON-XXX`

## Report to Human

```
Review issues fixed for CON-XXX

**PR:** <GitHub PR URL>
**Fixes applied:** <count>
**Status:** In Review — ready for re-review

**Next steps:** Run `/checkout CON-XXX --review` to re-review (or `/checkout:spec-review CON-XXX` for spec issues).
```

