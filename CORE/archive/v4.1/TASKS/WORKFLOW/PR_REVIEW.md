# Task: Review a Pull Request

Instructions for reviewing PRs. Read after checking out a task in **In Review** state.

---

## Overview

You are the **review orchestrator**. You deploy 6 specialized scouts to analyze the PR, then use 6 judges to evaluate each scout's findings. Your final verdict synthesizes all judge evaluations.

**CRITICAL: Review only — do NOT fix issues.**

Your job is to **review and report**, not to fix. If you find issues:
- Document them on GitHub
- Report to human
- Let a different agent (or the same agent with `--fix`) handle fixes

Only fix issues if explicitly asked with `/checkout CON-XXX --fix`.

---

## The Review Model

```
You (Orchestrator)
  ├── 6 Scouts (sonnet) — scan and flag potential issues
  ├── 6 Judges (opus) — evaluate each scout's findings with focused expertise
  └── Orchestrator Review — verify judge work, synthesize, final verdict
```

**Philosophy:** The implementation must prove itself correct.

- **Scouts** scan for issues — they flag, don't judge
- **Judges** evaluate their scout's findings with domain expertise
- **You (Orchestrator)** verify judge reasoning, catch cross-cutting concerns, make final call

**Neutrality:** You are not biased toward "implementation is fine" OR "scouts/judges are always right." Every determination — whether from scout, judge, or your own — must be backed by evidence. You can override judges, but must document why.

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
gh pr diff <pr-number> --name-only

# Swap labels
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working

