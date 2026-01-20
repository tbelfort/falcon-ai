# Falcon Pattern Attribution System - Validation Test Plan

**Purpose:** Determine if the Falcon guardrail system improves code quality by reducing PR review findings.

**Date:** 2026-01-19
**Status:** Ready for execution

---

## 1. Test Overview

### Hypothesis
Injecting warnings from past failures into Context Pack and Spec agents reduces the number and severity of PR review findings.

### Design
- **5 different apps**, each built twice (with Falcon, without Falcon)
- **10 total runs** (5 parallel pairs)
- **Paired comparison:** For each app, compare findings between treatment and control

### Success Criteria
| Result | Interpretation |
|--------|----------------|
| Falcon wins 4-5 out of 5 apps | Strong signal — system works |
| Falcon wins 2-3 out of 5 apps | Inconclusive — need more data |
| Falcon wins 0-2 out of 5 apps | Not working — reconsider approach |

---

## 2. Test Conditions

### Treatment (WITH Falcon)
- Baseline principles (B01-B11) injected into Context Pack agent
- Baseline principles injected into Spec agent
- Any learned patterns from previous runs injected (App 2-5 only)
- Full attribution pipeline active after PR review

### Control (WITHOUT Falcon)
- No warnings injected into Context Pack agent
- No warnings injected into Spec agent
- No attribution pipeline
- Standard workflow only

### Constants (Both Conditions)
- Same Linear issue / requirements for each app pair
- Same models: Opus for Context Pack/Spec, Sonnet for Implementation
- Same PR Review configuration (6 scouts, 6 judges)
- Same temperature settings (default)
- Same codebase starting point (empty repo with standard setup)

---

## 3. The 5 Test Apps

Each app is designed to be:
- **CLI tool** (easy to test - run command, check output)
- **Completable in 1 workflow cycle** (context pack → spec → implement → PR review)
- **Complex enough to stress test** the system (4-8 files, real patterns)
- **Covering different risk areas** to test pattern diversity

| App | Type | Key Risk Areas | Expected Touches |
|-----|------|----------------|------------------|
| 1 | Inventory CLI | SQL injection, input validation, file handling | database, user_input, config |
| 2 | Data Sync CLI | PII logging, retry logic, error handling | network, logging, database |
| 3 | Credential Manager CLI | Password handling, secure storage, credential exposure | auth, config, user_input, logging |
| 4 | Log Analyzer CLI | Input validation, file path handling, data parsing | user_input, logging, config |
| 5 | User Admin CLI | Authorization, audit logging, data exposure | authz, logging, database, user_input |

See `apps/APP_1_INVENTORY_CLI.md` through `apps/APP_5_USER_ADMIN_CLI.md` for detailed requirements.

### Why CLIs?
- Easy to test: run command, check exit code and output
- No server setup required
- Output is deterministic and inspectable
- Can automate test validation with shell scripts

---

## 4. Execution Order

### Phase 1: Parallel App Creation (Day 1)

Run all 5 app pairs in parallel:

```
App 1: Treatment (with Falcon) ──┐
App 1: Control (without Falcon) ─┼── Parallel Group 1
App 2: Treatment ────────────────┤
App 2: Control ──────────────────┤
App 3: Treatment ────────────────┤
App 3: Control ──────────────────┤
App 4: Treatment ────────────────┤
App 4: Control ──────────────────┤
App 5: Treatment ────────────────┤
App 5: Control ──────────────────┘
```

**Important:** Randomize which condition (treatment/control) runs first for each app to avoid ordering effects.

### Phase 2: Pattern Transfer Test (Day 2, Optional)

If Phase 1 shows positive signal, run App 6 (new app) to test if patterns learned from Apps 1-5 help a novel app.

---

## 5. Linear Issue Creation

### For Each App, Create TWO Issues:

**Treatment Issue:**
```
Title: [FALCON-TEST] {App Name} - WITH Falcon
Labels: falcon_test, treatment, app_{N}
Description: {Copy from apps/APP_{N}.md}

Add to description footer:
---
## Test Configuration
- Falcon Injection: ENABLED
- Test Run ID: {generate UUID}
- Paired With: {Control Issue ID}
```

**Control Issue:**
```
Title: [FALCON-TEST] {App Name} - WITHOUT Falcon
Labels: falcon_test, control, app_{N}
Description: {Copy from apps/APP_{N}.md}

Add to description footer:
---
## Test Configuration
- Falcon Injection: DISABLED
- Test Run ID: {generate UUID}
- Paired With: {Treatment Issue ID}
```

### Linear Project Setup
1. Create project: "Falcon Validation Test"
2. Create label: `falcon_test`
3. Create labels: `treatment`, `control`
4. Create labels: `app_1`, `app_2`, `app_3`, `app_4`, `app_5`

---

## 6. Measurement Protocol

### What to Measure (Per Run)

After PR Review completes, record:

