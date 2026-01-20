# Task: Testing

Instructions for running tests and performing comprehensive testing. Read after checking out a task in **Testing** state.

---

## CRITICAL: Agent Restriction

**Only authorized test agents (<CONFIG>Test agent names</CONFIG>) can run tests.**

Check your agent name:
```bash
echo $AGENT_NAME
```

**If your agent name is NOT in the authorized list:**

```
I am not a testing agent. Only authorized test agents are permitted to run tests.

**Your agent name:** $AGENT_NAME
**Required agent:** <CONFIG>Test agent names</CONFIG>

Please assign this task to a test agent.
```

Then **STOP** — do not proceed with testing.

---

## Overview

**CI handles the baseline.** GitHub Actions runs the full test suite, linting, and type checking on every PR. Your job as a test agent is to go **beyond CI** with targeted and manual testing.

### What CI Does (You Don't Need To)
- <CONFIG>Test command</CONFIG> (full test suite)
- <CONFIG>Lint command</CONFIG> (linting)
- <CONFIG>Type check command</CONFIG> (type checking)

### What You Do
- **Run new tests only** — tests created for this specific issue
- **Spec compliance** — verify implementation matches spec constraints
- **Manual testing** — try scenarios, edge cases, error paths
- **Behavioral verification** — does it actually work as intended?
- **Security review** (if applicable)
- **Performance checks** (if applicable)

---

## Prerequisites

- Issue is in **Testing** state
- PR exists (check `**PR:**` in Linear comments)
- Your agent name is `test-1` or `test-2`

---

## Step 1: Get Issue Details

```bash
# Use /linear-tool skill for Linear operations
```

**Extract from comments:**
- `**PR:**` — GitHub PR URL (REQUIRED)
- `**Spec:**` — Full path to the spec file (if exists)
- `**Branch:**` — Branch name

If PR link is missing, **FAIL** and tell human: "No PR link found in comments. Cannot proceed."

---

## Step 2: Checkout Branch and Claim Task

```bash
git fetch origin
git checkout <branch-name>

# Swap labels (remove agent_ready if present, add agent_working)
# Use /linear-tool skill for Linear operations

# Comment to claim
# Use /linear-tool skill for Linear operations
```

---

## Step 3: Read Context

