# Falcon Pattern Attribution System - Validation Test Plan

**Purpose:** Determine if the Falcon guardrail system improves code quality by reducing PR review findings.

**Date:** 2026-01-19
**Updated:** 2026-01-20
**Status:** Ready for execution

---

## 1. Test Overview

### Hypothesis
Injecting warnings from past failures into Context Pack and Spec agents reduces the number and severity of PR review findings. Additionally, pattern accumulation within treatment runs should show improvement over time.

### Design
- **5 different apps**, each built 10 times (5 with Falcon, 5 without Falcon)
- **50 total runs** (10 runs per app)
- **Interleaved execution:** T1 C1 T2 C2 T3 C3 T4 C4 T5 C5 per app
- **Pattern accumulation:** Treatment runs learn from previous treatment runs within the same app
- **Statistical comparison:** Compare mean severity scores between treatment and control groups

### Why 5/5 Instead of 1/1?
- Single runs have high variance — one bad run could mask real effects
- 5 runs per condition allows statistical comparison (t-test)
- Can observe **learning curve** within treatment group (do runs 4-5 outperform runs 1-2?)
- More robust signal for go/no-go decision

### Success Criteria

| Result | Interpretation |
|--------|----------------|
| Treatment mean significantly lower in ≥4 apps | **STRONG POSITIVE** — system works |
| Treatment mean significantly lower in 2-3 apps | **WEAK POSITIVE** — need more data |
| Treatment mean lower in 0-1 apps | **NEGATIVE** — system not helping |
| Treatment shows improvement trend (T5 < T1) in ≥3 apps | **LEARNING SIGNAL** — accumulation working |

**Significance threshold:** Treatment mean severity score at least 20% lower than control, OR p < 0.1 on one-tailed t-test.

---

## 2. Test Conditions

### Treatment (WITH Falcon)
- Baseline principles (B01-B11) injected into Context Pack agent
- Baseline principles injected into Spec agent
- **Pattern accumulation:** Patterns learned from T1 injected into T2, T1+T2 into T3, etc.
- Full attribution pipeline active after each PR review
- Each treatment run builds on learnings from previous treatment runs (same app)

### Control (WITHOUT Falcon)
- No warnings injected into Context Pack agent
- No warnings injected into Spec agent
- No attribution pipeline
- Standard workflow only
- **No accumulation** — each control run is independent

### Constants (Both Conditions)
- Same Linear issue / requirements for each app (all 10 runs use identical spec)
- Same models: Opus for Context Pack/Spec, Sonnet for Implementation
- Same PR Review configuration (6 scouts, 6 judges)
- Same temperature settings (default)
- Same codebase starting point (empty repo with standard setup per run)

---

## 3. The 5 Test Apps

Each app is designed to be:
- **CLI tool** (easy to test - run command, check output)
- **Completable in 1 workflow cycle** (context pack → spec → implement → PR review)
- **Complex enough to stress test** the system (4-8 files, real patterns)
- **Covering different risk areas** to test pattern diversity

| App | Type | Key Risk Areas | Expected Touches |
|-----|------|----------------|------------------|
| 1 | Warehouse Inventory CLI | SQL injection, input validation, file handling | database, user_input, config |
| 2 | Personal Finance Tracker CLI | SQL injection, input validation, transaction handling | database, user_input, config |
| 3 | Note-taking/Wiki CLI | SQL injection, path traversal, file permissions, FTS | database, user_input, config, filesystem |
| 4 | Task Manager CLI | SQL injection, input validation, date handling | database, user_input, config |
| 5 | Contact Book CLI | SQL injection, input validation, export handling | database, user_input, config |

See `apps/app1/` through `apps/app5/` directories for detailed documentation (design docs, systems docs, and task files).

**Note:** The original spec files (`APP_1_INVENTORY_CLI.md` through `APP_5_USER_ADMIN_CLI.md`) represent the original test plan. The `app1/` through `app5/` directories contain the actual implementations which differ from the original specs. This test plan uses the actual implementations.

### Why CLIs?
- Easy to test: run command, check exit code and output
- No server setup required
- Output is deterministic and inspectable
- Can automate test validation with shell scripts

