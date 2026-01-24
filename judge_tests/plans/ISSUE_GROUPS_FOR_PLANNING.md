# Issue Groups for Planning

**Generated:** 2026-01-21
**Source:** 10 hierarchical PR review runs (C1 x5, C2 x5)

---

## Executive Summary

| Priority | Groups | Issues | Estimated Effort |
|----------|--------|--------|------------------|
| P0 - Critical | 3 | 8 | 2-3 days |
| P1 - High | 4 | 12 | 3-5 days |
| P2 - Medium | 5 | 18 | 5-7 days |
| P3 - Low | 3 | 15+ | Ongoing |

---

## P0: Critical - Fix Before Merge

### Group 1: Runtime Crash Bugs
**Risk:** Production crashes, data corruption
**Effort:** 4-6 hours

| Issue | File | Line | Description | Fix |
|-------|------|------|-------------|-----|
| Non-null assertion crash | promotion-checker.ts | 228 | `findById()!` crashes on concurrent deletion | Add null check |
| Function name typo | promotion-checker.ts | 131 | `promoteToDerivdPrinciple` causes runtime error | Rename to `promoteToDerivedPrinciple` |
| provisionalAlertId ignored | pattern-occurrence.repo.ts | 200-246 | update() silently ignores parameter | Add to updates array |

### Group 2: Determinism Violations
**Risk:** Violates core spec principle, unpredictable behavior
**Effort:** 1-2 days

| Issue | File | Line | Description | Fix |
|-------|------|------|-------------|-----|
| Resolver mixes deterministic/probabilistic | failure-mode-resolver.ts | 52-59 | Core spec violation | Refactor to pure decision tree |
| Non-deterministic keyword extraction | noncompliance-checker.ts | 92-93 | Different results for same input | Stabilize with sorting |
| Order-dependent sliding window | noncompliance-checker.ts | 145-185 | Returns first match, not best | Add secondary sort key |

### Group 3: Security - Path Traversal
**Risk:** Arbitrary file write during init
**Effort:** 2-4 hours

| Issue | File | Line | Description | Fix |
|-------|------|------|-------------|-----|
| Symlink traversal in copyDirRecursive | init.ts | 318-331 | Can write outside target directory | Use `fs.realpathSync`, validate bounds |
| Path traversal sequences | init.ts | 40-64 | `../` not validated | Add path normalization check |

---

## P1: High - Fix This Sprint

### Group 4: Undocumented Critical Thresholds
**Risk:** Unmaintainable, untestable business logic
**Effort:** 1 day (documentation) + 1 day (tests)

| Threshold | File | Line | Value | Used For |
|-----------|------|------|-------|----------|
| Relevance threshold | noncompliance-checker.ts | 109 | 0.3 | Guidance detection gate |
| Min projects for promotion | promotion-checker.ts | 36 | 3 | Promotion eligibility |
| Min derived confidence | promotion-checker.ts | 41 | 0.6 | Promotion eligibility |
| Evidence quality bases | confidence.ts | 81-91 | 0.75/0.55/0.4 | Confidence calculation |
| Decay half-life | confidence.ts | 103 | 90 days | Pattern aging |
| Recency tiers | confidence.ts | 183-186 | 7/30/90 days | Injection priority |
| Ambiguity threshold | failure-mode-resolver.ts | 105 | >= 2 | Failure mode routing |
| Keyword match minimum | noncompliance-checker.ts | 182 | >= 2 | Document search |
| Window size | noncompliance-checker.ts | 182 | 5 lines | Document search |

**Deliverable:** Create `THRESHOLDS.md` with rationale for each value.

### Group 5: Missing Test Coverage - Core Logic
**Risk:** Regressions, untested business rules
**Effort:** 2-3 days

| Module | File | What's Untested |
|--------|------|-----------------|
| Confidence calculation | confidence.ts | Edge cases, boundary conditions, negative days |
| Promotion flow | promotion-checker.ts | Idempotency, force option, boundary at 3 projects/0.6 confidence |
| JSON extraction queries | pattern-occurrence.repo.ts | findByGitDoc, findByLinearDocId, findByWebUrl |
| Failure mode resolver | failure-mode-resolver.ts | All 6 failure modes, score ties, ambiguity paths |
| Init command | init.ts | E2E flow, workspace logic, duplicate detection |

### Group 6: Spec-Code Drift
**Risk:** Implementation doesn't match documented design
**Effort:** 4-8 hours

| Issue | File | Spec Says | Code Does |
|-------|------|-----------|-----------|
| Append-only violation | pattern-occurrence.repo.ts | "Never mutate occurrence records" | update() mutates status, patternId |
| Security-only promotion | promotion-checker.ts | "Security patterns get PRIORITY" | Completely blocks non-security |
| Cross-project penalty | confidence.ts | References "Section 5.1" | Section doesn't exist |
| 6-warning cap | confidence.ts/selector.ts | "Cap warnings at 6" | Verify implementation location |

### Group 7: Incorrect Business Logic
**Risk:** Wrong pattern attribution, missed issues
**Effort:** 4-8 hours

| Issue | File | Line | Description |
|-------|------|------|-------------|
| Incorrect failureMode for harmful guidance | failure-mode-resolver.ts | 115-132 | Returns 'incomplete' instead of flagging harmful |
| Invalid slug from all-punctuation | init.ts | 167-179 | "!!!" becomes "---" and passes validation |
| String.includes() partial match | noncompliance-checker.ts | 216 | "Lines 45" matches "Lines 145" |
| Short docs get no matches | noncompliance-checker.ts | 183 | Documents < 5 lines return null |