# Comment
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting PR review."
```

---

## Phase 2: Deploy Scouts

Launch all 6 scouts **in parallel** using the Task tool.

Each scout:
- Is **read-only** (tools: Read, Grep, Glob only)
- Cannot modify files (no Edit, Write, Bash)
- Receives PR context via prompt

### Scout Definitions

| Scout | subagent_type | Purpose |
|-------|---------------|---------|
| Security | `pr-scout-adversarial` | Find security issues, production failure modes, attack vectors |
| Docs Compliance | `pr-scout-docs` | Check implementation against ALL system documentation |
| Bug Hunter | `pr-scout-bugs` | Find correctness issues, logic errors, edge cases |
| Test Quality | `pr-scout-tests` | Verify tests are meaningful, not reward-hacking |
| Decisions | `pr-scout-decisions` | Detect undocumented decisions that need doc updates |
| Spec Compliance | `pr-scout-spec` | Check implementation matches spec/issue requirements |

### Launch Command

```
Task(
  subagent_type: "pr-scout-adversarial",
  model: "sonnet",
  prompt: "Review PR #XXX on branch <branch-name>.
           Files changed: <file list>
           Spec path: <path or 'none'>
           Issue: <issue description>"
)
```

---

## Phase 3: Deploy Judges

After scouts complete, launch 6 judges **in parallel** using the Task tool.

Each judge:
- Uses **opus** model for deeper analysis
- Receives ONLY their scout's report and the relevant context
- Has focused context on their specific domain
- Makes a determination on their scout's findings

### Judge Subagent Types

| Judge | subagent_type | Evaluates | Key Principle |
|-------|---------------|-----------|---------------|
| Security Judge | `pr-judge-adversarial` | Security scout | Security issues ALWAYS take precedence |
| Docs Judge | `pr-judge-docs` | Docs scout | Deviations need resolution: fix code OR update docs |
| Bug Judge | `pr-judge-bugs` | Bug scout | Bugs trump specs — if spec caused bug, spec was wrong |
| Test Judge | `pr-judge-tests` | Test scout | Tests must verify behavior, not just exist |
| Decisions Judge | `pr-judge-decisions` | Decisions scout | Undocumented decisions are system failures |
| Spec Judge | `pr-judge-spec` | Spec scout | Divergences assessed neutrally — may warrant doc updates |

### Judge Launch Command

```
Task(
  subagent_type: "pr-judge-adversarial",
  model: "opus",
  prompt: "Evaluate the Security Scout's findings for PR #XXX.

           **Scout Report:**
           <paste scout report>

           **Your Focus:**
           Security issues take ABSOLUTE precedence. A finding cannot be dismissed
           because 'the spec allowed it' or 'the architecture permits it'. If there's
           a security issue, everything upstream (spec, architecture) was wrong.

           **Determine:**
           1. For each finding: CONFIRMED / DISMISSED / MODIFIED (with reasoning)
           2. If DISMISSED: You must prove the scout was wrong, not just disagree
           3. Required actions: What must change? (code fix AND/OR doc update)"
)
```

---

## Phase 4: Judge Evaluation Principles

### Security Judge (pr-judge-adversarial)

**Principle:** Security issues take ABSOLUTE precedence over everything else.

- A security finding CANNOT be dismissed because "the spec allowed it"
- A security finding CANNOT be dismissed because "the architecture permits it"
- If a security issue exists due to spec/architecture, then spec/architecture was WRONG
- **Required action on confirmed finding:** Fix the code AND update any docs that enabled the issue

### Docs Judge (pr-judge-docs)

**Principle:** Implementation must align with documented system behavior.

- Check against ALL system docs (architecture, api, config, dbs, testing, ux, security, observability, errors)
- Deviations are not automatically wrong — assess WHY the deviation occurred
- If deviation is better: Recommend doc update
- If docs are correct: Recommend code fix
- **Either way, action is required** — no silent deviations

### Bug Judge (pr-judge-bugs)

**Principle:** Bugs are bugs, regardless of what upstream documents say.

- A bug cannot be excused because "the spec said to do it this way"
- If a bug exists due to spec, the spec was wrong
- If a bug exists due to architecture guidance, the guidance was wrong
- **On confirmed bug:** Fix required, plus identify what upstream doc (if any) led to the bug

### Test Judge (pr-judge-tests)

**Principle:** Tests must actually verify behavior, not just exist.

- Watch for reward-hacking tests (tests that pass but verify nothing)
- Watch for tautological tests (tests that always pass)
- Watch for missing negative tests (error paths untested)
- Adequate test count means nothing if assertions are weak

### Decisions Judge (pr-judge-decisions)

**Principle:** Undocumented decisions are system-level failures.

- New developers cannot be expected to read all code to understand the system
- They must be able to reference docs
- If code contains decisions not in docs, future agents WILL make conflicting choices
- **On confirmed gap:** Doc update is REQUIRED, not optional

### Spec Judge (pr-judge-spec)

**Principle:** Specs are guidance, not gospel.

- Divergence from spec is not automatically wrong
- Assess: Is this divergence better? Is there good reason?
- If yes: Check if it contradicts docs — if so, docs need update
- If no good reason: Flag for code fix
- **Note:** Specs are one-time documents. We never "update specs" — we update system docs to reflect new patterns

---

## Phase 5: Orchestrator Review

You are the final arbiter. Judges can be wrong too. Review their work with the same rigor they applied to scouts.

### Step 5.1: Collect Judge Determinations

| Judge | Confirmed | Dismissed | Actions Required |
|-------|-----------|-----------|------------------|
| Security | | | |
| Docs | | | |
| Bug | | | |
| Test | | | |
| Decisions | | | |
| Spec | | | |

### Step 5.2: Verify Judge Reasoning

For each judge determination, verify:

**For CONFIRMED findings:**
- Did the judge verify at source?
- Is the evidence compelling?
- Are the required actions appropriate?

**For DISMISSED findings:**
- Did the judge provide evidence for dismissal?
- Is the dismissal reasoning sound?
- Could this be a false negative?

**You may override a judge if:**
- Judge didn't verify at source (just accepted/rejected scout)
- Judge's reasoning contradicts evidence
- Judge missed cross-cutting concern visible from other reports
- Judge applied wrong principle (e.g., dismissed security issue because "spec allowed it")

### Step 5.3: Cross-Cutting Synthesis

Look across all 6 judge reports for:
- **Related findings** — Did Security and Bug judges find aspects of same issue?
- **Contradictions** — Did Spec judge accept something Docs judge flagged?
- **Gaps** — Did any area fall through the cracks?
- **Escalations** — Did any judge escalate to human? Aggregate these.

### Step 5.4: Tally Final Issues

Count only issues you've verified:

| Severity | Blocking | Count |
|----------|----------|-------|
| CRITICAL | BLOCKING | |
| HIGH | BLOCKING | |
| MEDIUM | BLOCKING | |
| MEDIUM | NON-BLOCKING | |
| LOW | NON-BLOCKING | |

### Step 5.5: Determine Verdict

| Condition | Verdict |
|-----------|---------|
| Any Security issue confirmed | **FAIL** |
| Any CRITICAL/HIGH BLOCKING confirmed | **FAIL** |
| Undocumented decisions without doc update plan | **FAIL** |
| Only MEDIUM or below, NON-BLOCKING | **PASS with notes** |
| Zero issues confirmed | **PASS** |

### Step 5.6: Document Your Overrides

If you overrode any judge:

| Judge | Their Call | Your Override | Reasoning |
|-------|------------|---------------|-----------|
| Security | DISMISSED | CONFIRMED | Judge didn't verify mitigation exists |
| Spec | FIX_CODE | ACCEPT_DIVERGENCE | Code approach is demonstrably safer |

---

## Phase 6: Report

### Step 6.1: GitHub Comment

**This is the authoritative record.**

```markdown
## PR Review: CON-XXX