---

## 4. Execution Order

### Interleaved Pattern Per App

Each app runs 10 times in this order:
```
T1 → C1 → T2 → C2 → T3 → C3 → T4 → C4 → T5 → C5
```

**Why interleaved?**
- Controls for temporal drift (model behavior changes over time)
- Ensures treatment and control runs are distributed evenly
- Prevents clustering effects

### Pattern Accumulation (Treatment Only)

```
T1: Baseline principles only (B01-B11)
    ↓ PR Review → Attribution → Learn patterns
T2: Baseline + patterns from T1
    ↓ PR Review → Attribution → Learn patterns
T3: Baseline + patterns from T1, T2
    ↓ PR Review → Attribution → Learn patterns
T4: Baseline + patterns from T1, T2, T3
    ↓ PR Review → Attribution → Learn patterns
T5: Baseline + patterns from T1, T2, T3, T4
```

### Cross-App Pattern Transfer

Patterns learned within App N treatment runs do **NOT** transfer to App N+1. Each app starts fresh with only baseline principles for T1.

**Rationale:** We want to measure within-app learning. Cross-app transfer is a separate hypothesis for Phase 2.

### Parallel Execution

Apps 1-5 can run in parallel (they are independent). Within each app, runs are sequential (interleaved order).

```
App 1: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5  ──┐
App 2: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5  ──┼── Parallel
App 3: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5  ──┤
App 4: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5  ──┤
App 5: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5  ──┘
```

### Phase 2: Cross-App Transfer Test (Optional)

If Phase 1 shows positive signal, run App 6 (new app) with all patterns learned from Apps 1-5 to test cross-app transfer.

---

## 5. Linear Issue Creation

### Linear Team
**Team:** `FALT` (Falcon Test)

### For Each App, Create 10 Issues:

**Issue Naming Convention:**
```
Title: [test_id] {App Title}
```
- Test ID in brackets for tracking: `[app1_treatment_1]`, `[app3_control_2]`
- Followed by natural task title from the app spec
- Description contains ONLY the app spec - NO test configuration or metadata
- The agent working on the issue should not know it's being tested

**Examples:**
- `[app1_treatment_1] Warehouse Inventory CLI`
- `[app2_control_3] Data Sync Tool`
- `[app5_treatment_5] User Admin CLI`

**Treatment Issues (T1-T5):**
```
Title: [app{A}_treatment_{N}] {App Title from spec}
Team: FALT
Labels: falcon_test, treatment, app_{A}, run_{N}
Description: {Copy from apps/APP_{A}.md - pure spec only, no test metadata}
```

**Control Issues (C1-C5):**
```
Title: [app{A}_control_{N}] {App Title from spec}
Team: FALT
Labels: falcon_test, control, app_{A}, run_{N}
Description: {Copy from apps/APP_{A}.md - pure spec only, no test metadata}
```

**Important:** Test configuration (Falcon enabled/disabled, accumulation sources) is tracked externally by the test harness, NOT in the Linear issue. This keeps the test blind to the agent.

### Linear Project Setup
1. Team: `FALT` (already created)
2. Create label: `falcon_test`
3. Create labels: `treatment`, `control`
4. Create labels: `app_1`, `app_2`, `app_3`, `app_4`, `app_5`
5. Create labels: `run_1`, `run_2`, `run_3`, `run_4`, `run_5`

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
| Patterns Injected | Count of patterns injected (treatment only) |
| New Patterns Learned | Count of new patterns created (treatment only) |

### Severity Score Formula
```
severityScore = (CRITICAL × 10) + (HIGH × 5) + (MEDIUM × 2) + (LOW × 1)
```

### Record in Results File

Create `falcon_test/results/APP_{N}_results.md` for each app:

```markdown
# App {N} Results: {App Name}

## Raw Data

### Treatment Runs
| Run | Issue | PR | Total | Crit | High | Med | Low | Severity Score | Patterns Injected | New Patterns |
|-----|-------|----|----|------|------|-----|-----|----------------|-------------------|--------------|
| T1  | KEY-1 | #1 | X  | a    | b    | c   | d   | Y              | 0                 | Z            |
| T2  | KEY-2 | #2 | X  | a    | b    | c   | d   | Y              | Z                 | Z            |
| T3  | KEY-3 | #3 | X  | a    | b    | c   | d   | Y              | Z                 | Z            |
| T4  | KEY-4 | #4 | X  | a    | b    | c   | d   | Y              | Z                 | Z            |
| T5  | KEY-5 | #5 | X  | a    | b    | c   | d   | Y              | Z                 | Z            |

### Control Runs
| Run | Issue | PR | Total | Crit | High | Med | Low | Severity Score |
|-----|-------|----|----|------|------|-----|-----|----------------|
| C1  | KEY-6 | #6 | X  | a    | b    | c   | d   | Y              |
| C2  | KEY-7 | #7 | X  | a    | b    | c   | d   | Y              |
| C3  | KEY-8 | #8 | X  | a    | b    | c   | d   | Y              |
| C4  | KEY-9 | #9 | X  | a    | b    | c   | d   | Y              |
| C5  | KEY-10| #10| X  | a    | b    | c   | d   | Y              |

## Statistical Analysis

### Treatment vs Control
- Treatment Mean Severity: X.XX (std: Y.YY)
- Control Mean Severity: X.XX (std: Y.YY)
- Difference: X.XX (XX% reduction)
- t-test p-value: 0.XXX
- Winner: {Treatment / Control / Inconclusive}

### Learning Trend (Treatment Only)
- T1 Severity: X
- T5 Severity: Y
- Trend: {Improving / Flat / Degrading}
- Early (T1-T2) Mean: X.XX
- Late (T4-T5) Mean: X.XX
- Improvement: XX%

## Notes
{Observations, anomalies, patterns noticed}
```

---

## 7. Judging Criteria

### Per-App Winner

| Condition | Winner |
|-----------|--------|
| Treatment mean ≥20% lower than Control mean | **Treatment wins** |
| Control mean ≥20% lower than Treatment mean | **Control wins** |
| Difference <20% but t-test p < 0.1 favoring Treatment | **Treatment wins (marginal)** |
| Difference <20% but t-test p < 0.1 favoring Control | **Control wins (marginal)** |
| Otherwise | **Inconclusive** |

### Learning Signal (Per App)

| Condition | Signal |
|-----------|--------|
| T4-T5 mean ≥30% lower than T1-T2 mean | **Strong learning** |
| T4-T5 mean 10-30% lower than T1-T2 mean | **Weak learning** |
| T4-T5 mean within 10% of T1-T2 mean | **No learning** |
| T4-T5 mean >10% higher than T1-T2 mean | **Degradation** |

### Overall Test Result

```
Treatment Wins = count of apps where Treatment wins
Learning Apps = count of apps showing Strong or Weak learning

If Treatment Wins >= 4 AND Learning Apps >= 3:
    → STRONG POSITIVE (system works and learns)

If Treatment Wins >= 4 AND Learning Apps < 3:
    → POSITIVE (system works, learning unclear)

If Treatment Wins >= 2 AND Learning Apps >= 3:
    → MIXED (learning works, but not consistently better)

If Treatment Wins < 2:
    → NEGATIVE (system not helping)
```

### Additional Analysis

If results are positive, also check:
1. **Which baseline principles triggered?** (Were warnings relevant?)
2. **Which patterns were learned most frequently?** (Common failure modes)
3. **False positive rate** — Did any warnings cause confusion?
4. **Pattern quality** — Were learned patterns actionable?

If results are negative, check:
1. **Were warnings actually injected?** (Check injection logs)
2. **Were warnings relevant to the failures?** (Tag mismatch?)
3. **High variance?** (Large std dev in both groups)
4. **Ceiling effect?** (Both groups had very few findings)

---

## 8. Agent Instructions

### For Test Manager Agent

You are managing the Falcon validation test. Your responsibilities:

1. **Setup:**
   - Create Linear project and labels
   - Create 50 Linear issues (10 per app) using specs in `apps/`
   - Ensure issues are properly labeled and linked
   - Verify Falcon injection toggle works