1. **Read the spec file** (if exists) — understand expected behavior
2. **Read the PR diff** — understand what was implemented
3. **Read test files** — understand existing test coverage
4. **Read ai_docs/** — if referenced in spec

```bash
# View PR diff
gh pr diff <pr-number>

# View changed files
gh pr view <pr-number> --json files
```

---

## Step 3.5: Spec Compliance Check

Before running tests, verify the implementation matches the spec's constraints (not just behavior).

### Dependency Verification
```bash
# Check pyproject.toml or package.json dependencies
# Compare against spec's dependency constraints
```

- [ ] Dependencies match spec constraints (e.g., "stdlib only", "no external deps")
- [ ] No extra dependencies that aren't used
- [ ] No missing dependencies that are used

### Interface Verification
- [ ] Public API matches spec interface (function names, parameters, return types)
- [ ] All MUST requirements are implemented
- [ ] Error codes/messages match spec definitions
- [ ] File structure matches spec (if specified)

### Contract Verification
- [ ] Exports match what spec declares
- [ ] No undocumented public APIs
- [ ] Type hints match spec (if specified)

**If spec violations found:** Document them for the test report. These are typically **blocking** issues.

---

## Step 4: Run New Tests Only

**CI runs the full suite.** You only need to run tests created for this specific issue.

### Find New Test Files

```bash
# See what test files were added/modified in this PR
gh pr diff <pr-number> --name-only | grep -E "<CONFIG>Test file pattern (e.g., test_.*\.py$, *.test.ts$)</CONFIG>"
```

### Run Those Tests

```bash
# Run specific test file(s) from this PR
<CONFIG>Run single test file command</CONFIG>
```

### Verify Tests Pass

- [ ] All new tests pass
- [ ] Coverage is reasonable for new code
- [ ] No unexpected warnings or deprecations

**Note:** If CI is failing on the full suite, that's a blocker — but you don't need to run the full test suite yourself. Check the CI status on the PR.

---

## Step 5: Manual Testing

Go beyond automated tests. For each feature/change:

### Functional Verification
- [ ] Does it do what the spec says?
- [ ] Does output match expected format?
- [ ] Do all happy paths work?

### Edge Cases (TRY THEM)
- [ ] Empty inputs
- [ ] Single item inputs
- [ ] Very large inputs
- [ ] Special characters
- [ ] Unicode/internationalization
- [ ] Null/None values

### Error Handling (BREAK THINGS)
- [ ] Invalid inputs — does it error gracefully?
- [ ] Missing required fields — does it catch them?
- [ ] Type mismatches — does it validate?
- [ ] Network failures (if applicable) — does it retry/handle?
- [ ] Timeout scenarios (if applicable)

### Integration Points
- [ ] Does it work with actual dependencies (not just mocks)?
- [ ] Does it handle dependency failures?

### Boundary Testing
- [ ] Values at 0, 1, max-1, max
- [ ] Empty strings vs null vs undefined
- [ ] Negative numbers (if applicable)

---

## Step 6: Performance Testing (if applicable)

```bash
# Time a test
time <CONFIG>Run single test file command</CONFIG>

# Profile memory/performance (project-specific tooling)
# Use appropriate tools for the project
```

Check:
- [ ] Response times acceptable?
- [ ] Memory usage reasonable?
- [ ] No obvious performance regressions?

---

## Step 7: Security Testing (if applicable)

Check:
- [ ] Input sanitization working?
- [ ] No SQL injection vectors?
- [ ] No XSS vectors (if web)?
- [ ] Authentication/authorization enforced?
- [ ] Secrets not exposed in logs/output?

---

## Step 8: Document Results

Create a detailed test report. Include:
- What tests were run
- Pass/fail results
- Coverage numbers
- Any issues found
- Manual testing performed

---

## Step 9a: If Tests PASS

1. **Comment on GitHub PR (full details):**
   ```
   **[Model Name] Agent $AGENT_NAME**

   Testing complete — ALL PASS

   **CI Status:** ✓ (pytest, ruff, mypy all passing)

   **New Tests (this PR):**
   - <test_file.py>: X tests passed
   - Coverage: X%

   **Spec Compliance:**
   - [x] Dependencies match spec constraints
   - [x] Public API matches spec interface
   - [x] All MUST requirements implemented

   **Manual Testing:**
   - [x] Happy paths verified
   - [x] Edge cases tested: <list>
   - [x] Error handling verified: <list>
   - [x] <other scenarios tested>

   **Notes:**
   - <any observations>

   Ready to merge.
   ```

2. **Update Linear (brief):**
   ```bash
   # Comment (short)
   # Use /linear-tool skill for Linear operations

   # Move to Ready to Merge
   # Use /linear-tool skill for Linear operations

   # Swap labels
   # Use /linear-tool skill for Linear operations
   ```

3. **Report to human:**
   ```
   Testing complete for CON-XXX — ALL PASS

   **PR:** <GitHub PR URL>
   **Status:** Ready to Merge

   **Next steps:** Run `/pm:merge <PR-URL>` to merge the PR.
   ```

---

## Step 9b: If Issues Found

**All details go on GitHub.** Linear gets only a brief note with the PR link.

Categorize each issue as **blocking** or **non-blocking**:

| Blocking | Non-Blocking |
|----------|--------------|
| New tests fail | Code style suggestions |
| Spec violations (wrong deps, missing MUST) | Minor improvements |
| Security issues | Documentation gaps |
| Breaks contract/API | Performance observations |
| CI failing | Nice-to-have enhancements |

**The human decides** whether to pass (if all non-blocking) or require fixes.

1. **Comment on GitHub PR (FULL details with severity):**
   ```
   **[Model Name] Agent $AGENT_NAME**

   Testing complete — ISSUES FOUND

   **CI Status:** <✓ passing | ✗ failing>

   **New Tests (this PR):**
   - <test_file.py>: X passed, Y failed
   - Coverage: X%

   ---

   ## 🚫 Blocking Issues
   *These MUST be fixed before merge.*

   1. **[BLOCKING] <issue title>**
      - Error: <error message>
      - File: <file:line>
      - Why blocking: <spec violation / test failure / security / etc.>
      - Fix: <specific fix needed>

   2. **[BLOCKING] <another issue>**
      - ...

   ---

   ## ⚠️ Non-Blocking Issues
   *Recommended fixes, but human may choose to pass.*

   1. **[NON-BLOCKING] <issue title>**
      - Observation: <what was found>
      - Recommendation: <suggested improvement>

   ---

   **Summary:**
   - Blocking: X issues
   - Non-Blocking: Y issues

   **Human decision required:** Fix all issues, or pass with non-blocking items noted.
   ```

2. **Update Linear (brief — just the link):**
   ```bash
   # Comment (SHORT - details on GitHub)
   # Use /linear-tool skill for Linear operations

   # Stay in Testing state, add testing-phase-failed label
   # Use /linear-tool skill for Linear operations

   # Swap labels
   # Use /linear-tool skill for Linear operations
   ```

3. **Report to human:**
   ```
   Testing complete for CON-XXX — ISSUES FOUND

   **PR:** <GitHub PR URL>
   **Blocking:** X issues
   **Non-blocking:** Y issues
   **Status:** Testing (with `testing-phase-failed` label)
   ```

---

## Fixing Testing Issues

**Triggered by:** `/checkout CON-XXX` when issue is in **Testing** state with `testing-phase-failed` label.

**Who:** Non-test agents (the original implementing agent or another dev agent).

**Do NOT run tests.** Just fix the code and push. CI and test agents handle re-testing.

1. **Claim the task:**
   ```bash
   # Use /linear-tool skill for Linear operations
   ```

2. **Read the PR comments** for the detailed test report

3. **Fix the blocking issues** (and optionally non-blocking)

4. **Push fixes** to the branch

5. **Signal ready for re-test:**
   ```bash
   # Use /linear-tool skill for Linear operations
   ```

6. **Report to human:**
   ```
   Fixes pushed for CON-XXX — ready for re-test.

   **PR:** <GitHub PR URL>
   **Status:** Testing
   ```

