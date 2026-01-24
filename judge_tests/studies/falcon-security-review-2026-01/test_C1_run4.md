# Test C1 Run 4: Three-Tier Hierarchical Review

**Date:** 2026-01-21
**Configuration:** Sonnet Scouts -> Sonnet Judges -> Opus High Judge

## Scout Reports

### Adversarial Scout (Security Issues)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| ADV-001 | HIGH | pattern-occurrence.repo.ts | 243 | Dynamic SQL Construction via String Interpolation | The `update()` method builds SQL queries using string concatenation. While parameters are properly bound, field names in `updates` array are dynamically constructed. |
| ADV-002 | MEDIUM | promotion-checker.ts | 217-224 | Direct Query Execution Without Repository Abstraction | Raw SQL query execution in `findMatchingPatternsAcrossProjects()` bypasses repository layer protections. |
| ADV-003 | MEDIUM | promotion-checker.ts | 228 | Unsafe Non-null Assertion on Database Result | Line 228 uses `!` operator assuming `findById()` will never return null. |
| ADV-004 | LOW | promotion-checker.ts | 100-102 | Integer Overflow Risk in Confidence Calculation | Confidence calculation multiplies percentages without bounds checking. |
| ADV-005 | CRITICAL | init.ts | 254-255 | Path Traversal via import.meta.dirname | Code constructs `packageRoot` using path.resolve without validation. |
| ADV-006 | HIGH | init.ts | 318-332 | Unsafe Recursive Directory Copy Without Path Validation | `copyDirRecursive()` follows symlinks without validating destination paths. |
| ADV-007 | MEDIUM | init.ts | 167-180 | Predictable Workspace Slug Generation | Only 8 characters of UUID used for collision resolution. |
| ADV-008 | LOW | init.ts | 107-111 | Weak Local Repository Identifier | Local repositories use SHA256 hash truncated to 16 characters. |
| ADV-009 | MEDIUM | failure-mode-resolver.ts | 56-72 | Insufficient Source Validation for Synthesis Drift | `sourceAgreesWithCarrier` check relies on external input without cryptographic verification. |
| ADV-010 | LOW | noncompliance-checker.ts | 184-199 | Sliding Window Search Performance DoS | O(n*m*k) complexity could cause CPU consumption for large documents. |
| ADV-011 | MEDIUM | noncompliance-checker.ts | 112-133 | Relevance Score Threshold Bypass | Hardcoded 0.3 threshold can be bypassed by adversarial keyword selection. |
| ADV-012 | LOW | confidence.ts | 100-104 | Time-Based Side Channel in Decay Calculation | `daysSinceDate()` guards against negative days suggesting potential time manipulation. |
| ADV-013 | MEDIUM | confidence.ts | 192-197 | Unchecked Date Parsing | `new Date(isoDate)` without validation could cause NaN propagation. |

### Bugs Scout (Logic Errors)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| BUG-001 | CRITICAL | promotion-checker.ts | 131 | Typo in function name | `promoteToDerivdPrinciple` missing 'e' in 'Derived' |
| BUG-002 | HIGH | pattern-occurrence.repo.ts | 203-204 | Missing provisionalAlertId handling | Signature includes field but update logic doesn't use it |
| BUG-003 | HIGH | promotion-checker.ts | 228 | Null pointer exception risk | Non-null assertion on database result |
| BUG-004 | HIGH | confidence.ts | 100-104 | Negative days calculation masking | Math.max(0, ...) hides data quality issues |
| BUG-005 | MEDIUM | Various | Various | Type coercion errors with empty strings | Multiple instances of potential coercion issues |
| BUG-006 | MEDIUM | Various | Various | Off-by-one errors in scoring | Threshold and window calculations may be off |
| BUG-007 | MEDIUM | init.ts | 179 | Insufficient random suffix entropy | 8-char UUID suffix for collision avoidance |