2. **Execution:**
   - For each app, execute runs in interleaved order: T1 C1 T2 C2 T3 C3 T4 C4 T5 C5
   - After each treatment run, wait for attribution pipeline to complete before next treatment run
   - Control runs can proceed immediately (no waiting)
   - Apps can run in parallel

3. **Measurement:**
   - After each PR Review completes, extract findings
   - Record in `results/APP_{N}_results.md`
   - Calculate severity scores
   - Track patterns injected and learned (treatment only)

4. **Judgment:**
   - After all 50 runs complete, calculate statistics for each app
   - Determine per-app winners and learning signals
   - Write summary to `results/SUMMARY.md`
   - Include recommendation: proceed / more testing / stop

5. **Important:**
   - Treatment runs MUST wait for previous treatment attribution to complete
   - Control runs are independent — no waiting needed
   - Keep treatment and control runs isolated
   - If a run fails for technical reasons (not code quality), re-run it
   - Log any anomalies or issues

### For Workflow Agents (Context Pack, Spec, Implementation)

No special instructions. Run normally. The test harness controls whether Falcon injection is enabled or disabled via configuration.

---

## 9. File Structure

```
falcon_test/
├── TEST_PLAN.md              # This file
├── apps/
│   ├── app1/                 # Warehouse Inventory CLI (documentation + tasks)
│   │   ├── docs/design/      # Design documentation
│   │   ├── docs/systems/     # Systems documentation
│   │   └── tasks/            # Implementation task files
│   ├── app2/                 # Personal Finance Tracker CLI
│   ├── app3/                 # Note-taking/Wiki CLI
│   ├── app4/                 # Task Manager CLI
│   ├── app5/                 # Contact Book CLI
│   ├── APP_1_INVENTORY_CLI.md     # Original spec (reference only)
│   ├── APP_2_DATA_SYNC_CLI.md     # Original spec (reference only)
│   ├── APP_3_CREDENTIAL_MANAGER_CLI.md  # Original spec (reference only)
│   ├── APP_4_LOG_ANALYZER_CLI.md  # Original spec (reference only)
│   └── APP_5_USER_ADMIN_CLI.md    # Original spec (reference only)
└── results/
    ├── APP_1_results.md      # Raw data + analysis for App 1
    ├── APP_2_results.md
    ├── APP_3_results.md
    ├── APP_4_results.md
    ├── APP_5_results.md
    └── SUMMARY.md            # Overall test summary + recommendation

~/Projects/falcon-tests/      # Test execution folders
├── app1_treatment_1/         # App 1, Treatment Run 1 (with Falcon)
├── app1_treatment_2/
├── app1_treatment_3/
├── app1_treatment_4/
├── app1_treatment_5/
├── app1_control_1/           # App 1, Control Run 1 (without Falcon)
├── app1_control_2/
├── app1_control_3/
├── app1_control_4/
├── app1_control_5/
├── app2_treatment_1/         # App 2, Treatment Run 1
│   ...                       # (pattern repeats for apps 2-5)
├── app5_treatment_5/
└── app5_control_5/
    (50 folders total: 5 apps × 10 runs each)
```

---

## 10. Checklist Before Starting

- [ ] Linear project created
- [ ] Labels created (falcon_test, treatment, control, app_1-5, run_1-5)
- [ ] All 50 issues created and properly labeled
- [ ] Falcon injection toggle working (can enable/disable)
- [ ] Attribution pipeline working (patterns stored after PR review)
- [ ] Pattern injection working (patterns retrieved and injected)
- [ ] PR Review pipeline working
- [ ] Results folder created
- [ ] Test manager agent briefed

---

## 11. Quick Reference

| Metric | Value |
|--------|-------|
| Total Apps | 5 |
| Runs per App | 10 (5 treatment, 5 control) |
| Total Runs | 50 |
| Execution Order | T1 C1 T2 C2 T3 C3 T4 C4 T5 C5 |
| Pattern Accumulation | Within app treatment runs only |
| Cross-App Transfer | None (Phase 1) |
| Success Threshold | ≥4 apps with Treatment winning |
| Learning Threshold | ≥3 apps showing improvement trend |

---

*Test plan created 2026-01-19. Updated 2026-01-20 with 5/5 design.*
