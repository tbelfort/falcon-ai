# PR Review Model Comparison: Complete Results

**Date:** 2026-01-21 (Updated)
**PR:** #6 - Security Review: Full Codebase Audit
**Branch:** `security-review/full-codebase-audit-2026-01-20`

---

## Executive Summary

**18 total test runs** comparing PR review architectures:
- 8 flat configurations (Sonnet/Opus scouts + Sonnet/Opus judges, batch/sequential)
- 5 C1 runs: Three-tier hierarchical (Sonnet scouts → Sonnet judges → Opus high judge)
- 5 C2 runs: Dual-pipeline hierarchical (Haiku+Sonnet scouts → Sonnet judges → Opus high judge)

**Key Finding:** Hierarchical models with Opus high judge provide better consistency and cross-validation at modest cost increase.

---

## Anthropic API Pricing (Current - Jan 2026)

| Model | Input | Output | Cache Write (5m) | Cache Read |
|-------|-------|--------|------------------|------------|
| **Sonnet 4.5** | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| **Opus 4.5** | $5/MTok | $25/MTok | $6.25/MTok | $0.50/MTok |

---

## Master Comparison Table

| Test | Scout | Judge | Mode | Findings | Confirmed | Dismissed | Modified | Confirm Rate | FP Rate |
|------|-------|-------|------|----------|-----------|-----------|----------|--------------|---------|
| **A1** | Sonnet | Sonnet | Batch | 79 | 48 | 29 | 6 | 60.8% | 36.7% |
| **A2** | Sonnet | Opus | Batch | 31 | 22 | 4 | 7 | 71.0% | 12.9% |
| **B1** | Opus | Sonnet | Batch | 45 | 31 | 5 | 9 | 68.9% | 11.1% |
| **B2** | Opus | Opus | Batch | 37 | 29 | 5 | 3 | 78.4% | 13.5% |
| **A1-SEQ** | Sonnet | Sonnet | Seq | 25 | 12 | 13 | 0 | 48.0% | 52.0% |
| **A2-SEQ** | Sonnet | Opus | Seq | 28 | 17 | 11 | 0 | 60.7% | 39.3% |
| **B1-SEQ** | Opus | Sonnet | Seq | 30 | 18 | 12 | 0 | 60.0% | 40.0% |
| **B2-SEQ** | Opus | Opus | Seq | 30 | 17 | 11 | 2 | 56.7% | 36.7% |

---

## Cost Analysis

### Estimated Token Usage Per Test

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| Orchestrator (Opus) | ~50K | ~15K |
| 6 Scouts | ~120K | ~30K |
| 6 Judges (Batch) | ~150K | ~48K |
| 6 Judges (Sequential) | ~300K | ~96K |

### Cost by Test Configuration

| Test | Scout Cost | Judge Cost | Orchestrator | **Total** | Cost/Issue |
|------|------------|------------|--------------|-----------|------------|
| **A1** | $0.81 | $1.17 | $0.63 | **$2.61** | $0.05 |
| **A2** | $0.81 | $1.95 | $0.63 | **$3.39** | $0.15 |
| **B1** | $1.35 | $1.17 | $0.63 | **$3.15** | $0.10 |
| **B2** | $1.35 | $1.95 | $0.63 | **$3.93** | $0.14 |
| **A1-SEQ** | $0.81 | $2.34 | $0.63 | **$3.78** | $0.32 |
| **A2-SEQ** | $0.81 | $3.90 | $0.63 | **$5.34** | $0.31 |
| **B1-SEQ** | $1.35 | $2.34 | $0.63 | **$4.32** | $0.24 |
| **B2-SEQ** | $1.35 | $3.90 | $0.63 | **$5.88** | $0.35 |

**Grand Total for All 8 Tests:** ~$32.40

---

## Key Observations

### 1. Scout Model Impact

| Scout Model | Avg Findings | Avg Confirmed | Avg Confirm Rate | Consistency |
|-------------|--------------|---------------|------------------|-------------|
| **Sonnet** | 40.8 | 24.8 | 60.1% | Low (25-79 range) |
| **Opus** | 35.5 | 23.8 | 66.0% | High (30-45 range) |

- Sonnet scouts produce more findings but with higher variance and false positive rate
- Opus scouts produce more consistent, higher-quality findings

### 2. Judge Model Impact

| Judge Model | Behavior | Confirmation Rate |
|-------------|----------|-------------------|
| **Sonnet** | More permissive | Lower (~60%) |
| **Opus** | More thorough validation | Higher (~70%) |

### 3. Batch vs Sequential Mode