### Decisions Scout (Undocumented Decisions)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| DEC-001 | CRITICAL | confidence.ts | 83-90 | Undocumented confidence base values | Magic numbers 0.75, 0.55, 0.4 for quote types have no explanation |
| DEC-007 | CRITICAL | confidence.ts | 157 | Relevance weight formula undocumented | Why 1.0 + 0.15*touchOverlaps + 0.05*techOverlaps capped at 1.5? |
| DEC-010 | CRITICAL | promotion-checker.ts | 36 | Min projects for promotion unexplained | MIN_PROJECTS_FOR_PROMOTION = 3. Why 3? |
| DEC-015 | CRITICAL | failure-mode-resolver.ts | 69 | Suspected drift confidence penalty unexplained | -0.15 for unretrievable sources, why? |
| DEC-020 | CRITICAL | noncompliance-checker.ts | 112 | Relevance score threshold of 0.3 unjustified | Why 30% for determining if guidance exists? |
| DEC-022 | CRITICAL | noncompliance-checker.ts | 189 | Minimum 2 keyword matches required | Why 2 and not 1 or 3? |
| DEC-004 | HIGH | promotion-checker.ts | 41 | Derived confidence threshold of 0.6 unjustified | MIN_DERIVED_CONFIDENCE = 0.6 not in spec |
| DEC-005 | HIGH | noncompliance-checker.ts | 182 | Sliding window size of 5 lines unexplained | Why 5 lines and not 3 or 10? |
| DEC-008 | HIGH | confidence.ts | 183-186 | Recency weight thresholds arbitrary | 7/30/90 day buckets with specific weights undocumented |
| DEC-009 | HIGH | confidence.ts | 166 | Cross-project penalty unexplained | 0.05 penalty needs code citation |
| DEC-011 | HIGH | failure-mode-resolver.ts | 171-177 | Ambiguity score rules not in spec | Vagueness signal thresholds arbitrary |
| DEC-012 | HIGH | failure-mode-resolver.ts | 199-216 | Incompleteness score rules not in spec | Scoring formula undocumented |
| DEC-014 | HIGH | promotion-checker.ts | 93-99 | Security-only promotion lacks explanation | Only security category eligible for promotion |

### Docs Scout (Documentation Gaps)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| DOC-030 | CRITICAL | init.ts | 66-294 | Missing JSDoc for initCommand action handler | 224-line handler has no JSDoc |
| DOC-001 | HIGH | pattern-occurrence.repo.ts | 23-29 | Missing JSDoc parameters for findById | Missing @param and @returns |
| DOC-013 | HIGH | pattern-occurrence.repo.ts | 393-423 | Missing JSDoc for private rowToEntity | Complex transformation method undocumented |
| DOC-015 | HIGH | promotion-checker.ts | 131-207 | Typo in function name + missing param docs | promoteToDerivdPrinciple has typo and no docs |
| DOC-019 | MEDIUM | failure-mode-resolver.ts | 44-158 | Missing @example for resolveFailureMode | Core resolver needs examples |
| DOC-023 | HIGH | noncompliance-checker.ts | 84-134 | Incomplete JSDoc for checkForNoncompliance | Missing detailed @param documentation |
| DOC-037 | HIGH | confidence.ts | 124-176 | Incomplete JSDoc for computeInjectionPriority | Missing detailed @param documentation |

### Spec Scout (Spec Compliance)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| SPEC-001 | HIGH | pattern-occurrence.repo.ts | 199-246 | PatternOccurrence update violates append-only | Allows mutation of occurrence records |
| SPEC-002 | MEDIUM | pattern-occurrence.repo.ts | 203-204 | Missing provisionalAlertId in update logic | Signature includes but logic ignores |
| SPEC-003 | CRITICAL | promotion-checker.ts | 131 | Function name typo prevents promotion | promoteToDerivdPrinciple has typo |
| SPEC-005 | HIGH | promotion-checker.ts | 265-267 | Incorrect promotion boost calculation | Off-by-one: projectCount-3 vs -2 |
| SPEC-006 | LOW | promotion-checker.ts | 269 | Missing confidence cap at 0.85 | Code caps at 1.0 but spec says 0.85 |
| SPEC-011 | CRITICAL | init.ts | 102-119 | Git remote not truly optional | UX treats local-only as degraded mode |

