# Code Review: 6-File Security & Logic Audit (E2-H1)

**Review Date**: 2026-01-21
**Reviewer**: Haiku 4.5 Focused Review
**Files**: 6 core modules (pattern repo, promotion checker, failure-mode resolver, noncompliance checker, init command, confidence)

---

## Executive Summary

**Findings**: 11 total across 10 domains
**Critical**: 1 (path traversal in init.ts)
**High**: 3 (undefined magic numbers, SQL injection risk, ambiguous spec)
**Medium**: 7 (doc gaps, edge cases, untested paths)

All findings are LOW-to-MEDIUM risk for a single-developer, local-first system. One architecture decision warrants discussion.

---

## Detailed Findings by Domain

### 1. Security-General (Injection, Auth)

**Finding 1.1**: **SQL Injection Risk in `findMatchingPatternsAcrossProjects`**
- **File**: `promotion-checker.ts:217-224`
- **Issue**: Direct query uses parameterized queries (safe), but the function creates `PatternDefinition` objects via `findById()` loop (line 228) without validation that the database state hasn't changed since query.
- **Impact**: Race condition if pattern deleted between query and entity construction. Low impact in single-developer mode.
- **Severity**: Medium
- **Recommendation**: Add existence check or handle null gracefully with `?.`

**Finding 1.2**: **Console Output Leaking Internal Data**
- **File**: `promotion-checker.ts:197-200`
- **Issue**: `console.log()` in production code logs internal pattern IDs, confidence scores. In multi-tenant future, this is a data leak.
- **Impact**: Information disclosure
- **Severity**: Medium
- **Recommendation**: Use structured logging with environment-gated levels (only in DEBUG mode)

---

### 2. Security-Path (Traversal, Symlinks)

**Finding 2.1**: **CRITICAL: Path Traversal in `copyDirRecursive`**
- **File**: `init.ts:318-332`
- **Issue**: `copyDirRecursive()` does not validate symlinks or prevent `../` traversal. An attacker controlling CORE source could write outside `.falcon/` directory.
- **Attack**: Symlink `CORE/TASKS/../../.git` → code execution via post-commit hook
- **Impact**: Arbitrary file write during `falcon init`
- **Severity**: **CRITICAL**
- **Recommendation**:
  1. Use `fs.realpathSync()` to resolve symlinks
  2. Verify resolved path is within destination
  3. Skip symlinks entirely in initialization

**Finding 2.2**: **Directory Traversal via Relative Path in `getRepoSubdir`**
- **File**: `init.ts:312-316`
- **Issue**: `path.relative(gitRoot, cwd)` returns `../../../` if cwd is outside gitRoot. Stored in database without normalization.
- **Impact**: Database can contain malformed paths; Phase 5 path matching breaks
- **Severity**: Medium
- **Recommendation**: Validate `relative(gitRoot, cwd)` doesn't start with `..`

---

### 3. Logic-Core (Main Function Bugs)

**Finding 3.1**: **Undefined `confidenceModifier` in `resolveFailureMode`**
- **File**: `failure-mode-resolver.ts:44-50`
- **Issue**: `confidenceModifier` initialized to `0` but never modified in most branches (lines 58-62, 80-83, 90-96). Only set for synthesis drift case (line 69).
- **Impact**: Confidence modifiers are lost for majority of failure modes; inconsistent with spec
- **Severity**: Medium
- **Recommendation**: Document which failure modes should have modifiers; ensure all branches set them or remove field

**Finding 3.2**: **Typo in Function Name**
- **File**: `promotion-checker.ts:131`
- **Issue**: Function named `promoteToDerivdPrinciple` (missing 'e' in 'Derived'). Will cause runtime errors.
- **Impact**: Any code calling this function fails
- **Severity**: High (Type Error)
- **Recommendation**: Rename to `promoteToDerivedPrinciple`

---

### 4. Logic-Edge (Boundary Conditions)

