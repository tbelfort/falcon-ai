# Test C1 Run 1: Three-Tier Hierarchical Review

**Date:** 2026-01-21
**Configuration:** Sonnet Scouts -> Sonnet Judges -> Opus High Judge

## Files Reviewed
1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (330 lines)
3. `src/attribution/failure-mode-resolver.ts` (235 lines)
4. `src/attribution/noncompliance-checker.ts` (249 lines)
5. `src/cli/commands/init.ts` (333 lines)
6. `src/injection/confidence.ts` (198 lines)

---

## Scout Reports

### 1. Adversarial Scout Report (Security Issues, Attack Vectors, Production Failure Modes)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| ADV-001 | HIGH | init.ts | 298 | Command Injection via Git Commands | `execSync('git rev-parse --show-toplevel')` uses shell execution. While the command itself is safe, a malicious git config could potentially influence behavior. |
| ADV-002 | MEDIUM | init.ts | 305-306 | Command Output Not Sanitized | `getGitRemoteOrigin()` returns raw git output that flows into database storage without full sanitization beyond URL canonicalization. |
| ADV-003 | HIGH | init.ts | 192-197 | SQL Injection Potential in Dynamic INSERT | While parameterized queries are used, the workspace slug is derived from user input and used in queries. The validation exists but slug generation at line 167 uses `replace()` which may not catch all edge cases. |
| ADV-004 | MEDIUM | pattern-occurrence.repo.ts | 243 | Dynamic SQL Construction | `UPDATE pattern_occurrences SET ${updates.join(', ')}` constructs SQL dynamically. While column names are hardcoded strings, this pattern can be fragile. |
| ADV-005 | HIGH | init.ts | 250 | Config File Written Without Atomic Operation | `fs.writeFileSync` is not atomic. A crash mid-write could leave corrupt config. |
| ADV-006 | MEDIUM | init.ts | 329 | Directory Traversal in copyDirRecursive | `copyDirRecursive` doesn't validate that resolved paths stay within expected boundaries. Symlinks in CORE source could escape. |
| ADV-007 | LOW | promotion-checker.ts | 197-200 | Sensitive Information in Console Logs | Pattern IDs and confidence values logged to console could leak through log aggregation in production. |
| ADV-008 | MEDIUM | noncompliance-checker.ts | 171-197 | ReDoS Potential in Document Search | `searchDocument` uses sliding window over potentially large documents without bounds. Combined with `includes()` on each keyword, malicious large documents could cause CPU exhaustion. |

### 2. Bugs Scout Report (Logic Errors, Off-by-One, Null Handling, Race Conditions)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| BUG-001 | HIGH | promotion-checker.ts | 131 | Typo in Function Name | Function `promoteToDerivdPrinciple` has typo - missing 'e' in "Derived". This will cause confusion and potential call errors. |
| BUG-002 | MEDIUM | confidence.ts | 95 | Off-by-One in Occurrence Boost | `Math.min(stats.activeOccurrences - 1, 5)` can produce negative value (-1) when `activeOccurrences` is 0, resulting in -0.05 penalty instead of 0. |
| BUG-003 | MEDIUM | noncompliance-checker.ts | 183 | Off-by-One in Sliding Window | Loop `for (let i = 0; i <= lines.length - windowSize; i++)` will miss content in documents shorter than 5 lines. |
| BUG-004 | LOW | pattern-occurrence.repo.ts | 237-238 | Update with provisionalAlertId Not Implemented | The `update` method signature includes `provisionalAlertId` parameter but it's never used in the update logic. |
| BUG-005 | MEDIUM | promotion-checker.ts | 228 | Null Assertion Without Guarantee | `patternRepo.findById(row.id as string)!` uses null assertion but `findById` can return `null` if row was deleted between queries. |
| BUG-006 | LOW | confidence.ts | 182-186 | Discontinuous Recency Weight | Recency weight jumps from 1.0 to 0.95 at day 8, creating discontinuity that could cause surprising priority changes. |
| BUG-007 | MEDIUM | failure-mode-resolver.ts | 204-207 | Incomplete Score Calculation | When `hasCitation` is true with `citedSources.length > 0`, incompleteness score increases. But having citations should arguably decrease incompleteness suspicion, not increase it. Logic appears inverted. |
| BUG-008 | LOW | noncompliance-checker.ts | 125 | Ternary Logic Ambiguity | `contextPackMatch ? 'context-pack' : 'spec'` assumes match is from spec if not from contextPack, but `match` could be from either and this doesn't verify which one matched. |