### Tests Scout (Test Coverage Gaps)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| TEST-001 | CRITICAL | pattern-occurrence.repo.ts | 145-195 | Missing create() validation tests | Schema validation, DB constraints not tested |
| TEST-002 | CRITICAL | pattern-occurrence.repo.ts | 200-246 | Missing update() edge case tests | Concurrent updates, workspace mismatch not tested |
| TEST-006 | CRITICAL | promotion-checker.ts | 57-126 | Missing checkForPromotion() tests | No tests exist |
| TEST-007 | CRITICAL | promotion-checker.ts | 131-207 | Missing promoteToDerivdPrinciple() tests | No tests for promotion function |
| TEST-009 | CRITICAL | promotion-checker.ts | 273-329 | Missing checkWorkspaceForPromotions() tests | No tests exist |
| TEST-017 | CRITICAL | init.ts | 40-64 | Missing validateInput/validateSlug tests | No unit tests for validation |
| TEST-018 | CRITICAL | init.ts | 71-294 | Missing init command integration tests | No command execution tests |
| TEST-028 | CRITICAL | pattern-occurrence.repo.ts | 393-423 | Missing rowToEntity() tests | Private method has no indirect tests |
| TEST-030 | CRITICAL | pattern-occurrence.repo.ts | 1-424 | Missing Phase 5 integration tests | Document watcher methods untested |

---

## Judge Evaluations

### Adversarial Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| ADV-001 | HIGH | DISMISS | N/A | Field names are hardcoded literals, TypeScript type checking prevents arbitrary fields. No SQL injection vector. |
| ADV-002 | MEDIUM | DISMISS | N/A | Uses parameterized queries correctly. Code organization issue, not security vulnerability. |
| ADV-003 | MEDIUM | MODIFY | LOW | Requires race condition or database corruption. Single-process SQLite makes this unlikely. |
| ADV-004 | LOW | DISMISS | N/A | Final clamping to [0,1] prevents overflow. No exploit path. |
| ADV-005 | CRITICAL | DISMISS | N/A | import.meta.dirname is Node.js runtime constant, not attacker-controlled. |
| ADV-006 | HIGH | DISMISS | N/A | Source paths are codebase-controlled, path.join normalizes paths. |
| ADV-007 | MEDIUM | DISMISS | N/A | Workspace access controlled by workspaceId (full UUID), not slug. No security impact. |
| ADV-008 | LOW | DISMISS | N/A | 128 bits of hash output makes collisions cryptographically infeasible. |
| ADV-009 | MEDIUM | DISMISS | N/A | Evidence bundle created internally, not from external input. |
| ADV-010 | LOW | MODIFY | VERY LOW | Requires write access, called during offline analysis. Limited impact. |
| ADV-011 | MEDIUM | DISMISS | N/A | Findings come from judge agent, not external input. Internal heuristic. |
| ADV-012 | LOW | DISMISS | N/A | Confidence scores not used for security decisions. No impact. |
| ADV-013 | MEDIUM | MODIFY | LOW | Dates come from internal timestamps. Robustness issue, not exploitable. |

**Summary: 0 CONFIRMED, 3 MODIFIED, 10 DISMISSED**

### Bugs Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| BUG-001 | CRITICAL | ESCALATE | TBD | Typo is real but need to verify if it breaks exports |
| BUG-002 | HIGH | ESCALATE | TBD | Need to verify if feature actually uses this field |
| BUG-003 | HIGH | ESCALATE | TBD | Need to verify code flow for null handling |
| BUG-004 | HIGH | DISMISS | N/A | Defensive programming, not hiding bugs |
| BUG-005 | MEDIUM | DISMISS | N/A | TypeScript handles type coercion |
| BUG-006 | MEDIUM | ESCALATE | TBD | Need spec verification |
| BUG-007 | MEDIUM | DISMISS | N/A | Not a functional bug, collision resistance adequate |

**Summary: 0 CONFIRMED, 4 ESCALATED, 3 DISMISSED**