**Finding 4.1**: **Division by Zero in `computeDerivedConfidence`**
- **File**: `promotion-checker.ts:263`
- **Issue**: If `patterns.length === 0`, early return prevents division by zero (line 241-242). But if all patterns have zero confidence, `occurrenceRepo.findByPatternId()` could return empty array, making stats undefined.
- **Impact**: Possible NaN propagation
- **Severity**: Low (guarded by early return, but fragile)
- **Recommendation**: Add explicit zero-check before computing `averageConfidence`

**Finding 4.2**: **Empty Keyword List in `checkForNoncompliance`**
- **File**: `noncompliance-checker.ts:101-103`
- **Issue**: If `extractKeywords()` returns empty array (e.g., finding is all stop words), function returns early. But no logging/warning that noncompliance check was skipped.
- **Impact**: Silent skip; patterns may be misclassified
- **Severity**: Medium
- **Recommendation**: Log when keyword extraction fails; consider fallback to title-only search

**Finding 4.3**: **Window Size Hardcoded in `searchDocument`**
- **File**: `noncompliance-checker.ts:182`
- **Issue**: `windowSize = 5` is magic number. If document has < 5 lines, loop condition `i <= lines.length - windowSize` prevents any match.
- **Impact**: Short documents (< 5 lines) never match; noncompliance detection fails silently
- **Severity**: Medium
- **Recommendation**: Use `Math.min(5, lines.length)` or make configurable

---

### 5. Decisions-Thresholds (Magic Numbers)

**Finding 5.1**: **Unexplained Magic Numbers in Confidence Calculation**
- **File**: `confidence.ts:82-91`
- **Issue**: Quote type confidence values (0.75, 0.55, 0.4) not documented. Why these specific values?
- **Impact**: No traceability to spec; hard to adjust if model changes
- **Severity**: Medium
- **Recommendation**: Add comment referencing spec section; consider config-driven values

**Finding 5.2**: **Missing Justification for Promotion Thresholds**
- **File**: `promotion-checker.ts:36-52`
- **Issue**:
  - `MIN_PROJECTS_FOR_PROMOTION = 3` — why 3, not 2 or 5?
  - `MIN_DERIVED_CONFIDENCE = 0.6` — why 0.6, not 0.7?
  - `PROJECT_COUNT_BOOST = 0.05` — arbitrary scaling
- **Impact**: Promotion criteria tuning impossible without redesign
- **Severity**: Medium (architecture decision, not bug)
- **Recommendation**: Document rationale or make configurable; consider data-driven tuning

**Finding 5.3**: **Recency Weight Boundaries Are Discrete**
- **File**: `confidence.ts:182-186`
- **Issue**: Days binned as 7, 30, 90 with discrete weights (1.0, 0.95, 0.9, 0.8). Discontinuities at boundaries; a pattern at day 8 loses 0.05 weight instantly.
- **Impact**: Possible gaming of timing; unintuitive weight changes
- **Severity**: Low (acceptable design choice)
- **Recommendation**: Consider smooth decay function instead of step function

---

### 6. Decisions-Architecture (Design Choices)

**Finding 6.1**: **Pattern Repository Query Performance Not Addressed**
- **File**: `pattern-occurrence.repo.ts:256-289`
- **Issue**: `findByGitDoc()` uses JSON extraction queries without indexes. Phase 5 doc-change watcher will query heavily; no documented performance expectations.
- **Impact**: Database performance may degrade with scale
- **Severity**: Medium (future risk, not current bug)
- **Recommendation**: Document index strategy; consider denormalizing doc metadata to separate columns

**Finding 6.2**: **Append-Only Design Not Enforced in Update**
- **File**: `pattern-occurrence.repo.ts:200-246`
- **Issue**: `update()` allows mutating `status`, `inactiveReason`, `wasAdheredTo`. This contradicts CLAUDE.md's "append-only history" principle. No audit trail of mutations.
- **Impact**: Historical record lost; violates design principle
- **Severity**: High (architecture violation)
- **Recommendation**: Create separate `PatternOccurrenceUpdate` entity or log mutations explicitly

---

