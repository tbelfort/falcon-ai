---
description: Run a full codebase code review using 5 specialized scouts
argument-hint: "[path] (optional - specific directory to review)"
---

# PM: Code Review

Instructions for running a full codebase code review using 5 specialized scouts.

**Usage:** `/pm:code-review [path]`
- `path` (optional): Specific directory or file to review. Defaults to entire source directory.

---

## Overview

**You are Opus — the boss.** You orchestrate 5 specialized scouts and make final judgment on all issues.

**CRITICAL: Review only — do NOT fix issues.**

Your job is to **review and report**, not to fix. If you find issues:
- Document them clearly
- Report to human
- Let a different agent handle fixes

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

### Step 1.1: Determine Scope

If a path argument was provided: `$ARGUMENTS`
- Use that path for the review scope
- List files in that path

If no argument provided:
- Review the entire `src/` directory (or main source directory)
- Get a listing of all source files

```bash
# Get file list for review
find . -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | grep -v node_modules | grep -v __pycache__ | head -100
```

### Step 1.2: Gather Context

1. **Read project structure** — Understand the codebase layout
2. **Identify key files** — Entry points, core modules, configs
3. **Note any existing docs** — Architecture docs, READMEs

---

## Phase 2: Deploy Scouts

Launch all 5 scouts **in parallel** using the Task tool with dedicated subagent types.

**Scout agents:** `.claude/agents/pr-scout-*.md`

Each scout:
- Is **read-only** (tools: Read, Grep, Glob only)
- Cannot modify files (no Edit, Write, Bash)
- Receives codebase context via prompt

### Launch Command

Use Task tool with the scout subagent types:

```
Task(
  subagent_type: "pr-scout-spec",
  model: "sonnet",  // or "haiku" for faster/cheaper
  prompt: "Review the codebase at <path>.
           Files to review: <file list>
           Focus: Full codebase review, not PR-specific"
)
```

**Scout subagent types:**

| Scout | subagent_type | Focus |
|-------|---------------|-------|
| Spec Compliance | `pr-scout-spec` | Does code match any requirements/specs? |
| Architecture | `pr-scout-arch` | Does code fit codebase patterns? |
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
| All clear, no issues? | On non-trivial codebase | Suspicious — verify yourself |
| Generic uncertainty? | "Might have missed something" | Demand specifics or review yourself |
| Copy-paste language? | Boilerplate, no code-specific details | Reject report |

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

## Phase 4.5: Opus Mandatory Checks (DO NOT DELEGATE)

These checks are non-negotiable. Verify yourself, don't rely only on scouts.

### Import Boundary Check

```bash
# Check for forbidden imports based on component type
# <CONFIG>Import boundary rules - generated by /falcon-config</CONFIG>
grep -r "<forbidden-import>" <package-path>/<CONFIG>Source directory</CONFIG>/
```

**Any forbidden import found -> BLOCKING**

### Immutability Check (if Pydantic models)

Review any model with `frozen=True`:
- Are collection fields using `tuple`/`frozenset`?
- Or are they using `list`/`set` (WRONG)?

**Mutable collections in frozen model -> BLOCKING**

### Test Existence Check

```bash
ls <package-path>/tests/
uv run pytest <package-path>/tests/ --collect-only | head -20
```

**No tests or test collection fails -> BLOCKING**

---

## Phase 5: Your Own Review (Opus-Only Checks)

Scouts check correctness. **You check judgment.**

### Step 5.1: Maintainability Check

| Question | Your Answer | Evidence |
|----------|-------------|----------|
| Does this code belong in this codebase? | | |
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

Flag code that:

**Over-simplistic (cutting corners):**
- Missing error handling
- Ignores edge cases
- Happy path only

**Over-complex (over-engineering):**
- Adds abstraction layers for single use case
- "Future-proofing" for nonexistent requirements
- Design patterns for the sake of patterns

**Doesn't make sense:**
- Solves a different problem than intended
- Contradicts existing patterns without justification

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
| Any CRITICAL/BLOCKING confirmed | **NEEDS FIXES** |
| Any HIGH/BLOCKING confirmed | **NEEDS FIXES** |
| Only MEDIUM or below, NON-BLOCKING | **PASS with notes** |
| Zero issues confirmed | **PASS** |
| Your maintainability/production concern | **NEEDS FIXES** (your override) |

### Step 6.3: Your Self-Assessment

```markdown
**Review depth:** THOROUGH / ADEQUATE / RUSHED
**Confidence in verdict:** HIGH / MEDIUM / LOW
**What I might have missed:** [be specific]
```

---

## Phase 7: Report

### Final Report Format

```markdown
## Codebase Review Report

**Reviewer:** [Model Name] Agent $AGENT_NAME (Opus)
**Scouts:** 5x [sonnet/haiku]
**Scope:** [path or "full codebase"]
**Verdict:** NEEDS FIXES / PASS

---

### Executive Summary

[2-3 sentences on the codebase overall]

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

## Key Principles

1. **You are the boss** — Scouts report to you, you decide
2. **Verify everything** — Don't trust scout verdicts blindly
3. **Show your work** — Every decision needs evidence
4. **Maintainability matters** — Correct code that's unmaintainable still fails
5. **Production thinking** — Would you trust this at 3am?
6. **No rubber-stamping** — Even PASS needs justification