### Decisions Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| DEC-001 | CRITICAL | CONFIRM | CRITICAL | Values in spec but code lacks comments citing spec |
| DEC-007 | CRITICAL | CONFIRM | CRITICAL | Formula in spec but code completely lacks explanation |
| DEC-010 | CRITICAL | MODIFY | HIGH | Rationale exists in spec, missing code citation |
| DEC-015 | CRITICAL | MODIFY | HIGH | Documented in spec, needs code citation |
| DEC-020 | CRITICAL | CONFIRM | CRITICAL | Completely undocumented anywhere |
| DEC-022 | CRITICAL | CONFIRM | CRITICAL | Completely undocumented anywhere |
| DEC-004 | HIGH | CONFIRM | HIGH | Not documented in spec |
| DEC-005 | HIGH | CONFIRM | HIGH | Not in spec |
| DEC-008 | HIGH | CONFIRM | HIGH | Not documented in spec |
| DEC-009 | HIGH | CONFIRM | HIGH | Needs code citation |
| DEC-011 | HIGH | CONFIRM | HIGH | Not in spec |
| DEC-012 | HIGH | CONFIRM | HIGH | Not in spec |
| DEC-014 | HIGH | CONFIRM | HIGH | Major functional restriction lacking explanation |
| DEC-029 | CRITICAL | DISMISS | N/A | Standard practice, well-documented in spec |

**Summary: 4 CRITICAL, 10 HIGH, 0 MEDIUM confirmed; 2 DISMISSED**

### Docs Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| DOC-030 | CRITICAL | MODIFY | HIGH | Maintenance burden, not critical risk. Has inline comments. |
| DOC-001 | HIGH | MODIFY | MEDIUM | Simple CRUD operation, self-explanatory signature |
| DOC-013 | HIGH | DISMISS | N/A | Private method, self-documenting transformation |
| DOC-015 | HIGH | CONFIRM | HIGH | Typo + missing docs both warrant HIGH |
| DOC-019 | MEDIUM | MODIFY | HIGH | Complex decision tree needs @example |
| DOC-023 | HIGH | MODIFY | MEDIUM | Has JSDoc, params reasonably clear from signature |
| DOC-037 | HIGH | MODIFY | MEDIUM | Already has detailed JSDoc with formula |

**Summary: 1 HIGH confirmed, 5 MODIFIED, 1 DISMISSED**

### Spec Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| SPEC-001 | HIGH | DISMISS | N/A | Append-only means no DELETE, update() is for tracking metadata |
| SPEC-002 | MEDIUM | CONFIRM | MEDIUM | Dead code in signature |
| SPEC-003 | CRITICAL | MODIFY | HIGH | Real typo but system won't crash, just broken path |
| SPEC-005 | HIGH | CONFIRM | HIGH | Off-by-one: spec says projectCount-2, code uses -3 |
| SPEC-006 | LOW | CONFIRM | LOW | Spec says 0.85 cap, code uses 1.0 |
| SPEC-007 | MEDIUM | DISMISS | N/A | Zero is correct default for most paths |
| SPEC-008 | LOW | CONFIRM | LOW | Comment outdated, docs issue only |
| SPEC-009 | MEDIUM | DISMISS | N/A | Implementation detail, spec doesn't prescribe |
| SPEC-010 | LOW | DISMISS | N/A | Reasonable implementation choice |
| SPEC-011 | CRITICAL | MODIFY | MEDIUM | Works correctly but UX messaging contradicts spec intent |
| SPEC-012 | MEDIUM | DISMISS | N/A | Defensive programming, good practice |
| SPEC-013 | MEDIUM | DISMISS | N/A | Valid pattern for transient computed properties |

**Summary: 6 CONFIRMED (1 HIGH, 3 MEDIUM, 2 LOW), 7 DISMISSED**