### 3. Decisions Scout Report (Undocumented Architectural Decisions, Magic Numbers)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| DEC-001 | MEDIUM | promotion-checker.ts | 36-52 | Magic Numbers Without ADR Reference | Constants `MIN_PROJECTS_FOR_PROMOTION=3`, `MIN_DERIVED_CONFIDENCE=0.6`, `PROJECT_COUNT_BOOST=0.05`, `MAX_PROJECT_BOOST=0.15` are defined but not linked to any ADR or spec section. |
| DEC-002 | MEDIUM | confidence.ts | 82-90 | Evidence Quality Base Values Undocumented | Values 0.75, 0.55, 0.4 for verbatim/paraphrase/inferred are hardcoded without specification reference. |
| DEC-003 | MEDIUM | confidence.ts | 103 | 90-Day Half-Life Undocumented | The decay penalty uses 90-day half-life with max 0.15 penalty but rationale isn't documented. |
| DEC-004 | LOW | noncompliance-checker.ts | 112 | Relevance Threshold 0.3 Undocumented | The threshold `match.relevanceScore >= 0.3` determines noncompliance classification but the value choice is not explained. |
| DEC-005 | LOW | noncompliance-checker.ts | 182 | Window Size 5 Lines Undocumented | Sliding window of 5 lines is arbitrary; different values could significantly change matching behavior. |
| DEC-006 | MEDIUM | noncompliance-checker.ts | 188-189 | Minimum 2 Keywords Threshold | Requiring at least 2 keyword matches is undocumented design decision that significantly affects false positive/negative rates. |
| DEC-007 | LOW | confidence.ts | 157 | Relevance Weight Formula Undocumented | The formula `1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps` with cap at 1.5 needs spec reference. |
| DEC-008 | MEDIUM | init.ts | 167 | Slug Generation Algorithm | `projectName.toLowerCase().replace(/[^a-z0-9_]/g, '-')` replaces all non-alphanumeric except underscore with hyphen. This can create slugs like `--my--project--`. |

### 4. Docs Scout Report (Documentation Gaps, JSDoc Issues, Comment Accuracy)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| DOC-001 | LOW | pattern-occurrence.repo.ts | 200-246 | Update Method Missing Parameter Documentation | JSDoc doesn't describe all optional parameters or their effects (patternId, provisionalAlertId, wasInjected, etc.). |
| DOC-002 | LOW | promotion-checker.ts | 131-134 | Function Name Doesn't Match Description | `promoteToDerivdPrinciple` has typo and JSDoc says "Promote a pattern to a derived principle" but function name is misspelled. |
| DOC-003 | MEDIUM | failure-mode-resolver.ts | 36-43 | JSDoc Missing Return Value Details | `resolveFailureMode` JSDoc doesn't document the structure of `ResolverResult.flags` or when `suspectedSynthesisDrift` is set. |
| DOC-004 | LOW | noncompliance-checker.ts | 170-200 | searchDocument Algorithm Not Documented | No documentation explaining why 5-line window and 2-keyword minimum were chosen. |
| DOC-005 | LOW | confidence.ts | 73-114 | computeAttributionConfidence Missing Edge Cases | JSDoc doesn't document behavior when pattern has no occurrences or when stats.lastSeenActive is null. |
| DOC-006 | LOW | init.ts | 66-294 | Command Action Missing Error Documentation | The action function can throw various errors but JSDoc doesn't enumerate failure modes. |
| DOC-007 | MEDIUM | confidence.ts | 119-121 | Private Type Not Exported But Used | `PatternWithCrossProjectMarker` is exported but the `_crossProjectPenalty` field is prefixed with underscore suggesting internal use - inconsistent API design. |
| DOC-008 | LOW | promotion-checker.ts | 235-240 | _db Parameter Documented but Unused | The `_db` parameter in `computeDerivedConfidence` is unused (prefixed with underscore) but still appears in function signature. |

