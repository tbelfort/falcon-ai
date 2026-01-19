# Task: Review a Pull Request

Instructions for reviewing PRs. Read after checking out a task in **In Review** state.

---

## Overview

**You are Opus — the boss.** You orchestrate 5 specialized scouts and make final judgment on all issues.

**CRITICAL: Review only — do NOT fix issues.**

Your job is to **review and report**, not to fix. If you find issues:
- Document them on GitHub
- Report to human
- Let a different agent (or the same agent with `--fix`) handle fixes

Only fix issues if explicitly asked with `/checkout CON-XXX --fix`.

---

## The Review Model

```
You (Opus) = Boss / Senior Engineer
5 Scouts = Specialized Reviewers (report to you)

Scouts scan and flag potential issues → You verify each one → You decide
```

**Scouts are tools, not authorities.** They bring things to your attention. You make all final decisions.

---

## Phase 1: Setup

### Step 1.1: Gather Context

1. **Check Linear issue comments** — Read what the implementing agent wrote
2. **Find the PR link** — Look in issue comments for the GitHub PR URL
   - If PR link is missing, report to the human — don't proceed
3. **Extract key info:**
   - PR number
   - Branch name
   - Spec path (if `has_spec` label)
   - Issue description

### Step 1.2: Check CI Status (BLOCKER)

```bash
gh pr view <pr-number> --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
```

- If **ALL checks show `SUCCESS`** → Continue
- If **ANY check shows `FAILURE`** → **STOP. Do not proceed.**
  ```
  CI is failing on PR #<number>. Cannot review until CI passes.

  **Failed checks:**
  - <check-name>: FAILURE

  **Next steps:** Fix CI failures first, then request re-review.
  ```
  Report this to human and end the review.

### Step 1.3: Checkout and Claim

```bash
# Checkout the branch
git fetch origin && git checkout <pr-branch-name>

# Get PR file list
gh pr diff <pr-number> --stat

# Swap labels
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working

# Comment
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting PR review with 5-scout system."
```

### Step 1.4: Determine Model for Scouts

- **Default:** sonnet (thorough)
- **If user specified `haiku`:** haiku (faster, cheaper)

---

## Phase 2: Deploy Scouts

Launch all 5 scouts **in parallel** using the Task tool with dedicated subagent types.

**Scout agents:** `.claude/agents/pr-scout-*.md`

Each scout:
- Is **read-only** (tools: Read, Grep, Glob only)
- Cannot modify files (no Edit, Write, Bash)
- Receives PR context via prompt

### Launch Command

Use Task tool with the scout subagent types:

```
Task(
  subagent_type: "pr-scout-spec",
  model: "sonnet",  // or "haiku" for faster/cheaper
  prompt: "Review PR #XXX on branch <branch-name>.
           Files changed: <file list>
           Spec path: <path or 'none'>
           Issue: <issue description>"
)
```

**Scout subagent types:**

| Scout | subagent_type | Focus |
|-------|---------------|-------|
| Spec Compliance | `pr-scout-spec` | Does code match spec/issue? |
| Architecture | `pr-scout-arch` | Does code fit codebase? |
| Bug Hunter | `pr-scout-bugs` | Does code have bugs? |
| Test Quality | `pr-scout-tests` | Do tests actually test it? |
| Adversarial | `pr-scout-adversarial` | How will it break in production? |

**IMPORTANT:** Scouts are read-only and output issue reports, not verdicts. They flag; you judge.

---

## Phase 3: Collect and Audit Scout Reports

### Step 3.1: Collect Reports

Wait for all 5 scouts to complete. Each returns a structured report with:
- Potential issues (with severity/blocking)
- Areas reviewed
- Uncertainty notes

### Step 3.2: Audit Report Quality

**Before trusting any scout report, verify it's not BS:**

| Check | Red Flag | Your Action |
|-------|----------|-------------|
| Evidence tables sparse? | <3 rows | Reject, review that area yourself |
| Scope suspicious? | "Most complex" is a 10-line utility | Spot-check, scout may have avoided hard code |
| All clear, no issues? | On non-trivial PR | Suspicious — verify yourself |
| Generic uncertainty? | "Might have missed something" | Demand specifics or review yourself |
| Copy-paste language? | Boilerplate, no PR-specific details | Reject report |

**Record your audit:**