| Metric | How to Measure |
|--------|----------------|
| Total Findings | Count of confirmed findings (judgeVerdict = CONFIRMED) |
| Critical Findings | Count where severity = CRITICAL |
| High Findings | Count where severity = HIGH |
| Medium Findings | Count where severity = MEDIUM |
| Low Findings | Count where severity = LOW |
| Security Findings | Count where scoutType = security |
| Correctness Findings | Count where scoutType in (bug, correctness) |
| Finding Categories | Breakdown by findingCategory |

### Severity Score Formula
```
severityScore = (CRITICAL × 10) + (HIGH × 5) + (MEDIUM × 2) + (LOW × 1)
```

### Record in Results File

Create `falcon_test/results/APP_{N}_results.md` for each app:

```markdown
# App {N} Results: {App Name}

## Treatment Run (WITH Falcon)
- Issue: {Linear issue key}
- PR: {PR number}
- Total Findings: X
- Severity Score: Y
- Breakdown: {CRITICAL: a, HIGH: b, MEDIUM: c, LOW: d}
- Security Findings: Z
- Patterns Injected: {list pattern IDs if any}

## Control Run (WITHOUT Falcon)
- Issue: {Linear issue key}
- PR: {PR number}
- Total Findings: X
- Severity Score: Y
- Breakdown: {CRITICAL: a, HIGH: b, MEDIUM: c, LOW: d}
- Security Findings: Z

## Comparison
- Finding Difference: Treatment - Control = {+/- N}
- Severity Score Difference: {+/- N}
- Winner: {Treatment / Control / Tie}
- Notes: {Any observations}
```

---

## 7. Judging Criteria

### Per-App Winner

| Condition | Winner |
|-----------|--------|
| Treatment severity score < Control severity score | Treatment wins |
| Treatment severity score > Control severity score | Control wins |
| Scores equal, Treatment total findings < Control | Treatment wins |
| Scores equal, Treatment total findings > Control | Control wins |
| All equal | Tie (counts as 0.5 for each) |

### Overall Test Result

```
Falcon Score = (Treatment wins) + (Ties × 0.5)

If Falcon Score >= 4.0 → STRONG POSITIVE (proceed with system)
If Falcon Score >= 2.5 → WEAK POSITIVE (need more testing)
If Falcon Score < 2.5  → NEGATIVE (system not helping)
```

### Additional Analysis

If results are positive, also check:
1. **Which baseline principles triggered?** (Were warnings relevant?)
2. **Any patterns learned that could help future apps?**
3. **False positive rate** — Did any warnings cause confusion?

If results are negative, check:
1. **Were warnings actually injected?** (Check injection logs)
2. **Were warnings relevant to the failures?** (Tag mismatch?)
3. **Did control have fewer bugs by chance?** (Noise)

---

## 8. Agent Instructions

### For Test Manager Agent

You are managing the Falcon validation test. Your responsibilities:

1. **Setup:**
   - Create Linear project and labels
   - Create 10 Linear issues (2 per app) using specs in `apps/`
   - Ensure issues are properly labeled and linked

2. **Execution:**
   - Trigger workflows for all 10 issues
   - Monitor for completion
   - Do NOT intervene in the workflow — let it run naturally

3. **Measurement:**
   - After each PR Review completes, extract findings
   - Record in `results/APP_{N}_results.md`
   - Calculate severity scores

4. **Judgment:**
   - After all 10 runs complete, calculate overall Falcon Score
   - Write summary to `results/SUMMARY.md`
   - Include recommendation: proceed / more testing / stop

5. **Important:**
   - Keep treatment and control runs isolated
   - Don't let learnings from control runs affect treatment (or vice versa)
   - If a run fails for technical reasons (not code quality), re-run it

### For Workflow Agents (Context Pack, Spec, Implementation)

No special instructions. Run normally. The test harness controls whether Falcon injection is enabled or disabled via configuration.

---

## 9. File Structure

```
falcon_test/
├── TEST_PLAN.md              # This file
├── apps/
│   ├── APP_1.md              # REST API requirements
│   ├── APP_2.md              # Data Pipeline requirements
│   ├── APP_3.md              # Auth Service requirements
│   ├── APP_4.md              # Webhook Handler requirements
│   └── APP_5.md              # Admin Dashboard API requirements
└── results/
    ├── APP_1_results.md      # Filled after runs complete
    ├── APP_2_results.md
    ├── APP_3_results.md
    ├── APP_4_results.md
    ├── APP_5_results.md
    └── SUMMARY.md            # Overall test summary
```

---

## 10. Checklist Before Starting

- [ ] Linear project created
- [ ] Labels created (falcon_test, treatment, control, app_1-5)
- [ ] All 10 issues created and linked
- [ ] Falcon injection toggle working (can enable/disable)
- [ ] PR Review pipeline working
- [ ] Results folder created
- [ ] Test manager agent briefed

---

*Test plan created 2026-01-19. Ready for execution.*