### 5. Spec Scout Report (Spec Compliance Issues, RFC 2119 Violations)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| SPEC-001 | HIGH | promotion-checker.ts | 93-100 | Promotion Restricted to Security Category Only | Code only allows security patterns for promotion. Spec Section 4.1 may allow other HIGH/CRITICAL categories. This is a policy decision that should be spec-explicit. |
| SPEC-002 | MEDIUM | confidence.ts | 65-67 | Spec Reference 4.1 Not Verifiable | Comment references "Spec Section 4.1" but no link to actual spec document. Cannot verify implementation matches spec. |
| SPEC-003 | MEDIUM | confidence.ts | 123-132 | Spec Reference 4.2 Not Verifiable | Comment references "Spec Section 4.2" but cannot verify formula implementation correctness without spec access. |
| SPEC-004 | MEDIUM | failure-mode-resolver.ts | 36-43 | Decision Tree Steps Not Fully Implemented | Header comment describes steps A-E, but step E's default behavior may not match spec requirements for all carrierInstructionKind values. |
| SPEC-005 | LOW | noncompliance-checker.ts | 10-16 | Version Comment May Be Outdated | Comment says "NOTE (v1.0)" but codebase may have evolved. Version tracking in comments risks becoming stale. |
| SPEC-006 | MEDIUM | pattern-occurrence.repo.ts | 1-6 | Phase 5 Reference Without Status | Header mentions "Phase 5 change detection" but doesn't indicate if Phase 5 is complete, in progress, or planned. |
| SPEC-007 | LOW | confidence.ts | 164-166 | Cross-Project Penalty Spec Reference Missing | Comment mentions "Main spec Section 5.1" but implementation uses hardcoded 0.95 multiplier without verification link. |
| SPEC-008 | MEDIUM | init.ts | 1-6 | Missing Spec for CLI Behavior | No reference to specification document defining expected CLI behavior, error handling requirements, or user interaction standards. |

### 6. Tests Scout Report (Test Coverage Gaps, Flaky Tests, Missing Assertions)

| ID | Severity | File | Line(s) | Title | Description |
|----|----------|------|---------|-------|-------------|
| TEST-001 | HIGH | failure-mode-resolver.ts | 44-158 | No Test Coverage Indication | `resolveFailureMode` is critical business logic with complex branching (steps A-E) but no test file reference or coverage markers. |
| TEST-002 | HIGH | confidence.ts | 74-114 | computeAttributionConfidence Untested Edge Cases | Function has multiple branches for evidence types, decay, and flags. Edge cases like zero occurrences, null lastSeenActive, negative days need test coverage. |
| TEST-003 | HIGH | noncompliance-checker.ts | 84-134 | checkForNoncompliance Complex Logic Untested | Critical function that determines noncompliance vs pattern creation. Multiple conditions need comprehensive test matrix. |
| TEST-004 | MEDIUM | init.ts | 71-294 | CLI Command Integration Tests Missing | `initCommand` action modifies filesystem and database but complex integration testing is hard to verify from code alone. |
| TEST-005 | MEDIUM | promotion-checker.ts | 57-126 | checkForPromotion Decision Logic | Multiple criteria (project count, severity, category, confidence) need combinatorial test coverage. |
| TEST-006 | MEDIUM | pattern-occurrence.repo.ts | 256-388 | Phase 5 Document Queries Need Tests | `findByGitDoc`, `findByLinearDocId`, `findByWebUrl`, `findByExternalId` use complex JSON queries that could fail silently on schema changes. |
| TEST-007 | LOW | noncompliance-checker.ts | 141-164 | extractKeywords Boundary Tests | Stop word filtering and minimum word length (>2) need tests for edge cases like all-stopword inputs. |
| TEST-008 | MEDIUM | confidence.ts | 133-176 | computeInjectionPriority Formula Verification | Complex formula with multiple weights needs golden test cases to verify spec compliance. |

---

## Judge Evaluations