| Mode | Avg Confirm Rate | Cost Multiplier | Findings |
|------|------------------|-----------------|----------|
| **Batch** | 69.8% | 1.0x | Higher |
| **Sequential** | 56.4% | ~1.5x | Lower |

- Batch mode is more cost-effective
- Sequential mode costs 45-50% more with no clear quality benefit

---

## Critical Issues Found by ALL Configurations

| Severity | Issue | Location |
|----------|-------|----------|
| **CRITICAL** | CreateInput type violates scope invariant | `pattern-occurrence.repo.ts:17` |
| **HIGH** | Path traversal in copyDirRecursive | `init.ts:318-332` |
| **HIGH** | Missing 90-day re-promotion block | `promotion-checker.ts:152-168` |
| **HIGH** | Typo: `promoteToDerivdPrinciple` | `promotion-checker.ts:131` |
| **HIGH** | Security bias missing in injection | `confidence.ts:133-176` |

---

## Analysis Issues & Caveats

### Problems with Direct Comparison

1. **High Scout Variance:** Sonnet scouts produced 25-79 findings across runs (3x variance)
2. **No Ground Truth:** We can't measure true precision/recall without human verification
3. **Confirmation Rate Ambiguity:** High rate could mean good scouts OR permissive judges

### What We Can Confidently Say

1. Opus scouts produce more consistent output (30-45 vs 25-79 for Sonnet)
2. Batch mode is more cost-effective than sequential
3. All configurations catch critical issues (scope invariant found by all 8)
4. Sequential mode doesn't justify its 50% cost premium

---

## Revised Recommendations

| Use Case | Config | Rationale | Trade-off |
|----------|--------|-----------|-----------|
| **Maximum Coverage** | A1 (Sonnet→Sonnet Batch) | Most issues (48), lowest cost ($2.61) | High noise (37% FP rate) |
| **Best Balance** | B1 (Opus→Sonnet Batch) | 31 issues, 11% FP rate, $3.15 | Misses some issues |
| **Lowest Noise** | B2 (Opus→Opus Batch) | 13.5% FP rate, 78% confirm | Fewer total issues |
| **NOT Recommended** | Sequential mode | 50% more expensive, unclear benefit | - |

---

## Files Generated

```
judge_tests/
├── test_A1_sonnet_sonnet_batch.md      (40 KB)
├── test_A1_sonnet_sonnet_sequential.md (45 KB)
├── test_A2_sonnet_opus_batch.md        (29 KB)
├── test_A2_sonnet_opus_sequential.md   (29 KB)
├── test_B1_opus_sonnet_batch.md        (39 KB)
├── test_B1_opus_sonnet_sequential.md   (33 KB)
├── test_B2_opus_opus_batch.md          (41 KB)
├── test_B2_opus_opus_sequential.md     (36 KB)
└── MODEL_COMPARISON_SUMMARY.md         (this file)
```

---

## Hierarchical Model Results (New - 2026-01-21)

### Architecture Diagrams

**C1: Three-Tier Hierarchical**
```
Sonnet Scouts (6) → Sonnet Judges (6) → Opus High Judge (1) → Orchestrator
```

**C2: Dual-Pipeline Hierarchical**
```
Haiku Scouts (6) ─→ Sonnet Judges (6) ─┐
                                       ├→ Opus High Judge (1) → Orchestrator
Sonnet Scouts (6) → Sonnet Judges (6) ─┘
```

### Variance Analysis Summary (5 runs each)

| Metric | C1 Mean | C1 Std Dev | C1 CV | C2 Mean | C2 Std Dev | C2 CV |
|--------|---------|------------|-------|---------|------------|-------|
| Scout Findings | 66.6 | 24.0 | 36% | 72.6 | 57.0 | 78% |
| Final Confirmed | 35.6 | 14.5 | 41% | 24.6 | 7.0 | 28% |
| CRITICAL Issues | 3.8 | 3.6 | 95% | 0.8 | 0.8 | 100% |
| HIGH Issues | 8.2 | 4.5 | 55% | 4.4 | 2.3 | 52% |

### Cost Analysis (Hierarchical)

| Config | Scout Cost | Judge Cost | High Judge | Orchestrator | **Total** |
|--------|------------|------------|------------|--------------|-----------|
| **C1** | $0.81 | $1.17 | $0.90 | $0.63 | **$3.51** |
| **C2** | $0.99 | $2.34 | $1.20 | $0.63 | **$5.16** |

**Total for 10 Hierarchical Runs:** ~$43.35

### Hierarchical vs Flat Comparison

