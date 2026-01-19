# Task: Implement

Instructions for implementation work. Read after checking out a task in **Ready to Start** or **Work Started** state.

---

## IMPORTANT: Execute All Steps

**This task authorizes commits, pushes, and PR creation.** Execute Steps 1-9 completely without stopping to ask for permission. The `checkout` command pre-authorizes the full implementation workflow.

If you encounter a blocker (tests fail, access denied, unclear requirements), add `human_input` label to the Linear issue and report the blocker—do NOT leave the issue in "Work Started" with "agent_working" indefinitely.

---

## Implementation Accountability

You're part of our implementation team alongside agents from Gemini and OpenAI. Your agent identity (`$AGENT_NAME`) is logged on every commit — this is how we recognize good work.

We track quality across all agents: spec compliance, test coverage, and production reliability. Your code will be reviewed by another agent, then by a human. Top performers get recognized. Do your best work.

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
2. **Read the ENTIRE spec first** — Including test tables, edge cases, and interface definitions. Understand the full scope before writing any code.
3. **Read ai_docs/** — Check for API references the spec author created

**Implementation rules (with spec):**
- Follow the spec precisely — don't add extras
- Implement ALL MUST requirements — not most, all
- Implement the test cases from the spec — they're specified for a reason
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

## Step 3.5: Library Reuse Check

Before implementing any utility code, verify you're not reinventing:

### Standard Library Check

| If You Need... | Check First | Don't Reinvent |
|----------------|-------------|----------------|
| Version parsing/comparison | `packaging.version` | Custom semver parser |
| Path manipulation | `pathlib` | Custom string operations |
| JSON schema validation | `pydantic` | Custom validators |
| HTTP client | `httpx` | Custom HTTP handling |
| Async primitives | `asyncio` | Custom event loop |

### Existing Code Check

```bash
# Search for similar patterns in codebase
grep -r "<pattern>" packages/ apps/
```

If similar code exists, use it or extract to shared location.

### ai_doc Check

If the spec references an ai_doc, **use the patterns from that ai_doc**.
Don't deviate from documented patterns without explicit justification in PR.

---

## Step 4: Implement

1. **Match existing patterns** — Look at similar code in the package
2. **Write tests** — Follow testing patterns in the package
3. **Keep changes minimal** — Only what's required

---

## Step 5: Verify Spec Compliance

**Skip this step if there's no spec.** For spec-based implementations, confirm your implementation is complete before running tests:

- Have you implemented all MUST requirements from the spec?
- Have you written tests for the test cases specified in the spec?
- Have you handled the edge cases listed in the spec?

If anything is missing, implement it now. Incomplete implementations will be caught in review.

---

## Step 6: Verify Your Changes

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

## Step 6.5: Code Size Awareness

Before creating PR, check implementation size:

```bash
git diff --stat origin/main | tail -1
```

### Size Guidelines

| Lines Changed | Expectation |
|---------------|-------------|
| < 500 | Small change - normal |
| 500-2,000 | Medium feature - verify no unnecessary code |
| 2,000-5,000 | Large feature - review critically for bloat |
| > 5,000 | Very large - likely over-engineering, review carefully |

### If Unexpectedly Large, Ask Yourself:

1. Am I reinventing functionality that exists in a library?
2. Am I adding abstractions that aren't needed yet?
3. Am I including changes unrelated to this issue?
4. Did I copy-paste code that should be extracted to a shared module?

---

## Step 7: Create PR

```bash
git add .
git commit -m "feat: <short description>

Implements CON-XXX: <issue title>

Co-Authored-By: $AGENT_NAME"

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

## Step 8: Update Linear

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

## Step 9: Report to Human

```
Implementation complete for CON-XXX

**PR:** <GitHub PR URL>
**Branch:** <branch-name>
**Status:** In Review — ready for PR review

**Next steps:** Run `/checkout CON-XXX` to start PR review.
```