### 1. Adversarial Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| ADV-001 | HIGH | MODIFY | MEDIUM | `execSync` with hardcoded command string is safe. Git config manipulation would require pre-existing compromise. Downgrade to MEDIUM - defense in depth concern, not direct vulnerability. |
| ADV-002 | MEDIUM | CONFIRM | MEDIUM | Valid concern. URL canonicalization helps but raw git output could contain unexpected characters. Worth sanitization review. |
| ADV-003 | HIGH | DISMISS | - | Counter-proof: Lines 57-64 validate slug format with strict regex `^[a-z0-9_-]+$`. Line 183-189 validate generated slug. Parameterized queries used throughout. No SQL injection possible. |
| ADV-004 | MEDIUM | DISMISS | - | Counter-proof: Column names are hardcoded string literals (lines 217-237), not user input. This is standard parameterized query pattern. Safe as implemented. |
| ADV-005 | HIGH | CONFIRM | HIGH | Valid. Non-atomic write to critical config file. Production systems should use write-rename pattern for atomicity. |
| ADV-006 | MEDIUM | CONFIRM | MEDIUM | Valid concern. Symlink following in `copyDirRecursive` could escape intended boundaries if CORE source is compromised. |
| ADV-007 | LOW | CONFIRM | LOW | Minor information disclosure risk. Pattern IDs are UUIDs without PII, confidence is percentage. Low risk in most deployments. |
| ADV-008 | MEDIUM | MODIFY | LOW | ReDoS requires attacker-controlled documents. Context Pack and Spec are generated internally, not from untrusted input. Downgrade to LOW - theoretical concern. |

### 2. Bugs Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| BUG-001 | HIGH | CONFIRM | HIGH | Confirmed typo: `promoteToDerivdPrinciple` should be `promoteToDeriveDPrinciple`. This will cause API confusion and potential grep/search failures. |
| BUG-002 | MEDIUM | CONFIRM | MEDIUM | Confirmed. When `activeOccurrences=0`, expression yields `-1 * 0.05 = -0.05`, penalizing patterns incorrectly. Should be `Math.max(0, stats.activeOccurrences - 1)`. |
| BUG-003 | MEDIUM | MODIFY | LOW | Partial confirmation. Documents under 5 lines are edge case for Context Pack/Spec which are typically large. Loop works correctly; just skips tiny documents. Downgrade to LOW. |
| BUG-004 | LOW | CONFIRM | LOW | Confirmed. `provisionalAlertId` in update signature is dead code. Should either implement or remove from signature. |
| BUG-005 | MEDIUM | CONFIRM | MEDIUM | Confirmed race condition. Between `findMatchingPatternsAcrossProjects` query and individual `findById` calls, rows could be deleted. Non-null assertion is unsafe. |
| BUG-006 | LOW | CONFIRM | LOW | Confirmed discontinuity. At day boundary 7->8, weight jumps from 1.0 to 0.95. Could cause ranking instability for patterns near boundary. |
| BUG-007 | MEDIUM | MODIFY | HIGH | Upgrade severity. The logic at lines 204-207 is counterintuitive: having citations that don't cover the issue should perhaps be neutral, not positive for incompleteness. This affects failure mode classification accuracy. |
| BUG-008 | LOW | CONFIRM | LOW | Confirmed ambiguity. Match source determination could be clearer but current logic works since `contextPackMatch` is checked first. |

### 3. Decisions Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| DEC-001 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Magic numbers without ADR reference. Constants should cite spec section or decision document for future maintainability. |
| DEC-002 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Evidence quality base values (0.75/0.55/0.4) are core to confidence calculation. Should reference spec or include rationale comment. |
| DEC-003 | MEDIUM | CONFIRM | MEDIUM | Confirmed. 90-day half-life is significant behavioral choice. Rationale should be documented. |
| DEC-004 | LOW | CONFIRM | LOW | Confirmed. Threshold 0.3 affects noncompliance detection. Minor since it's relatively conservative (30% keyword match). |
| DEC-005 | LOW | CONFIRM | LOW | Confirmed. 5-line window is reasonable default but undocumented. |
| DEC-006 | MEDIUM | CONFIRM | MEDIUM | Confirmed. 2-keyword minimum significantly affects precision/recall tradeoff. Should be configurable or documented. |
| DEC-007 | LOW | CONFIRM | LOW | Confirmed. Relevance formula is reasonable but arbitrary constants need documentation. |
| DEC-008 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Slug generation can create ugly slugs like `--my--project--`. Should normalize consecutive hyphens. |

