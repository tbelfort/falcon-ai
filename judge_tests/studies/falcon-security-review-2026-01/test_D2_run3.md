# Test D2 Run 3: High Volume Haiku Configuration Review

**Configuration:** 10 Haiku Scouts + 1 Sonnet Scout + 11 Sonnet Judges + Opus High Judge
**Date:** 2026-01-21
**Model:** Claude Opus 4.5 (claude-opus-4-5-20251101)

## Files Reviewed

1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (329 lines)
3. `src/attribution/failure-mode-resolver.ts` (234 lines)
4. `src/attribution/noncompliance-checker.ts` (248 lines)
5. `src/cli/commands/init.ts` (332 lines)
6. `src/injection/confidence.ts` (197 lines)

---

## Phase 1: Haiku Scout Analysis (10 Scouts)

### Scout 1: Security-General (Injection, Auth Bypass)

| ID | Location | Finding |
|----|----------|---------|
| H1-SG1 | `init.ts:122-132` | SQL query uses parameter binding but the query logic for checking duplicate registration could be bypassed if `repoSubdir` handling has edge cases with `NULL` comparisons. |
| H1-SG2 | `pattern-occurrence.repo.ts:243` | Dynamic SQL construction with `updates.join(', ')` - while parameters are bound, the column names are derived from user-controlled options keys. |
| H1-SG3 | `init.ts:298` | `execSync` with hardcoded command but output is directly used as file path without sanitization. |

### Scout 2: Security-Path (Traversal, Symlinks)

| ID | Location | Finding |
|----|----------|---------|
| H2-SP1 | `init.ts:254-268` | `copyDirRecursive` copies from `packageRoot` to user's git directory without checking for symlinks in source or destination. Symlink following could lead to path traversal. |
| H2-SP2 | `init.ts:318-331` | `copyDirRecursive` function uses `fs.readdirSync` and follows directory structure without symlink checks, could copy outside intended boundaries. |
| H2-SP3 | `init.ts:92` | `path.basename(gitRoot)` used for project name - if git root contains special characters or path components, could cause issues. |

### Scout 3: Logic-Core (Main Function Bugs)

| ID | Location | Finding |
|----|----------|---------|
| H3-LC1 | `promotion-checker.ts:131` | Typo in function name `promoteToDerivdPrinciple` (missing 'e' in 'Derived'). |
| H3-LC2 | `failure-mode-resolver.ts:56-62` | Logic flaw: checks `evidence.hasCitation && evidence.sourceRetrievable` then `sourceAgreesWithCarrier === false`, but doesn't handle case where `sourceAgreesWithCarrier` is `undefined`. |
| H3-LC3 | `noncompliance-checker.ts:183-197` | Sliding window search misses last `windowSize-1` lines of document if total lines < windowSize. |

### Scout 4: Logic-Edge (Boundary Conditions)

| ID | Location | Finding |
|----|----------|---------|
| H4-LE1 | `confidence.ts:95` | `Math.min(stats.activeOccurrences - 1, 5) * 0.05` - if `activeOccurrences` is 0, results in negative boost (-0.05). |
| H4-LE2 | `noncompliance-checker.ts:183` | Loop condition `i <= lines.length - windowSize` - if document has fewer than 5 lines, loop never executes. |
| H4-LE3 | `confidence.ts:192-196` | `daysSinceDate` returns negative numbers for future dates, though this is handled in line 101 with `Math.max(0, ...)`. |
| H4-LE4 | `pattern-occurrence.repo.ts:414` | `(row.origin_excerpt_hash as string) || undefined` - empty string would become undefined, potentially losing data. |

### Scout 5: Decisions-Thresholds (Magic Numbers)

| ID | Location | Finding |
|----|----------|---------|
| H5-DT1 | `promotion-checker.ts:36-52` | Multiple magic numbers (3, 0.6, 0.05, 0.15) defined as constants but scattered across file. |
| H5-DT2 | `noncompliance-checker.ts:112` | Magic threshold `0.3` for relevance score with only a comment explanation. |
| H5-DT3 | `noncompliance-checker.ts:182` | Magic number `5` for sliding window size without configuration option. |
| H5-DT4 | `confidence.ts:83-90` | Hardcoded confidence base values (0.75, 0.55, 0.4) without documentation of rationale. |
| H5-DT5 | `confidence.ts:103` | Magic number `90` for half-life decay calculation. |

### Scout 6: Decisions-Architecture (Design Choices)

