# Judge Tests Study Overview (A–F Series)

**Scope:** These experiments compare multi-agent PR review architectures (scouts → judges → high judge) over the same 6 target files from PR #6 (`security-review/full-codebase-audit-2026-01-20`).  
**Models used:** Haiku 4.5, Sonnet 4.5, Opus 4.5.

## What This Study Was Trying To Answer

1. **Model pairing (flat pipeline):** Which scout/judge model combo gives the best coverage vs noise?
2. **Execution mode:** Is sequential judging worth it vs batch?
3. **Architecture:** Does a hierarchical “high judge” setup improve consistency/cross-validation?
4. **Scout scaling:** Can “more cheap scouts” (Haiku) substitute for fewer stronger scouts (Sonnet)?
5. **Accumulation:** If scouts see prior scout findings, do they find more *novel* issues?
6. **Saturation:** After enough runs, is there meaningful signal left?

## Key Findings (Condensed)

- **Batch > sequential:** Sequential judging cost ~1.5× more and produced worse confirm rates (no clear quality win).
- **Opus scouts are more consistent; Sonnet scouts are noisier but broader:** Sonnet scouts produced more findings but higher variance/false positives; Opus scouts were tighter and steadier.
- **Dual-pipeline hierarchical (Haiku+Sonnet) stabilizes *final* results via cross-validation:** Raw findings vary a lot, but consolidation is more consistent; lower final counts are largely **deduplication**, not “less coverage”.
- **Haiku scale-out doesn’t replace Sonnet depth:** A Haiku-heavy setup didn’t reliably increase CRITICAL/HIGH discovery and increased variance.
- **Accumulation works, then saturates:** Feeding prior scout findings reduces duplicates and yields diminishing returns; the study reports ~50–60 unique issues as the practical ceiling for this 6-file review set.

---

## Clean Test Catalog (What Each Test “Is”)

| Test ID | Category | What Changed / What It Tests | Pipeline (Scouts → Judges → High Judge) | Runs | Primary Output File(s) |
|---|---|---|---|---:|---|
| A1 (Batch) | Flat | Baseline: Sonnet scout+judge quality/noise | 6 Sonnet → 6 Sonnet | 1 | `test_A1_sonnet_sonnet_batch.md` |
| A1 (Seq) | Flat | Batch vs sequential judging | 6 Sonnet → 6 Sonnet | 1 | `test_A1_sonnet_sonnet_sequential.md` |
| A2 (Batch) | Flat | Judge upgrade: Sonnet scouts + Opus judges | 6 Sonnet → 6 Opus | 1 | `test_A2_sonnet_opus_batch.md` |
| A2 (Seq) | Flat | Batch vs sequential under Opus judging | 6 Sonnet → 6 Opus | 1 | `test_A2_sonnet_opus_sequential.md` |
| B1 (Batch) | Flat | Scout upgrade: Opus scouts + Sonnet judges | 6 Opus → 6 Sonnet | 1 | `test_B1_opus_sonnet_batch.md` |
| B1 (Seq) | Flat | Batch vs sequential under Opus scouting | 6 Opus → 6 Sonnet | 1 | `test_B1_opus_sonnet_sequential.md` |
| B2 (Batch) | Flat | “Max capability” flat: Opus scouts + Opus judges | 6 Opus → 6 Opus | 1 | `test_B2_opus_opus_batch.md` |
| B2 (Seq) | Flat | Batch vs sequential at max capability | 6 Opus → 6 Opus | 1 | `test_B2_opus_opus_sequential.md` |
| C1 | Hierarchical | Hierarchical baseline; measure variance across runs | 6 Sonnet → 6 Sonnet → 1 Opus | 5 | `test_C1_run[1-5].md` |
| C2 | Hierarchical | Add a Haiku scout pipeline for cross-validation | 6 Haiku + 6 Sonnet → 12 Sonnet → 1 Opus | 5 | `test_C2_run[1-5].md` |
| D1 | Volume | Baseline “balanced” dual scout pipeline (no accumulation) | 6 Haiku + 6 Sonnet → 12 Sonnet → 1 Opus | 5 | `test_D1_run[1-5].md` |
| D2 | Volume | Haiku-heavy: does 10× Haiku reduce variance / keep coverage? | 10 Haiku + 1 Sonnet → 11 Sonnet → 1 Opus | 5 | `test_D2_run[1-5].md` |
| E1 | Accumulation | Within-series accumulation: each run sees prior **scout** findings | (D1 pipeline) + accumulator | 5 | `test_E1_run[1-5].md` |
| E2 | Accumulation | Sequential Haiku accumulation + Sonnet merge (scout-only artifacts) | Scout-only (Haiku passes + Sonnet pass) | 3 artifacts | `test_E2_H1.md`, `test_E2_H2-H5.md`, `test_E2_S1.md` |
| F1 | Saturation | Final “full knowledge” Opus review to test saturation | Opus-only synthesis (given all prior findings) | 3 runs | `test_F1_run1.md`, `test_F1_runs2-3.md` |

---

## “Where Do I Look?” (Docs vs Raw Runs)

| If You Want… | Start Here |
|---|---|
| A/B flat-model head-to-head + costs | `MODEL_COMPARISON_SUMMARY.md` |
| C1 vs C2 hierarchical variance + interpretation | `HIERARCHICAL_COMPARISON.md` and `RAW_DATA.md` |
| D/E/F accumulation + saturation conclusions | `FINAL_SERIES_COMPARISON.md` |
| Actionable engineering plan by issue group | `ISSUE_GROUPS_FOR_PLANNING.md` |
| The exact code reviewed in the study | `reviewed_src/` |

---

## Notes / Integrity Caveats

- **Final issue counts are not directly comparable across architectures** when deduplication/cross-validation differs (e.g., C2’s “lower final count” is often overlap being merged).
- **Some tracking/docs are aspirational/out-of-sync** (e.g., `AGENT_TRACKING.md` references accumulator JSON files that are not present in this folder; F-series plan mentions 10 runs but only 3 run outputs exist).
- **F1 run 2–3 references `pattern-definition.repo.ts`**, which is outside the 6-file “standard set” for earlier series; treat that as scope creep when comparing.