### 4. Docs Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| DOC-001 | LOW | CONFIRM | LOW | Confirmed. Update method parameters deserve individual documentation. |
| DOC-002 | LOW | CONFIRM | MEDIUM | Upgrade: typo in function name makes docs actively misleading. Function name should match description. |
| DOC-003 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Return type `ResolverResult` has important `flags` structure that affects downstream processing. |
| DOC-004 | LOW | CONFIRM | LOW | Confirmed. Algorithm documentation would aid maintenance. |
| DOC-005 | LOW | CONFIRM | LOW | Confirmed. Edge case documentation important for confidence calculation function. |
| DOC-006 | LOW | DISMISS | - | Counter-argument: CLI commands typically communicate errors via console output and exit codes, which are demonstrated in the code. Formal JSDoc error enumeration is uncommon for CLI handlers. |
| DOC-007 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Underscore prefix convention inconsistency with export status creates API confusion. |
| DOC-008 | LOW | CONFIRM | LOW | Confirmed. Unused parameter should either be used or removed from signature to avoid confusion. |

### 5. Spec Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| SPEC-001 | HIGH | MODIFY | MEDIUM | Downgrade. The restriction to security category may be intentional policy (security patterns get priority per CLAUDE.md). However, spec reference would clarify if this is correct behavior. |
| SPEC-002 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Spec Section 4.1 reference without verifiable link makes compliance auditing difficult. |
| SPEC-003 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Same issue as SPEC-002 for Section 4.2. |
| SPEC-004 | MEDIUM | MODIFY | LOW | Downgrade. Step E default behavior appears reasonable (defaulting to 'incomplete' for unknown cases). Implementation seems conservative. |
| SPEC-005 | LOW | CONFIRM | LOW | Confirmed. Version comments in code can become stale. Consider using automated version tracking. |
| SPEC-006 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Phase status unclear from code alone. Implementation status should be tracked externally or clearly documented. |
| SPEC-007 | LOW | CONFIRM | LOW | Confirmed. Cross-project penalty value (0.05) should link to spec. |
| SPEC-008 | MEDIUM | CONFIRM | MEDIUM | Confirmed. CLI behavior specification would improve consistency and testing. |

### 6. Tests Judge Verdicts

| Finding ID | Scout Severity | Verdict | Judge Severity | Reasoning |
|------------|----------------|---------|----------------|-----------|
| TEST-001 | HIGH | CONFIRM | HIGH | Confirmed. `resolveFailureMode` is deterministic decision tree - exactly the kind of function that benefits most from comprehensive unit tests. Critical business logic. |
| TEST-002 | HIGH | CONFIRM | HIGH | Confirmed. Confidence calculation edge cases (zero occurrences, null dates, negative days guard) need explicit test coverage. |
| TEST-003 | HIGH | CONFIRM | HIGH | Confirmed. Noncompliance vs pattern routing is critical classification decision. Test matrix essential. |
| TEST-004 | MEDIUM | CONFIRM | MEDIUM | Confirmed. CLI integration tests are challenging but necessary for filesystem/database operations. |
| TEST-005 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Promotion criteria combination testing important for correctness. |
| TEST-006 | MEDIUM | CONFIRM | MEDIUM | Confirmed. JSON path queries in SQLite are fragile and need regression tests. |
| TEST-007 | LOW | CONFIRM | LOW | Confirmed. Keyword extraction edge cases worth testing. |
| TEST-008 | MEDIUM | CONFIRM | MEDIUM | Confirmed. Golden test cases would verify formula implementation matches spec. |

---

## High Judge Final Verdict

### Cross-Domain Analysis

After reviewing all 6 judge reports, I identify the following cross-domain patterns and issue clusters:

#### Cluster 1: Specification Traceability Gap
**Affected findings:** SPEC-002, SPEC-003, SPEC-007, DEC-001, DEC-002, DEC-003, DEC-006, DEC-007
**Pattern:** Multiple hardcoded values reference spec sections (4.1, 4.2, 5.1) that cannot be verified. Magic numbers lack rationale.
**Recommendation:** Create a constants file with spec section links, or include spec document in repository.