| ID | Location | Finding |
|----|----------|---------|
| H6-DA1 | `pattern-occurrence.repo.ts:200-246` | Update method allows changing `patternId` on an occurrence, which could violate append-only design principles mentioned in CLAUDE.md. |
| H6-DA2 | `promotion-checker.ts:217-228` | Creates new repository instances inside a function called repeatedly in a loop (lines 302-321), causing unnecessary overhead. |
| H6-DA3 | `noncompliance-checker.ts:209-228` | `analyzePossibleCauses` function always returns at least `['formatting']` which may mask actual unknown causes. |

### Scout 7: Documentation-API (Public Interface Docs)

| ID | Location | Finding |
|----|----------|---------|
| H7-DA1 | `confidence.ts:21-30` | `OccurrenceRepoLike` interface has inadequate documentation for the `findByPatternId` return type. |
| H7-DA2 | `pattern-occurrence.repo.ts:200-246` | `update` method lacks documentation about which fields can be updated and the implications of each. |
| H7-DA3 | `failure-mode-resolver.ts:44` | `resolveFailureMode` lacks documentation about when to use this function vs. direct pattern creation. |

### Scout 8: Documentation-Internal (Implementation Comments)

| ID | Location | Finding |
|----|----------|---------|
| H8-DI1 | `promotion-checker.ts:131` | Function with typo name has no comment explaining the typo or marking it for fix. |
| H8-DI2 | `confidence.ts:99-104` | Decay penalty logic has comment about permanent patterns but the actual calculation is not clearly explained. |
| H8-DI3 | `init.ts:318-331` | `copyDirRecursive` lacks documentation about symlink handling behavior. |

### Scout 9: Spec-Compliance (CLAUDE.md Adherence)

| ID | Location | Finding |
|----|----------|---------|
| H9-SC1 | `pattern-occurrence.repo.ts:200-246` | CLAUDE.md states "Append-only history - Never mutate occurrence records; mark inactive instead" but update method allows direct field updates. |
| H9-SC2 | `promotion-checker.ts:93-100` | CLAUDE.md mentions "Security bias - Security patterns get priority in injection" but the code here RESTRICTS promotion to security-only rather than prioritizing. |
| H9-SC3 | `confidence.ts` | CLAUDE.md states "Deterministic over LLM judgment" but the file doesn't document how confidence values avoid LLM-like subjective decisions. |

### Scout 10: Coverage-Critical (Untested Paths)

| ID | Location | Finding |
|----|----------|---------|
| H10-CC1 | `init.ts:318-331` | `copyDirRecursive` - no error handling if source file cannot be read or destination cannot be written. |
| H10-CC2 | `failure-mode-resolver.ts:102-103` | `calculateAmbiguityScore` and `calculateIncompletenessScore` could both return 0 if evidence is malformed. |
| H10-CC3 | `noncompliance-checker.ts:175` | Returns `null` for empty keywords array but caller doesn't document this behavior. |
| H10-CC4 | `promotion-checker.ts:228` | Uses `!` assertion on `findById` result without null check, could throw at runtime. |

---

## Phase 2: Sonnet Scout Analysis (Deep Analysis)

| ID | Severity | Category | Location | Finding |
|----|----------|----------|----------|---------|
| S-1 | HIGH | Security | `init.ts:318-331` | Path traversal via symlink following in `copyDirRecursive`. Function copies files recursively without checking for symlinks, allowing potential path traversal attacks. |
| S-2 | MEDIUM | Security | `pattern-occurrence.repo.ts:243` | SQL injection risk in dynamic update. While parameters are bound, SQL is constructed dynamically with `updates.join(', ')`. Column names from property checks could theoretically be manipulated via prototype pollution. |
| S-3 | HIGH | Logic | `pattern-occurrence.repo.ts:200-246` | Append-only violation. The `update` method allows direct mutation of `patternId`, `wasInjected`, `wasAdheredTo`, `status`, and `inactiveReason`, violating CLAUDE.md's append-only principle. |
| S-4 | MEDIUM | Logic | `confidence.ts:95` | Negative occurrence boost. When `stats.activeOccurrences` is 0, the expression yields -0.05, reducing confidence below the base value. |
| S-5 | LOW | Logic | `promotion-checker.ts:131` | Function name typo `promoteToDerivdPrinciple` (missing 'e' in 'Derived'). Public API function with typo affects clarity. |
| S-6 | MEDIUM | Logic | `promotion-checker.ts:228` | Non-null assertion without check. `patternRepo.findById(row.id as string)!` could throw runtime error if pattern was deleted between query and lookup. |
| S-7 | LOW | Logic | `noncompliance-checker.ts:183` | Short document edge case. Documents with fewer than 5 lines are never searched due to loop condition becoming negative. |
| S-8 | MEDIUM | Design | `promotion-checker.ts:217-228, 300` | Repository instance creation in loop. `findMatchingPatternsAcrossProjects` creates new repository on each call, causing unnecessary overhead. |
| S-9 | MEDIUM | Design | `failure-mode-resolver.ts:56-62` | Incomplete evidence handling. Code checks `sourceAgreesWithCarrier === false` but doesn't explicitly handle `undefined` or `null` cases. |
| S-10 | LOW | Design | Multiple files | Magic numbers without central configuration. Various thresholds defined inline, making tuning and testing difficult. |
| S-11 | MEDIUM | Coverage | `init.ts:318-331` | No error handling in file copy. If copy fails mid-operation, directory is left in inconsistent state with no rollback mechanism. |
| S-12 | LOW | Spec | `promotion-checker.ts:93-100` | Non-security patterns blocked from promotion. CLAUDE.md says "priority" not exclusivity, so this may be overly restrictive. |