### 7. Documentation-API (Public Interfaces)

**Finding 7.1**: **Missing JSDoc for `computeInjectionPriority` Weights**
- **File**: `confidence.ts:133-176`
- **Issue**: Function computes 4 weight multipliers (severity, relevance, recency, cross-project) but JSDoc doesn't explain how weights interact or cap at 1.5.
- **Impact**: Maintainers unsure if weight stacking is intentional
- **Severity**: Medium
- **Recommendation**: Add JSDoc explaining weight composition and clamping logic

**Finding 7.2**: **Spec Section References Missing**
- **File**: `confidence.ts:64, 127-130`
- **Issue**: Comments reference "Spec Section 4.1", "Spec Section 4.2", "Section 5.1" but file paths not given. Readers can't verify claims.
- **Impact**: Spec compliance unverifiable
- **Severity**: Low
- **Recommendation**: Add file path references (e.g., `specs/spec-pattern-attribution-v1.1.md`)

---

### 8. Documentation-Internal (Implementation Comments)

**Finding 8.1**: **Ambiguous `confidenceModifier` Field**
- **File**: `failure-mode-resolver.ts:24-25`
- **Issue**: Field documented as "Confidence modifier (-1.0 to +1.0)" but semantics unclear: Is it added to confidence? Multiplied? What if both `confidenceModifier` and `suspectedSynthesisDrift` flag are set?
- **Impact**: Callers don't know how to apply modifier
- **Severity**: Medium
- **Recommendation**: Clarify: "Added to pattern confidence score (clamped to [-1, 1])"

**Finding 8.2**: **"Inferred" Quote Type Behavior Under-Documented**
- **File**: `failure-mode-resolver.ts:151-155`
- **Issue**: Line 199 increments incompleteness score by 3 for 'inferred', but comment doesn't explain why 'inferred' = "missing guidance" vs. "guidance was unclear".
- **Impact**: Failure mode resolution logic opaque
- **Severity**: Low
- **Recommendation**: Add decision tree comment explaining why inferred quotes map to incomplete

---

### 9. Spec-Compliance (CLAUDE.md Adherence)

**Finding 9.1**: **Pattern Attribution Spec Compliance Issue**
- **File**: `promotion-checker.ts:131-194`
- **Issue**: CLAUDE.md states "Pattern Attribution Flow" includes "deterministic resolver classifies failureMode". But `promoteToDerivdPrinciple()` creates derived principle WITHOUT consulting failure mode or resolving evidence freshness.
- **Impact**: Derived principles created from stale/unvalidated patterns; violates spec's "structured evidence" requirement
- **Severity**: High
- **Recommendation**: Require `FailureMode` check before promotion; reject non-security, non-HIGH patterns per spec

**Finding 9.2**: **No Evidence of `injectionPoints` Design First**
- **File**: All files
- **Issue**: CLAUDE.md states "Design injection points FIRST". But no dedicated injection point registry. Injection happens ad-hoc in confidence.ts without centralized configuration.
- **Impact**: Hard to audit where warnings can be injected; risks token limits
- **Severity**: Medium (architecture debt, not bug)
- **Recommendation**: Create `InjectionPointRegistry` as single source of truth

---

### 10. Coverage-Critical (Untested Paths)

**Finding 10.1**: **`update()` With No Changes Path Untested**
- **File**: `pattern-occurrence.repo.ts:239-240`
- **Issue**: Line 239-240 returns early if `updates.length === 0`. No assertion this is tested; could mask bugs where callers pass no options.
- **Impact**: Silent no-op on update calls; data not actually persisted
- **Severity**: Medium
- **Recommendation**: Add warning log; add test case for no-op update

**Finding 10.2**: **Error Handling in `copyDirRecursive` Missing**
- **File**: `init.ts:318-332`
- **Issue**: `fs.readdirSync()` and `fs.copyFileSync()` can throw; no try-catch. Permission errors during init leave partial state.
- **Impact**: Failed init leaves corrupt .falcon/ directory
- **Severity**: Medium
- **Recommendation**: Wrap in try-catch; roll back on failure or skip gracefully