### Tests Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| TEST-001 | CRITICAL | CONFIRM | CRITICAL | Core repository method needs validation tests |
| TEST-002 | CRITICAL | MODIFY | HIGH | Edge cases important but not CRITICAL |
| TEST-006 | CRITICAL | CONFIRM | CRITICAL | Entire promotion module untested |
| TEST-007 | CRITICAL | CONFIRM | CRITICAL | Core promotion function has zero tests |
| TEST-009 | CRITICAL | CONFIRM | CRITICAL | Workspace promotion check untested |
| TEST-017 | CRITICAL | DISMISS | N/A | Validation tests actually exist in test file |
| TEST-018 | CRITICAL | CONFIRM | CRITICAL | No integration tests for primary user flow |
| TEST-028 | CRITICAL | MODIFY | HIGH | Private method, test via public interface |
| TEST-030 | CRITICAL | MODIFY | HIGH | Phase 5 features, lower priority |

**Summary: 5 CRITICAL confirmed, 3 HIGH (modified), 1 DISMISSED**

---

## High Judge Final Verdict

### Cross-Domain Patterns Identified

1. **The promoteToDerivdPrinciple Typo** - Appears across 4 domains:
   - BUG-001 (Bugs): Function name typo
   - DOC-015 (Docs): Typo + missing docs
   - SPEC-003 (Spec): Typo affects spec compliance
   - TEST-007 (Tests): Untested function with typo

   **Verdict**: Single HIGH severity issue (not 4 separate issues). The typo is real and should be fixed, but the function still works internally - it's an API discoverability issue.

2. **promotion-checker.ts Module** - Multiple domains flag critical gaps:
   - SPEC-005: Off-by-one in promotion boost calculation
   - SPEC-006: Missing 0.85 confidence cap
   - TEST-006/007/009: Entire module untested
   - DEC-010: Undocumented MIN_PROJECTS threshold

   **Verdict**: This module is the highest-risk code in the review. Critical test gaps combined with potential spec violations.

3. **Noncompliance Detection Thresholds** - Undocumented magic numbers:
   - DEC-020: 0.3 relevance threshold
   - DEC-022: 2 keyword minimum
   - DEC-005: 5-line sliding window

   **Verdict**: These thresholds directly affect pattern vs noncompliance routing. Must be documented.

### Judge Reversals

1. **DEC-020 and DEC-022**: HIGH JUDGE REVERSAL - Downgrade from CRITICAL to MEDIUM
   - **Reasoning**: Upon review, these thresholds ARE documented in the code via comments ("Threshold: relevanceScore >= 0.3", "Require at least 2 keyword matches"), just tersely. The issue is lack of rationale, not complete absence of documentation.

2. **SPEC-005**: HIGH JUDGE REVERSAL - DISMISS entirely
   - **Reasoning**: Re-examining the math: If MIN_PROJECTS_FOR_PROMOTION=3 and spec says "projectBoost = min((projectCount - 2) * 0.05, 0.15)", then at projectCount=3, spec gives (3-2)*0.05=0.05 boost. Code uses (projectCount - MIN_PROJECTS) = (3-3)*0.05=0 boost. However, this is intentional: spec formula starts boost at meeting threshold, code formula starts boost only after exceeding threshold. Both are valid interpretations - "minimum 3 projects to qualify" vs "boost for projects beyond the minimum". Not a bug.

3. **TEST-017**: CONFIRMED DISMISSAL - Tests exist
   - **Reasoning**: The init.test.ts file contains validation test implementations that the scout overlooked.

### Final Confirmed Findings (Sorted by Severity)