| Scout | Evidence Rows | Scope OK? | Specificity OK? | Accepted? |
|-------|---------------|-----------|-----------------|-----------|
| Spec Compliance | 5 | ✓ | ✓ | ✓ Yes |
| Architecture | 2 | ✗ | ✗ | ✗ No — reviewing myself |

---

## Phase 4: Verify Every Issue (THE CRITICAL STEP)

**You do NOT blindly accept scout findings.** For EACH issue flagged by ANY scout:

### Step 4.1: Read the Issue

- What did the scout flag?
- What's their evidence?
- What's their confidence?

### Step 4.2: Verify at Source

- Go to the actual file:line
- Read the code in context
- Is this actually an issue?

### Step 4.3: Make Your Judgment

| Your Verdict | Meaning |
|--------------|---------|
| ✓ CONFIRMED | Yes, this is a real issue — accept scout's severity/blocking |
| ✗ DISMISSED | Not actually an issue — explain why |
| ⚠️ DOWNGRADED | Issue exists but less severe than flagged |
| ⬆️ UPGRADED | Issue is MORE severe than flagged |
| 🔄 MODIFIED | Issue exists but different than described |

### Step 4.4: Record Your Decision

**You MUST show your work for each issue:**

```markdown
### Issue: Bug Hunter #1 - Missing null check at file.py:45

**Scout flagged:** HIGH / BLOCKING
**Scout evidence:** `x.data.get('key')` but x.data can be None per line 30

**My verification:**
- Read file.py:30 — confirms x.data assigned from optional response
- Read file.py:45 — confirms .get() called without null check
- Checked if handled elsewhere — no guard before this call

**My verdict:** ✓ CONFIRMED as HIGH/BLOCKING
**Reasoning:** Scout is correct. This will crash in production if API returns null.
```

---

## Phase 5: Your Own Review (Opus-Only Checks)

Scouts check correctness. **You check judgment.**

### Step 5.1: Maintainability Check

| Question | Your Answer | Evidence |
|----------|-------------|----------|
| Does this change belong in this codebase? | | |
| Will the next developer understand this? | | |
| Does this match how we do things here? | | |

### Step 5.2: Production Readiness Check

| Question | Your Answer | Evidence |
|----------|-------------|----------|
| Would I trust this code at 3am when it breaks? | | |
| Are failure modes obvious and handled? | | |
| Is there enough logging to debug issues? | | |

### Step 5.3: Goldilocks Check

**Not too simple, not too complex — just right.**

| Aspect | Too Simple? | Too Complex? | Just Right? | Evidence |
|--------|-------------|--------------|-------------|----------|
| Error handling | | | | |
| Abstraction level | | | | |
| Edge case coverage | | | | |

### Step 5.4: Smell Test

Reject PRs that:

**Over-simplistic (cutting corners):**
- Removes error handling "to simplify"
- Ignores edge cases mentioned in spec
- Happy path only

**Over-complex (over-engineering):**
- Adds abstraction layers for single use case
- "Future-proofing" for nonexistent requirements
- Design patterns for the sake of patterns

**Doesn't make sense:**
- Solves a different problem than the issue
- Contradicts existing patterns without justification
- Changes unrelated code "while I'm here"

---

## Phase 6: Final Verdict

### Step 6.1: Tally Confirmed Issues

Count only **your confirmed issues** (not raw scout flags):

| Severity | Blocking | Count |
|----------|----------|-------|
| CRITICAL | BLOCKING | |
| HIGH | BLOCKING | |
| MEDIUM | BLOCKING | |
| MEDIUM | NON-BLOCKING | |
| LOW | NON-BLOCKING | |

### Step 6.2: Determine Verdict

| Condition | Verdict |
|-----------|---------|
| Any CRITICAL/BLOCKING confirmed | **FAIL** |
| Any HIGH/BLOCKING confirmed | **FAIL** |
| Only MEDIUM or below, NON-BLOCKING | **PASS with notes** |
| Zero issues confirmed | **PASS** |
| Your maintainability/production concern | **FAIL** (your override) |
| Your "this doesn't make sense" concern | **FAIL** (your override) |

### Step 6.3: Your Self-Assessment

```markdown
**Review depth:** THOROUGH / ADEQUATE / RUSHED
**Confidence in verdict:** HIGH / MEDIUM / LOW
**What I might have missed:** [be specific]
```

---

## Phase 7: Report

### Step 7.1: GitHub Comment

**This is the authoritative record.** Use collapsible sections for length.