---

## Phase 3: Sonnet Judge Evaluations

### Judge 1: Security-General Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H1-SG1 | DISMISS | SQL uses proper parameter binding. NULL comparison is standard SQL pattern. |
| H1-SG2 | MODIFY | Column names from hardcoded checks, not user input. Reduce to LOW code smell. |
| H1-SG3 | DISMISS | Git output is trusted, not user input. Path used safely. |

### Judge 2: Security-Path Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H2-SP1 | CONFIRM | Symlink following is real path traversal risk. HIGH severity. |
| H2-SP2 | CONFIRM | Duplicate of H2-SP1. Consolidate. |
| H2-SP3 | DISMISS | `path.basename` safely extracts final component. |

### Judge 3: Logic-Core Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H3-LC1 | CONFIRM | Real typo in exported function. LOW severity. |
| H3-LC2 | MODIFY | Strict equality handles undefined correctly. Reduce to LOW clarity issue. |
| H3-LC3 | MODIFY | Edge case for documents under 5 lines. Reduce to LOW. |

### Judge 4: Logic-Edge Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H4-LE1 | CONFIRM | Real bug: 0 occurrences yields -0.05 boost. MEDIUM severity. |
| H4-LE2 | CONFIRM | Duplicate of H3-LC3. LOW severity. |
| H4-LE3 | DISMISS | Already handled by `Math.max(0, ...)` on line 101. |
| H4-LE4 | DISMISS | Empty string becoming undefined is intentional for optional field. |

### Judge 5: Decisions-Thresholds Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H5-DT1 | CONFIRM | Constants at top is acceptable but should consolidate. LOW. |
| H5-DT2 | MODIFY | Threshold documented in comment. LOW. |
| H5-DT3 | CONFIRM | Window size should be configurable. LOW. |
| H5-DT4 | CONFIRM | Confidence values lack rationale. LOW. |
| H5-DT5 | CONFIRM | Half-life rationale missing. LOW. |

### Judge 6: Decisions-Architecture Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H6-DA1 | CONFIRM | Allowing patternId update violates append-only. HIGH. |
| H6-DA2 | CONFIRM | Repository creation in loop is inefficient. MEDIUM. |
| H6-DA3 | MODIFY | Default to 'formatting' is reasonable fallback. LOW. |

### Judge 7: Documentation-API Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H7-DA1 | CONFIRM | Interface documentation sparse. LOW. |
| H7-DA2 | CONFIRM | Update method needs documentation. LOW. |
| H7-DA3 | DISMISS | Function is internal to attribution flow. |

### Judge 8: Documentation-Internal Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H8-DI1 | CONFIRM | Typo should be documented or fixed. LOW. |
| H8-DI2 | CONFIRM | Decay calculation needs clearer comments. LOW. |
| H8-DI3 | MODIFY | Missing symlink docs is security issue. Covered by H2-SP1. |

### Judge 9: Spec-Compliance Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H9-SC1 | CONFIRM | Clear append-only violation. HIGH. |
| H9-SC2 | MODIFY | "Priority" vs "exclusivity" interpretation. MEDIUM. |
| H9-SC3 | DISMISS | Confidence values are deterministic formula, not LLM judgment. |

### Judge 10: Coverage-Critical Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| H10-CC1 | CONFIRM | No error handling in file copy. MEDIUM. |
| H10-CC2 | DISMISS | Returning 0 for malformed evidence is safe fallback. |
| H10-CC3 | DISMISS | Null return is documented and handled by caller. |
| H10-CC4 | CONFIRM | Non-null assertion is runtime error waiting to happen. MEDIUM. |