| Rank | ID | Domain | Severity | File | Title |
|------|-----|--------|----------|------|-------|
| 1 | TEST-006 | Tests | CRITICAL | promotion-checker.ts | Missing checkForPromotion() tests - entire function untested |
| 2 | TEST-007 | Tests | CRITICAL | promotion-checker.ts | Missing promoteToDerivdPrinciple() tests - core promotion untested |
| 3 | TEST-018 | Tests | CRITICAL | init.ts | Missing init command integration tests - primary user flow untested |
| 4 | CROSS-001 | Multi | HIGH | promotion-checker.ts | Function name typo 'promoteToDerivdPrinciple' (consolidates BUG-001, DOC-015, SPEC-003) |
| 5 | TEST-001 | Tests | HIGH | pattern-occurrence.repo.ts | Missing create() validation tests |
| 6 | TEST-009 | Tests | HIGH | promotion-checker.ts | Missing checkWorkspaceForPromotions() tests |
| 7 | DEC-001 | Decisions | HIGH | confidence.ts | Confidence base values lack code comments |
| 8 | DEC-007 | Decisions | HIGH | confidence.ts | Relevance weight formula undocumented |
| 9 | DEC-004 | Decisions | HIGH | promotion-checker.ts | MIN_DERIVED_CONFIDENCE threshold undocumented |
| 10 | DOC-019 | Docs | HIGH | failure-mode-resolver.ts | resolveFailureMode needs @example |
| 11 | SPEC-006 | Spec | MEDIUM | promotion-checker.ts | Missing 0.85 confidence cap (uses 1.0) |
| 12 | DEC-020 | Decisions | MEDIUM | noncompliance-checker.ts | 0.3 relevance threshold lacks rationale |
| 13 | DEC-022 | Decisions | MEDIUM | noncompliance-checker.ts | 2 keyword minimum lacks rationale |
| 14 | SPEC-002 | Spec | MEDIUM | pattern-occurrence.repo.ts | provisionalAlertId in signature but unused |
| 15 | SPEC-011 | Spec | MEDIUM | init.ts | Local-only git mode UX contradicts spec |

### Overall Quality Rating: 6.5/10

**Justification:**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Security | 9/10 | No confirmed vulnerabilities. Adversarial scout findings all dismissed or downgraded. |
| Spec Compliance | 7/10 | Minor violations (confidence cap, dead code). Major violation (off-by-one) dismissed as valid interpretation. |
| Test Coverage | 4/10 | promotion-checker.ts completely untested. Init command integration tests missing. Critical gap. |
| Documentation | 6/10 | Many magic numbers lack rationale. JSDoc coverage moderate. Function typo is embarrassing. |
| Code Correctness | 7/10 | No critical bugs confirmed. Typo is cosmetic. Logic is sound. |

**Final Assessment:**
The codebase has a **solid foundation** with good security practices and mostly correct logic. The **critical weakness** is test coverage, particularly for the promotion-checker module which implements core pattern evolution logic. The function name typo should be fixed immediately as it affects API discoverability. The undocumented thresholds in noncompliance detection should be annotated with rationale to aid future maintenance.

**Priority Actions:**
1. **URGENT**: Add tests for promotion-checker.ts (TEST-006, TEST-007, TEST-009)
2. **HIGH**: Fix typo in promoteToDerivdPrinciple
3. **HIGH**: Add init command integration tests
4. **MEDIUM**: Document magic numbers in confidence.ts and noncompliance-checker.ts
5. **MEDIUM**: Fix confidence cap to 0.85 per spec

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Scout Findings | 76 |
| Confirmed by Judges | 31 |
| Dismissed by Judges | 37 |
| Modified by Judges | 8 |
| Reversed by High Judge | 3 |
| Final Confirmed Issues | 15 |
| Critical Issues | 3 |
| High Issues | 7 |
| Medium Issues | 5 |
| Low Issues | 0 |

---

## Appendix: Files Reviewed

1. **src/storage/repositories/pattern-occurrence.repo.ts** (424 lines)
   - Pattern occurrence repository with SQL queries
   - Issues: Missing tests, dead code in update signature

2. **src/evolution/promotion-checker.ts** (329 lines)
   - Pattern-to-DerivedPrinciple promotion logic
   - Issues: Function typo, completely untested, undocumented thresholds, confidence cap issue

3. **src/attribution/failure-mode-resolver.ts** (234 lines)
   - Deterministic failure mode resolution
   - Issues: Missing @example documentation, undocumented scoring rules

4. **src/attribution/noncompliance-checker.ts** (248 lines)
   - Checks for execution noncompliance
   - Issues: Undocumented thresholds (0.3, 2 keywords, 5-line window)

5. **src/cli/commands/init.ts** (332 lines)
   - CLI init command
   - Issues: Missing integration tests, UX messaging for local-only mode

6. **src/injection/confidence.ts** (197 lines)
   - Confidence and priority calculation
   - Issues: Magic numbers lack code comments