```markdown
## PR Review: CON-XXX

**Reviewer:** [Model Name] Agent $AGENT_NAME (Opus)
**Scouts:** 5x [sonnet/haiku]
**Verdict:** FAIL / PASS

---

### Executive Summary

[2-3 sentences on the PR overall]

**Confirmed Issues:**
| Severity | Count |
|----------|-------|
| CRITICAL/BLOCKING | X |
| HIGH/BLOCKING | X |
| MEDIUM | X |
| LOW | X |

---

### Opus Assessment

**Maintainability:** ✓ / ⚠️ / ✗
**Production Readiness:** ✓ / ⚠️ / ✗
**Complexity Balance:** ✓ / ⚠️ Too simple / ⚠️ Too complex

[Your concerns, if any]

---

### Issue Verification (Opus Decisions)

| Source | Issue | Scout Call | Opus Verdict | Reasoning |
|--------|-------|------------|--------------|-----------|
| Bug Hunter #1 | Null check missing | HIGH/BLOCKING | ✓ CONFIRMED | Verified at file:45 |
| Bug Hunter #2 | Off-by-one | MEDIUM/BLOCKING | ✗ DISMISSED | Range is correct |
| Test Quality #1 | Missing test | HIGH/BLOCKING | ⚠️ DOWNGRADED | Non-critical path |

---

### Scout Report Quality

| Scout | Evidence | Scope | Accepted? |
|-------|----------|-------|-----------|
| Spec Compliance | ✓ | ✓ | Yes |
| Architecture | ⚠️ Sparse | ✗ | Opus reviewed |
| Bug Hunter | ✓ | ✓ | Yes |
| Test Quality | ✓ | ✓ | Yes |
| Adversarial | ✓ | ✓ | Yes |

---

<details>
<summary>Full Scout Reports</summary>

### Spec Compliance Scout
[full report]

### Architecture Scout
[full report]

### Bug Hunter Scout
[full report]

### Test Quality Scout
[full report]

### Adversarial Scout
[full report]

</details>
```

### Step 7.2: If Issues Found (FAIL)

**GitHub:** Post the full report above

**Linear:**
```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review complete — changes requested.

**PR:** <GitHub PR URL>
**Verdict:** FAIL
**Confirmed Issues:** X BLOCKING, Y NON-BLOCKING

See PR comments for full review.

**Next steps:** Run \`/checkout CON-XXX --fix\` to fix the issues."

python project-management/tools/linear.py issue update CON-XXX --add-label code-review-failed
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
```

**Report to human:**
```
PR review complete for CON-XXX — FAIL

**PR:** <GitHub PR URL>
**Confirmed Issues:** X BLOCKING issues
**Label:** code-review-failed added

**Next steps:** Run `/checkout CON-XXX --fix` to fix the issues.
```

### Step 7.3: If Approved (PASS)

**GitHub:** Post the full report above (showing verification work)

**Linear:**
```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review passed.

**PR:** <GitHub PR URL>
**Verdict:** PASS
**Scout reports:** All reviewed and verified

Ready for human to move to Review Passed."

python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
```

**DO NOT move the issue to Review Passed.** The human will do this after verifying.

**Report to human:**
```
PR review complete for CON-XXX — PASS

**PR:** <GitHub PR URL>
**Scout reports:** 5 received, all verified
**Confirmed issues:** 0 blocking

**Action required:** Move CON-XXX to "Review Passed" to proceed with testing.
```

---

## Error Handling

### Scout Fails or Times Out

If any scout fails to complete:
1. Note in report: "Scout [X] failed: [reason]"
2. Review that area yourself (become the scout)
3. Continue with other scout reports
4. Do NOT block on scout failure

### Multiple Scouts Fail

If 2+ scouts fail:
1. Flag for human: "Review may be incomplete"
2. Do your best effort review
3. Note limitations in report

---

## Re-Review Flow

If this is a re-review (previous review comments exist):

1. **Read previous review** — What issues were raised?
2. **Check commits since** — What changed?
3. **For each previous issue:**
   - Is it fixed?
   - Did the fix introduce new issues?
4. **Run scouts on changed code only** (if possible)
5. **Focus verification on fixes** — Don't re-verify unchanged code

---

## Key Principles

1. **You are the boss** — Scouts report to you, you decide
2. **Verify everything** — Don't trust scout verdicts blindly
3. **Show your work** — Every decision needs evidence
4. **Maintainability matters** — Correct code that's unmaintainable still fails
5. **Production thinking** — Would you trust this at 3am?
6. **No rubber-stamping** — Even PASS needs justification