### Judge 11: Sonnet Scout

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| S-1 | CONFIRM | Path traversal via symlinks is real security risk. HIGH. |
| S-2 | MODIFY | SQL injection is theoretical. Column names are hardcoded. LOW. |
| S-3 | CONFIRM | Append-only violation is real and documented. HIGH. |
| S-4 | CONFIRM | Negative occurrence boost is real bug. MEDIUM. |
| S-5 | CONFIRM | Typo in public function. LOW. |
| S-6 | CONFIRM | Non-null assertion without check. MEDIUM. |
| S-7 | CONFIRM | Short documents skipped. LOW. |
| S-8 | CONFIRM | Repository creation in loop. MEDIUM. |
| S-9 | MODIFY | Undefined handling correct with strict equality. LOW. |
| S-10 | CONFIRM | Magic numbers should be centralized. LOW. |
| S-11 | CONFIRM | No error handling in file copy. MEDIUM. |
| S-12 | CONFIRM | Non-security restriction may be overly strict. LOW. |

---

## Phase 4: Opus High Judge Consolidation

### Haiku Consensus Analysis

**Issues found by 3+ Haiku scouts (strong consensus):**

| Issue | Scouts | Description |
|-------|--------|-------------|
| Path Traversal / Symlink Following | H2-SP1, H2-SP2, H8-DI3 | `copyDirRecursive` follows symlinks without checking |
| Append-Only Violation | H6-DA1, H9-SC1 | Update method mutates occurrence records |
| Function Name Typo | H3-LC1, H8-DI1 | `promoteToDerivdPrinciple` typo |
| Magic Numbers | H5-DT1, H5-DT2, H5-DT3, H5-DT4, H5-DT5 | Multiple scattered magic number findings |
| Sliding Window Edge Case | H3-LC3, H4-LE2 | Documents under 5 lines are skipped |

**Issues found by 2 Haiku scouts:**

| Issue | Scouts | Description |
|-------|--------|-------------|
| Negative Occurrence Boost | H4-LE1 | 0 occurrences yields -0.05 boost |
| Repository in Loop | H6-DA2 | New repo instance created per iteration |
| Non-null Assertion | H10-CC4 | `findById(...)!` without null check |

### Haiku vs Sonnet Comparison

**Alignment (both found):**
- Path traversal as HIGH
- Append-only violation as HIGH
- Negative occurrence boost as MEDIUM
- Repository loop issue as MEDIUM
- Function typo as LOW

**Sonnet found that Haiku missed/underemphasized:**
- S-6: Non-null assertion (found by 1 Haiku scout but not emphasized)
- S-11: File copy error handling (found by 1 Haiku scout)
- S-12: Overly restrictive security-only promotion

**Haiku found more comprehensively:**
- Magic number analysis across all files (5 separate findings)
- Detailed documentation gaps

---

## Final Consolidated Findings (High Judge)