#### Cluster 2: Function Name Typo (BUG-001/DOC-002)
**Cross-domain impact:** The `promoteToDerivdPrinciple` typo affects:
- API usability (BUG-001)
- Documentation accuracy (DOC-002)
- Code searchability
**Verdict:** CONFIRMED as HIGH - single fix resolves both issues.

#### Cluster 3: Test Coverage for Critical Business Logic
**Affected findings:** TEST-001, TEST-002, TEST-003
**Pattern:** Core decision-making functions (`resolveFailureMode`, `computeAttributionConfidence`, `checkForNoncompliance`) lack evident test coverage.
**Cross-reference:** These functions contain the bugs identified in BUG-002, BUG-007, making tests even more critical.
**Verdict:** HIGH priority - these are the system's core logic gates.

#### Cluster 4: Configuration Atomicity (ADV-005)
**Single finding but critical:** Non-atomic config write could leave system in inconsistent state.
**Recommendation:** Use write-to-temp-then-rename pattern.

### High Judge Reversals

| Finding ID | Judge Verdict | High Judge Verdict | Reasoning |
|------------|---------------|-------------------|-----------|
| BUG-007 | HIGH | CRITICAL | Upgrade: Incorrect failure mode classification (incomplete vs ambiguous vs incorrect) directly impacts pattern attribution - the core function of the system. An inverted logic bug here could systematically misclassify guidance errors, undermining the entire feedback loop. |
| SPEC-001 | MEDIUM | LOW | Downgrade: CLAUDE.md explicitly states "Security patterns get priority in injection" and "security bias". The restriction to security-only promotion is intentional design. Implementation is spec-compliant. |

### Final Confirmed Issues List

| Priority | ID | Severity | File | Title | Category |
|----------|-----|----------|------|-------|----------|
| 1 | BUG-007 | CRITICAL | failure-mode-resolver.ts | Inverted incompleteness score logic for citations | Bug |
| 2 | BUG-001 | HIGH | promotion-checker.ts | Typo in function name: promoteToDerivdPrinciple | Bug |
| 3 | ADV-005 | HIGH | init.ts | Non-atomic config file write | Security |
| 4 | TEST-001 | HIGH | failure-mode-resolver.ts | No test coverage for resolveFailureMode | Tests |
| 5 | TEST-002 | HIGH | confidence.ts | Untested edge cases in computeAttributionConfidence | Tests |
| 6 | TEST-003 | HIGH | noncompliance-checker.ts | Critical noncompliance logic needs test matrix | Tests |
| 7 | BUG-002 | MEDIUM | confidence.ts | Off-by-one producing negative occurrence boost | Bug |
| 8 | BUG-005 | MEDIUM | promotion-checker.ts | Race condition with null assertion after query | Bug |
| 9 | ADV-002 | MEDIUM | init.ts | Git output not fully sanitized before storage | Security |
| 10 | ADV-006 | MEDIUM | init.ts | Directory traversal risk in copyDirRecursive | Security |
| 11 | DEC-001 | MEDIUM | promotion-checker.ts | Magic numbers without spec/ADR reference | Decisions |
| 12 | DEC-002 | MEDIUM | confidence.ts | Evidence quality base values undocumented | Decisions |
| 13 | DEC-003 | MEDIUM | confidence.ts | 90-day half-life rationale undocumented | Decisions |
| 14 | DEC-006 | MEDIUM | noncompliance-checker.ts | 2-keyword minimum threshold undocumented | Decisions |
| 15 | DEC-008 | MEDIUM | init.ts | Slug generation creates ugly consecutive hyphens | Decisions |
| 16 | DOC-003 | MEDIUM | failure-mode-resolver.ts | JSDoc missing return value details for flags | Docs |
| 17 | DOC-007 | MEDIUM | confidence.ts | Underscore prefix inconsistency with export | Docs |
| 18 | SPEC-002 | MEDIUM | confidence.ts | Spec Section 4.1 reference not verifiable | Spec |
| 19 | SPEC-003 | MEDIUM | confidence.ts | Spec Section 4.2 reference not verifiable | Spec |
| 20 | SPEC-006 | MEDIUM | pattern-occurrence.repo.ts | Phase 5 status unclear | Spec |
| 21 | SPEC-008 | MEDIUM | init.ts | Missing CLI behavior specification | Spec |
| 22 | TEST-004 | MEDIUM | init.ts | CLI integration tests missing | Tests |
| 23 | TEST-005 | MEDIUM | promotion-checker.ts | Promotion criteria combination tests needed | Tests |
| 24 | TEST-006 | MEDIUM | pattern-occurrence.repo.ts | JSON path queries need regression tests | Tests |
| 25 | TEST-008 | MEDIUM | confidence.ts | Golden test cases for formula verification | Tests |
| 26 | BUG-003 | LOW | noncompliance-checker.ts | Sliding window skips documents under 5 lines | Bug |
| 27 | BUG-004 | LOW | pattern-occurrence.repo.ts | provisionalAlertId parameter unused in update | Bug |
| 28 | BUG-006 | LOW | confidence.ts | Discontinuous recency weight at day boundaries | Bug |
| 29 | BUG-008 | LOW | noncompliance-checker.ts | Match source determination ambiguity | Bug |
| 30 | ADV-007 | LOW | promotion-checker.ts | Pattern info in console logs | Security |
| 31 | ADV-008 | LOW | noncompliance-checker.ts | Theoretical ReDoS on large documents | Security |
| 32 | DEC-004 | LOW | noncompliance-checker.ts | Relevance threshold 0.3 undocumented | Decisions |
| 33 | DEC-005 | LOW | noncompliance-checker.ts | Window size 5 undocumented | Decisions |
| 34 | DEC-007 | LOW | confidence.ts | Relevance weight formula undocumented | Decisions |
| 35 | DOC-001 | LOW | pattern-occurrence.repo.ts | Update method parameters undocumented | Docs |
| 36 | DOC-004 | LOW | noncompliance-checker.ts | searchDocument algorithm undocumented | Docs |
| 37 | DOC-005 | LOW | confidence.ts | Edge case documentation missing | Docs |
| 38 | DOC-008 | LOW | promotion-checker.ts | Unused _db parameter in signature | Docs |
| 39 | SPEC-004 | LOW | failure-mode-resolver.ts | Step E default behavior verification | Spec |
| 40 | SPEC-005 | LOW | noncompliance-checker.ts | Version comment may be outdated | Spec |
| 41 | SPEC-007 | LOW | confidence.ts | Cross-project penalty spec reference missing | Spec |
| 42 | TEST-007 | LOW | noncompliance-checker.ts | extractKeywords boundary tests | Tests |

