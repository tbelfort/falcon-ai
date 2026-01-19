# Task: Implement

Instructions for implementation work. Read after checking out a task in **Ready to Start** or **Work Started** state.

---

## IMPORTANT: Execute All Steps

**This task authorizes commits, pushes, and PR creation.** Execute Steps 1-8 completely without stopping to ask for permission. The `checkout` command pre-authorizes the full implementation workflow.

If you encounter a blocker (tests fail, access denied, unclear requirements), add `human_input` label to the Linear issue and report the blocker—do NOT leave the issue in "Work Started" with "agent_working" indefinitely.

---

## Step 1: Verify Branch

You should already be on the feature branch (checked out in CHECKOUT.md Step 2).

```bash
git branch --show-current
```

**Expected:** The branch name from Linear (e.g., `tom/con-xxx-...`)

**If you're on `main`:** Something went wrong in checkout. Run:
```bash
python project-management/tools/linear.py issue get CON-XXX
# Look for the Branch: field, then:
git checkout <branch-name-from-linear>
```

---

## Step 2: Claim the Task

```bash
# Update status
python project-management/tools/linear.py issue update CON-XXX --state "Work Started"

# Swap labels (remove agent_ready if present, add agent_working)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working

# Comment to claim (NOTE: angle brackets around agent name are required)
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] <$AGENT_NAME>: Starting implementation."
```

---

## Step 3: Determine Source of Requirements

Check if the issue has a `has_spec` label:

### If `has_spec` label exists → Implement from Spec

1. **Find the spec path** — Look in Linear comments for `**Spec:**` line
2. **Read the spec file** — Follow it precisely
3. **Read ai_docs/** — Check for API references the spec author created

**Implementation rules (with spec):**
- Follow the spec precisely — don't add extras
- Keep changes minimal — only what the spec requires
- Use ai_docs/ — the spec author put references there for you

### If NO `has_spec` label → Implement from Issue

1. **Read the issue description** — This is your requirements doc
2. **Check comments** — Look for clarifications or additional context

**Implementation rules (without spec):**
- Implement exactly what the issue describes
- Keep changes minimal and scoped
- Match existing patterns in the codebase

---

## Step 4: Implement

1. **Match existing patterns** — Look at similar code in the package
2. **Write tests** — Follow testing patterns in the package
3. **Keep changes minimal** — Only what's required

---

## Step 5: Verify Your Changes

**Run tests and checks before creating a PR.** Catch issues early, before CI and reviewers.

```bash
# Run all tests
uv run pytest packages/ apps/ -v

# Run linting
uv run ruff check .

# Run type checking
uv run mypy packages/
```

**If tests fail:**
- Fix the issues before proceeding
- If blocked, add `human_input` label and report

**If lint/type errors exist:**
- Fix auto-fixable issues: `uv run ruff check . --fix`
- Address remaining issues manually

> **Why this matters:** CON-288 showed that skipping local verification leads to CI failures after PR creation. Running tests locally catches issues faster and reduces review cycles.

---

## Step 6: Create PR

```bash
git add .
git commit -m "feat: <short description>

Implements CON-XXX: <issue title>

Co-Authored-By: [Model Name] <noreply@anthropic.com>"

git push -u origin <branch-name>

# Create PR (detailed info goes here)
gh pr create --title "feat: <short description>" --body "$(cat <<'EOF'
## Summary
Implements CON-XXX: <issue title>

<detailed description of what was implemented>

## Changes
- <file/component changed and why>
- <file/component changed and why>

## Test plan
- [ ] Tests pass locally
- [ ] <specific test scenarios>

## Notes for reviewer
- <any decisions made, trade-offs, or things to watch for>
EOF
)"
```

---

## Step 7: Update Linear

```bash
# Move to In Review
python project-management/tools/linear.py issue update CON-XXX --state "In Review"

# CRITICAL: Swap labels (you started with agent_working, end with agent_ready)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready

# Comment (brief - details are in PR)
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] <$AGENT_NAME>: Implementation complete.

**PR:** <GitHub PR URL>

See PR for full details and test plan.

**Next steps:** Run \`/checkout CON-XXX\` to start PR review."
```

---

## Step 8: Report to Human

```
Implementation complete for CON-XXX

**PR:** <GitHub PR URL>
**Branch:** <branch-name>
**Status:** In Review — ready for PR review

**Next steps:** Run `/checkout CON-XXX` to start PR review.
```