---

## P2: Medium - Fix This Month

### Group 8: Documentation Gaps
**Effort:** 1-2 days

| File | Missing |
|------|---------|
| promotion-checker.ts | JSDoc for checkForPromotion, computeDerivedConfidence, checkWorkspaceForPromotions |
| confidence.ts | JSDoc for computePatternStats, computeInjectionPriority; PatternStats interface docs |
| failure-mode-resolver.ts | Decision tree diagram, scoring function explanations |
| init.ts | JSDoc for helper functions (findGitRoot, getGitRemoteOrigin, etc.) |
| pattern-occurrence.repo.ts | Phase 5 method examples, update() parameter docs |

### Group 9: Code Quality Issues
**Effort:** 2-4 hours

| Issue | File | Line | Description |
|-------|------|------|-------------|
| N+1 query pattern | promotion-checker.ts | 225-229 | findMatchingPatternsAcrossProjects then findById for each |
| Negative occurrence boost | confidence.ts | 95 | `activeOccurrences - 1` can be -1 |
| Timezone edge case | confidence.ts | 192-196 | daysSinceDate may be off by 1 |
| Empty carrierLocation | noncompliance-checker.ts | 216 | Empty string `.includes()` always false |

### Group 10: Testability Improvements
**Effort:** 1-2 days refactoring

| File | Issue | Improvement |
|------|-------|-------------|
| init.ts | 220+ line monolithic handler | Extract pure functions for git, config, file ops |
| failure-mode-resolver.ts | Complex branching | Add step labels matching spec comments |

### Group 11: Edge Case Handling
**Effort:** 4-8 hours

| Case | File | Current Behavior | Should |
|------|------|------------------|--------|
| Future dates (clock skew) | confidence.ts | Returns negative days | Return 0 or warn |
| Malformed JSON | pattern-occurrence.repo.ts | Returns [] | Throw or log warning |
| Missing CORE files | init.ts | Silent failure | Warn user |
| Unicode in keywords | noncompliance-checker.ts | Not normalized | Normalize NFD |

### Group 12: Low-Priority Security Hardening
**Effort:** 2-4 hours

| Issue | File | Risk Level | Fix |
|-------|------|------------|-----|
| YAML special chars | init.ts | Low | Sanitize project name |
| 8-char UUID collision | init.ts | Theoretical | Document or increase |
| execSync shell commands | init.ts | Low (no user input) | Consider execFileSync |
| ReDoS in regex | noncompliance-checker.ts | Low | Add input size limit |

---

## P3: Low - Backlog / Tech Debt

### Group 13: Style & Consistency
- Inconsistent null handling patterns
- Missing @throws in JSDoc
- Historical comments cluttering code

### Group 14: Performance Optimizations
- Unbounded JSON parsing (no size limit)
- Sliding window on large documents
- Multiple database round-trips

### Group 15: Future Considerations
- Hash collision detection for local repos
- Audit trail for force promotions
- Baseline seeding validation (check == 11)

---

## Suggested Sprint Plan

### Sprint 1: Critical Fixes (P0)
- [ ] Fix runtime crash bugs (Group 1)
- [ ] Address determinism violations (Group 2)
- [ ] Fix path traversal security (Group 3)
- **Outcome:** Safe to merge

### Sprint 2: Stability (P1 - Part 1)
- [ ] Create THRESHOLDS.md (Group 4)
- [ ] Add core logic tests (Group 5)
- **Outcome:** Maintainable, testable

### Sprint 3: Correctness (P1 - Part 2)
- [ ] Fix spec-code drift (Group 6)
- [ ] Fix business logic bugs (Group 7)
- **Outcome:** Spec-compliant

### Sprint 4: Polish (P2)
- [ ] Documentation (Group 8)
- [ ] Code quality (Groups 9-10)
- [ ] Edge cases (Groups 11-12)
- **Outcome:** Production-ready

---

## Quick Reference: Files by Issue Count

| File | P0 | P1 | P2 | Total |
|------|----|----|----|----|
| promotion-checker.ts | 2 | 4 | 2 | 8 |
| confidence.ts | 0 | 5 | 4 | 9 |
| noncompliance-checker.ts | 1 | 3 | 3 | 7 |
| failure-mode-resolver.ts | 2 | 2 | 1 | 5 |
| init.ts | 2 | 2 | 5 | 9 |
| pattern-occurrence.repo.ts | 1 | 3 | 2 | 6 |

---

## Cross-Cutting Concerns

### Issues That Affect Multiple Files
1. **Magic numbers** → All 6 files have undocumented thresholds
2. **Missing tests** → All 6 files lack edge case coverage
3. **JSDoc gaps** → All 6 files have incomplete documentation

### Issues Found by ALL 10 Runs (Highest Confidence)
1. Function typo `promoteToDerivdPrinciple`
2. Undocumented thresholds (0.3, 0.6, 3, etc.)
3. Test coverage gaps in core modules
4. Path traversal in copyDirRecursive

### Issues Found ONLY in Run 5 (Need Verification)
1. Determinism violations in failure-mode-resolver
2. Unicode homograph attacks
3. TOCTOU race conditions
4. Incorrect failureMode assignment

---

*Generated from 10 hierarchical PR review runs analyzing 6 source files (~1,769 lines)*