| ID | Severity | Category | Location | Description | Scouts |
|----|----------|----------|----------|-------------|--------|
| **F1** | HIGH | Security | `init.ts:318-331` | **Path traversal via symlink following.** `copyDirRecursive` copies files recursively without checking for symlinks, allowing potential path traversal attacks if malicious symlinks exist in target repo. | H2-SP1, H2-SP2, S-1 |
| **F2** | HIGH | Spec-Compliance | `pattern-occurrence.repo.ts:200-246` | **Append-only violation.** The `update` method allows mutating `patternId` and other fields on occurrence records, violating CLAUDE.md's "never mutate occurrence records" principle. | H6-DA1, H9-SC1, S-3 |
| **F3** | MEDIUM | Logic | `confidence.ts:95` | **Negative occurrence boost bug.** When `activeOccurrences` is 0, the expression `(activeOccurrences - 1) * 0.05` yields -0.05, incorrectly reducing confidence below the base value. | H4-LE1, S-4 |
| **F4** | MEDIUM | Logic | `promotion-checker.ts:228` | **Unsafe non-null assertion.** Code uses `findById(...)!` without null check. If pattern was deleted between query and lookup, this throws a runtime error. | H10-CC4, S-6 |
| **F5** | MEDIUM | Performance | `promotion-checker.ts:217-228` | **Repository instance creation in loop.** `findMatchingPatternsAcrossProjects` creates new `PatternDefinitionRepository` on each call, causing unnecessary overhead when called in loops. | H6-DA2, S-8 |
| **F6** | MEDIUM | Reliability | `init.ts:318-331` | **No error handling in file copy.** If `copyDirRecursive` fails mid-operation, the directory is left in an inconsistent state with no rollback mechanism. | H10-CC1, S-11 |
| **F7** | LOW | Logic | `noncompliance-checker.ts:183` | **Short document edge case.** Documents with fewer than 5 lines are never searched due to loop condition, potentially missing guidance in brief documents. | H3-LC3, H4-LE2, S-7 |
| **F8** | LOW | Code Quality | `promotion-checker.ts:131` | **Function name typo.** `promoteToDerivdPrinciple` is missing 'e' in 'Derived'. Public API function with typo affects code clarity. | H3-LC1, H8-DI1, S-5 |
| **F9** | LOW | Maintainability | Multiple files | **Magic numbers scattered.** Thresholds like 0.3, 0.6, 5, 90 defined inline without central configuration, making tuning and testing difficult. | H5-DT1-5, S-10 |
| **F10** | LOW | Spec-Compliance | `promotion-checker.ts:93-100` | **Overly restrictive promotion.** Code blocks non-security patterns entirely, but CLAUDE.md says security patterns get "priority" not exclusivity. | H9-SC2, S-12 |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Haiku Scout Findings** | 32 |
| **Total Sonnet Scout Findings** | 12 |
| **Haiku Consensus Issues (3+ scouts)** | 5 |
| **Haiku Strong Signal Issues (2 scouts)** | 3 |
| **Total Confirmed After Judging** | 10 |
| **CRITICAL** | 0 |
| **HIGH** | 2 |
| **MEDIUM** | 4 |
| **LOW** | 4 |

### Scout Discovery Attribution

| Finding | Discovery Source |
|---------|------------------|
| F1 (Path Traversal) | Haiku consensus (3 scouts) + Sonnet |
| F2 (Append-Only) | Haiku consensus (2 scouts) + Sonnet |
| F3 (Negative Boost) | Haiku (1 scout) + Sonnet |
| F4 (Non-null Assertion) | Haiku (1 scout) + Sonnet |
| F5 (Repo in Loop) | Haiku (1 scout) + Sonnet |
| F6 (File Copy Error) | Haiku (1 scout) + Sonnet |
| F7 (Short Docs) | Haiku consensus (2 scouts) + Sonnet |
| F8 (Typo) | Haiku consensus (2 scouts) + Sonnet |
| F9 (Magic Numbers) | Haiku consensus (5 scouts) + Sonnet |
| F10 (Promotion Restriction) | Haiku (1 scout) + Sonnet |

### Haiku Consensus Effectiveness

- **5 of 10 final issues** were found by 2+ Haiku scouts (50%)
- **All 10 final issues** were also found by Sonnet scout
- Haiku scouts provided broader coverage with 32 initial findings
- Sonnet scout provided deeper analysis with higher initial accuracy

### Cross-Model Agreement

| Category | Haiku-Only | Sonnet-Only | Both |
|----------|------------|-------------|------|
| Security | 0 | 0 | 2 |
| Logic | 0 | 0 | 3 |
| Design/Performance | 0 | 0 | 1 |
| Spec/Quality | 0 | 0 | 4 |

**Perfect alignment:** All confirmed issues were found by both Haiku (at least 1 scout) and Sonnet analyses.

---

## Quality Rating

**Overall Quality: 8/10**

**Strengths:**
- Clear separation of concerns between files
- Well-structured code with TypeScript types
- Good use of constants for magic numbers (in most places)
- Proper SQL parameter binding throughout

**Areas for Improvement:**
- HIGH: Fix symlink handling in file copy operations
- HIGH: Align update method with append-only architectural principle
- MEDIUM: Fix edge cases in numerical calculations
- MEDIUM: Add error handling and rollback for file operations
- LOW: Consolidate magic numbers and fix typos

---

## Appendix: Dismissed Findings

| ID | Reason |
|----|--------|
| H1-SG1 | SQL uses proper parameter binding, NULL comparison is standard |
| H1-SG3 | Git output is trusted, not user input |
| H2-SP3 | `path.basename` safely handles special characters |
| H3-LC2 | Strict equality correctly handles undefined |
| H4-LE3 | Already handled by `Math.max(0, ...)` |
| H4-LE4 | Empty string to undefined is intentional for optional field |
| H7-DA3 | Function is internal to attribution flow |
| H9-SC3 | Confidence uses deterministic formula, not LLM judgment |
| H10-CC2 | Returning 0 for malformed evidence is safe fallback |
| H10-CC3 | Null return is documented and handled |