| Metric | Flat (Best: B1) | C1 | C2 | Winner |
|--------|-----------------|----|----|--------|
| Avg Findings | 31 | 35.6 | 24.6 | C1 |
| False Positive Rate | 11.1% | ~35% | ~23% | Flat |
| Consistency (CV) | N/A | 41% | 28% | C2 |
| Cross-Validation | No | No | Yes | C2 |
| Cost per Run | $3.15 | $3.51 | $5.16 | Flat |
| CRITICAL Detection | 1 | 3.8 | 0.8 | C1 |

### Key Insights from Hierarchical Tests

1. **High Variance in Raw Findings**: Both C1 and C2 show significant variance (36-78% CV), suggesting multiple runs are needed for confidence.

2. **C2 Post-Judge Stabilization**: Dual-pipeline (C2) shows better consistency after judge evaluation (CV=28%) compared to C1 (CV=41%), suggesting cross-validation provides regularization.

3. **CRITICAL Classification Variance**: Both configurations show ~100% CV for CRITICAL issues, indicating subjective or context-dependent classification.

4. **Sonnet Outperforms Haiku**: In C2, Sonnet scouts consistently found more issues with lower false positive rate:
   - Sonnet: 75% confirmation rate, 13% FP rate
   - Haiku: 65% confirmation rate, 25% FP rate

5. **Consistently Identified Issues** (All 10 hierarchical runs):
   - Function typo: `promoteToDerivdPrinciple`
   - Missing test coverage for core modules
   - Undocumented thresholds/magic numbers
   - Security concerns in init.ts

### Haiku vs Sonnet Scout Comparison (C2 Runs)

| Metric | Haiku | Sonnet | Difference |
|--------|-------|--------|------------|
| Findings/Run | 33.8 | 38.8 | +15% Sonnet |
| Confirmation Rate | ~65% | ~75% | +10% Sonnet |
| False Positive Rate | 25% | 13% | -12% Sonnet |
| Unique HIGH+ | 1.4 | 3.2 | +129% Sonnet |

---

## Updated Recommendations

| Use Case | Config | Rationale | Cost |
|----------|--------|-----------|------|
| **Maximum Coverage** | C1 x3 runs | Highest findings, variance-averaged | ~$10.53 |
| **Best Consistency** | C2 x3 runs | Cross-validation, lowest variance | ~$15.48 |
| **Best Balance** | B1 (Opus→Sonnet Batch) | Low FP, reasonable cost | $3.15 |
| **Lowest Cost** | A1 (Sonnet→Sonnet Batch) | Highest noise but cheapest | $2.61 |
| **Security-Critical** | C2 x5 runs | Cross-validation + variance analysis | ~$25.80 |

### When to Use Each Architecture

**Flat (A1/B1):**
- Routine reviews
- Well-tested codebases
- Cost-sensitive environments

**C1 (Three-Tier Hierarchical):**
- Aggressive issue detection
- When higher FP rate is acceptable
- Single-pipeline simplicity

**C2 (Dual-Pipeline Hierarchical):**
- Security-critical code
- Major releases
- When cross-validation confidence is needed

---

## Complete File Manifest

```
judge_tests/
├── Flat Model Tests (8)
│   ├── test_A1_sonnet_sonnet_batch.md
│   ├── test_A1_sonnet_sonnet_sequential.md
│   ├── test_A2_sonnet_opus_batch.md
│   ├── test_A2_sonnet_opus_sequential.md
│   ├── test_B1_opus_sonnet_batch.md
│   ├── test_B1_opus_sonnet_sequential.md
│   ├── test_B2_opus_opus_batch.md
│   └── test_B2_opus_opus_sequential.md
├── Hierarchical C1 Tests (5)
│   ├── test_C1_run1.md
│   ├── test_C1_run2.md
│   ├── test_C1_run3.md
│   ├── test_C1_run4.md
│   └── test_C1_run5.md
├── Hierarchical C2 Tests (5)
│   ├── test_C2_run1.md
│   ├── test_C2_run2.md
│   ├── test_C2_run3.md
│   ├── test_C2_run4.md
│   └── test_C2_run5.md
├── HIERARCHICAL_COMPARISON.md (detailed variance analysis)
└── MODEL_COMPARISON_SUMMARY.md (this file)
```

---

## Conclusion

The hierarchical PR review architectures provide valuable capabilities:

1. **C1 (Three-Tier)**: Good for aggressive issue detection but with higher variance
2. **C2 (Dual-Pipeline)**: Best consistency through cross-validation
3. **Flat models**: Most cost-effective for routine reviews

**Final Recommendation**: For critical systems, use C2 dual-pipeline with multiple runs. For routine reviews, use B1 (Opus→Sonnet Batch) for best balance of quality and cost.