### Overall Code Quality Rating

**Rating: 6.5/10**

**Strengths:**
- Clear module separation with single responsibility
- Good use of TypeScript types and interfaces
- Deterministic decision tree approach in failure-mode-resolver is well-designed
- Append-only pattern for occurrences is architecturally sound
- Input validation present in init.ts for security-sensitive fields

**Weaknesses:**
- Critical bug in failure mode classification logic (inverted citation scoring)
- Function name typo in public API
- Multiple magic numbers without spec traceability
- Missing test coverage for core business logic
- Non-atomic file operations in CLI

**Risk Assessment:**
The most concerning issue is BUG-007 (CRITICAL) - the inverted logic in `calculateIncompletenessScore` could systematically misclassify failure modes, undermining the pattern attribution system's core function. This should be fixed and verified with tests immediately.

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Scout Findings | 48 |
| Confirmed by Judges | 42 |
| Dismissed by Judges | 6 |
| Modified by Judges | 5 |
| Reversed by High Judge | 2 |
| Final Confirmed Issues | 42 |
| CRITICAL Issues | 1 |
| HIGH Issues | 6 |
| MEDIUM Issues | 19 |
| LOW Issues | 16 |

### Issues by Category

| Category | Count |
|----------|-------|
| Bugs | 9 |
| Security | 6 |
| Decisions | 8 |
| Docs | 7 |
| Spec | 8 |
| Tests | 8 |

### Issues by File

| File | Count |
|------|-------|
| src/injection/confidence.ts | 10 |
| src/attribution/noncompliance-checker.ts | 9 |
| src/cli/commands/init.ts | 8 |
| src/evolution/promotion-checker.ts | 7 |
| src/attribution/failure-mode-resolver.ts | 4 |
| src/storage/repositories/pattern-occurrence.repo.ts | 4 |