**Reviewer:** [Model Name] Agent $AGENT_NAME
**Verdict:** FAIL / PASS

---

### Executive Summary

[2-3 sentences on the PR overall]

**Issue Tally:**
| Severity | Count |
|----------|-------|
| CRITICAL/BLOCKING | X |
| HIGH/BLOCKING | X |
| MEDIUM | X |
| LOW | X |

---

### Judge Determinations

| Judge | Confirmed | Dismissed | Actions Required |
|-------|-----------|-----------|------------------|
| Security | X issues | Y issues | [summary] |
| Docs | X issues | Y issues | [summary] |
| Bug | X issues | Y issues | [summary] |
| Test | X issues | Y issues | [summary] |
| Decisions | X issues | Y issues | [summary] |
| Spec | X issues | Y issues | [summary] |

---

### Orchestrator Overrides

[If any — otherwise omit this section]

| Judge | Their Call | My Override | Reasoning |
|-------|------------|-------------|-----------|
| [Judge] | [CONFIRMED/DISMISSED] | [opposite] | [why] |

---

### Required Actions

**Code Fixes:**
1. [issue description] — [file:line]

**Doc Updates:**
1. [doc path] — [what to add/change]

---

<details>
<summary>Full Scout Reports</summary>
[paste all scout reports]
</details>

<details>
<summary>Full Judge Evaluations</summary>
[paste all judge evaluations]
</details>
```

### Step 6.2: If Issues Found (FAIL)

**Linear:**
```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review complete — changes requested.

**PR:** <GitHub PR URL>
**Verdict:** FAIL
**Issues:** X code fixes, Y doc updates required

See PR comments for full review.

**Next steps:** Run \`/checkout CON-XXX --fix\` to fix the issues."

python project-management/tools/linear.py issue update CON-XXX --add-label code-review-failed
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
```

### Step 6.3: If Approved (PASS)

**Linear:**
```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: PR review passed.

**PR:** <GitHub PR URL>
**Verdict:** PASS

Ready for human to move to Review Passed."

python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
```

**DO NOT move the issue to Review Passed.** The human will do this after verifying.

---

## Error Handling

### Scout or Judge Fails

If any scout or judge fails to complete:
1. Note in report: "[Scout/Judge] failed: [reason]"
2. Perform that analysis yourself
3. Continue with other results
4. Do NOT block on failure

---

## Re-Review Flow

If this is a re-review (previous review comments exist):

1. **Read previous review** — What issues were raised?
2. **Check commits since** — What changed?
3. **For each previous issue:**
   - Is it fixed?
   - Did the fix introduce new issues?
4. **Focus on changes** — Don't re-review unchanged code