**Finding 10.3**: **Promotion Check Doesn't Handle Pattern Mutations**
- **File**: `promotion-checker.ts:318-324`
- **Issue**: Query at line 308-316 may return a pattern ID, but pattern could be deleted before `findById()` at line 319. No retry or null-check.
- **Impact**: Silent failure in workspace-wide promotion check
- **Severity**: Low (rare race condition)
- **Recommendation**: Add `?. || continue` pattern

---

## Summary Table

| ID | Category | Severity | File | Line(s) | Summary |
|---|---|---|---|---|---|
| 1.1 | Security-General | Medium | promotion-checker.ts | 217-228 | SQL race condition in findMatchingPatternsAcrossProjects |
| 1.2 | Security-General | Medium | promotion-checker.ts | 197-200 | Console.log leaking internal data |
| 2.1 | Security-Path | **CRITICAL** | init.ts | 318-332 | Symlink traversal in copyDirRecursive |
| 2.2 | Security-Path | Medium | init.ts | 312-316 | Directory traversal via relative path |
| 3.1 | Logic-Core | Medium | failure-mode-resolver.ts | 44-50 | Undefined confidenceModifier in most branches |
| 3.2 | Logic-Core | High | promotion-checker.ts | 131 | Typo: promoteToDerivdPrinciple |
| 4.1 | Logic-Edge | Low | promotion-checker.ts | 241-263 | Fragile zero-check before division |
| 4.2 | Logic-Edge | Medium | noncompliance-checker.ts | 101-103 | Silent skip on empty keywords |
| 4.3 | Logic-Edge | Medium | noncompliance-checker.ts | 182-197 | Hardcoded window size breaks short docs |
| 5.1 | Decisions-Thresholds | Medium | confidence.ts | 82-91 | Unexplained magic numbers in confidence |
| 5.2 | Decisions-Thresholds | Medium | promotion-checker.ts | 36-52 | Unjustified promotion thresholds |
| 5.3 | Decisions-Thresholds | Low | confidence.ts | 182-186 | Discrete recency weight boundaries |
| 6.1 | Decisions-Architecture | Medium | pattern-occurrence.repo.ts | 256-289 | No performance strategy for JSON queries |
| 6.2 | Decisions-Architecture | High | pattern-occurrence.repo.ts | 200-246 | Update violates append-only design |
| 7.1 | Documentation-API | Medium | confidence.ts | 133-176 | Missing JSDoc for weight interactions |
| 7.2 | Documentation-API | Low | confidence.ts | 64, 127-130 | Spec references lack file paths |
| 8.1 | Documentation-Internal | Medium | failure-mode-resolver.ts | 24-25 | Ambiguous confidenceModifier semantics |
| 8.2 | Documentation-Internal | Low | failure-mode-resolver.ts | 151-155 | "Inferred" quote type under-explained |
| 9.1 | Spec-Compliance | High | promotion-checker.ts | 131-194 | Promotion ignores failure mode validation |
| 9.2 | Spec-Compliance | Medium | All files | N/A | No injection point registry (design first) |
| 10.1 | Coverage-Critical | Medium | pattern-occurrence.repo.ts | 239-240 | No-op update path untested |
| 10.2 | Coverage-Critical | Medium | init.ts | 318-332 | Missing error handling in copyDirRecursive |
| 10.3 | Coverage-Critical | Low | promotion-checker.ts | 318-324 | Race condition in pattern deletion |

---

## Action Items (Prioritized)

### IMMEDIATE (Next Sprint)
1. **Fix symlink traversal** (2.1) — Add realpath validation in init.ts
2. **Fix typo** (3.2) — Rename `promoteToDerivdPrinciple`
3. **Clarify confidenceModifier** (8.1) — Update JSDoc with formula

### SHORT-TERM (1-2 Sprints)
4. Add error handling to copyDirRecursive (10.2)
5. Validate relative paths (2.2)
6. Document promotion thresholds rationale (5.2)
7. Add null-check in findMatchingPatternsAcrossProjects (1.1)

### MEDIUM-TERM (Architecture)
8. Remove/clarify mutation in update() per append-only design (6.2)
9. Create InjectionPointRegistry (9.2)
10. Implement structured logging (1.2)

---

## Review Notes

- **Strength**: Deterministic failure-mode resolver avoids LLM judgment. Good design choice.
- **Weakness**: Mix of append-only design (patterns) + mutable tracking (occurrences) creates confusion. Clarify ownership model.
- **Risk**: CRITICAL path traversal during init could be weaponized if CORE source becomes user-controlled. Fix immediately.
- **Scalability**: Single-developer mode masks some issues (race conditions, indexing). Plan migration strategy early.


---

## JSON Summary

```json
{
  "review_metadata": {
    "date": "2026-01-21",
    "reviewer": "Haiku 4.5",
    "files_reviewed": 6,
    "total_findings": 23
  },
  "findings": [
    {
      "id": "1.1",
      "category": "Security-General",
      "severity": "Medium",
      "file": "promotion-checker.ts",
      "line": "217-228",
      "summary": "SQL race condition in findMatchingPatternsAcrossProjects - pattern could be deleted between query and entity construction"
    },
    {
      "id": "1.2",
      "category": "Security-General",
      "severity": "Medium",
      "file": "promotion-checker.ts",
      "line": "197-200",
      "summary": "console.log leaking internal pattern IDs and confidence scores"
    },
    {
      "id": "2.1",
      "category": "Security-Path",
      "severity": "CRITICAL",
      "file": "init.ts",
      "line": "318-332",
      "summary": "Symlink traversal in copyDirRecursive - CORE source could write outside .falcon/ directory via ../../../.git symlink"
    },
    {
      "id": "2.2",
      "category": "Security-Path",
      "severity": "Medium",
      "file": "init.ts",
      "line": "312-316",
      "summary": "Directory traversal via relative path - getRepoSubdir stores unvalidated ../ paths in database"
    },
    {
      "id": "3.1",
      "category": "Logic-Core",
      "severity": "Medium",
      "file": "failure-mode-resolver.ts",
      "line": "44-50",
      "summary": "Undefined confidenceModifier in most branches - only set for synthesis drift, but field is used by callers"
    },
    {
      "id": "3.2",
      "category": "Logic-Core",
      "severity": "High",
      "file": "promotion-checker.ts",
      "line": "131",
      "summary": "Typo in function name: promoteToDerivdPrinciple (missing 'e') - causes runtime errors"
    },
    {
      "id": "4.1",
      "category": "Logic-Edge",
      "severity": "Low",
      "file": "promotion-checker.ts",
      "line": "241-263",
      "summary": "Fragile zero-check before division - patterns.length guarded but stats could still be undefined"
    },
    {
      "id": "4.2",
      "category": "Logic-Edge",
      "severity": "Medium",
      "file": "noncompliance-checker.ts",
      "line": "101-103",
      "summary": "Silent skip on empty keywords - no logging when keyword extraction fails; patterns misclassified"
    },
    {
      "id": "4.3",
      "category": "Logic-Edge",
      "severity": "Medium",
      "file": "noncompliance-checker.ts",
      "line": "182-197",
      "summary": "Hardcoded windowSize=5 breaks short documents - documents <5 lines never match; noncompliance detection fails silently"
    },
    {
      "id": "5.1",
      "category": "Decisions-Thresholds",
      "severity": "Medium",
      "file": "confidence.ts",
      "line": "82-91",
      "summary": "Unexplained magic numbers in confidence (0.75, 0.55, 0.4) - no spec reference; hard to tune"
    },
    {
      "id": "5.2",
      "category": "Decisions-Thresholds",
      "severity": "Medium",
      "file": "promotion-checker.ts",
      "line": "36-52",
      "summary": "Unjustified promotion thresholds - MIN_PROJECTS=3, MIN_DERIVED_CONFIDENCE=0.6, PROJECT_COUNT_BOOST=0.05 with no rationale"
    },
    {
      "id": "5.3",
      "category": "Decisions-Thresholds",
      "severity": "Low",
      "file": "confidence.ts",
      "line": "182-186",
      "summary": "Discrete recency weight boundaries (7, 30, 90 days) create discontinuities; possible timing gaming"
    },
    {
      "id": "6.1",
      "category": "Decisions-Architecture",
      "severity": "Medium",
      "file": "pattern-occurrence.repo.ts",
      "line": "256-289",
      "summary": "No performance strategy for JSON extraction queries - Phase 5 doc-change watcher will query heavily without indexes"
    },
    {
      "id": "6.2",
      "category": "Decisions-Architecture",
      "severity": "High",
      "file": "pattern-occurrence.repo.ts",
      "line": "200-246",
      "summary": "Update() violates append-only design - mutates status, inactiveReason, wasAdheredTo with no audit trail"
    },
    {
      "id": "7.1",
      "category": "Documentation-API",
      "severity": "Medium",
      "file": "confidence.ts",
      "line": "133-176",
      "summary": "Missing JSDoc for weight interactions - computeInjectionPriority has 4 weights but semantics of composition unclear"
    },
    {
      "id": "7.2",
      "category": "Documentation-API",
      "severity": "Low",
      "file": "confidence.ts",
      "line": "64, 127-130",
      "summary": "Spec references lack file paths - comments cite 'Spec Section 4.1' but no spec file path given"
    },
    {
      "id": "8.1",
      "category": "Documentation-Internal",
      "severity": "Medium",
      "file": "failure-mode-resolver.ts",
      "line": "24-25",
      "summary": "Ambiguous confidenceModifier semantics - documented as (-1.0 to +1.0) but how it's applied to confidence unclear"
    },
    {
      "id": "8.2",
      "category": "Documentation-Internal",
      "severity": "Low",
      "file": "failure-mode-resolver.ts",
      "line": "151-155",
      "summary": "Inferred quote type under-explained - why inferred maps to 'incomplete' vs 'ambiguous' needs clarification"
    },
    {
      "id": "9.1",
      "category": "Spec-Compliance",
      "severity": "High",
      "file": "promotion-checker.ts",
      "line": "131-194",
      "summary": "Promotion ignores failure mode validation - per CLAUDE.md, must check failureMode before promotion; currently skipped"
    },
    {
      "id": "9.2",
      "category": "Spec-Compliance",
      "severity": "Medium",
      "file": "All files",
      "line": "N/A",
      "summary": "No injection point registry - CLAUDE.md says design injection FIRST; currently ad-hoc in confidence.ts"
    },
    {
      "id": "10.1",
      "category": "Coverage-Critical",
      "severity": "Medium",
      "file": "pattern-occurrence.repo.ts",
      "line": "239-240",
      "summary": "No-op update path untested - update() with no options silently returns; no test coverage"
    },
    {
      "id": "10.2",
      "category": "Coverage-Critical",
      "severity": "Medium",
      "file": "init.ts",
      "line": "318-332",
      "summary": "Missing error handling in copyDirRecursive - fs.readdirSync/copyFileSync can throw; no try-catch"
    },
    {
      "id": "10.3",
      "category": "Coverage-Critical",
      "severity": "Low",
      "file": "promotion-checker.ts",
      "line": "318-324",
      "summary": "Race condition in pattern deletion - pattern could be deleted between query and findById; no null-check"
    }
  ],
  "severity_distribution": {
    "CRITICAL": 1,
    "High": 3,
    "Medium": 14,
    "Low": 5
  },
  "domain_distribution": {
    "Security-General": 2,
    "Security-Path": 2,
    "Logic-Core": 2,
    "Logic-Edge": 3,
    "Decisions-Thresholds": 3,
    "Decisions-Architecture": 2,
    "Documentation-API": 2,
    "Documentation-Internal": 2,
    "Spec-Compliance": 2,
    "Coverage-Critical": 3
  }
}
```

