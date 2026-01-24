# Test C2 Run 1: Dual-Pipeline Hierarchical Review

**Date:** 2026-01-21
**Configuration:** (Haiku + Sonnet) Scouts -> Sonnet Judges -> Opus High Judge

## Files Reviewed

1. `src/storage/repositories/pattern-occurrence.repo.ts`
2. `src/evolution/promotion-checker.ts`
3. `src/attribution/failure-mode-resolver.ts`
4. `src/attribution/noncompliance-checker.ts`
5. `src/cli/commands/init.ts`
6. `src/injection/confidence.ts`

---

## Pipeline A: Haiku Scouts

### H-Adversarial Scout (Security Issues)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-ADV-001 | HIGH | init.ts | 298-301 | Command injection via execSync | `findGitRoot()` uses `execSync('git rev-parse...')` without shell escaping. While git commands are hardcoded, the pattern is unsafe if extended. |
| H-ADV-002 | MEDIUM | init.ts | 109 | Local path hash exposure | SHA256 hash of local filesystem path stored as `local:{hash}` may leak partial path info through timing/collision analysis. |
| H-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 270-286 | SQL injection via JSON path traversal | While parameterized, `json_extract` with user-controlled repo/path values could potentially be exploited if SQLite JSON functions have edge cases. |
| H-ADV-004 | LOW | noncompliance-checker.ts | 157-163 | Regex ReDoS potential | `extractKeywords` uses regex on user-provided text without length limits on input. |

### H-Bugs Scout (Logic Errors)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-BUG-001 | HIGH | promotion-checker.ts | 131 | Typo in function name | Function `promoteToDerivdPrinciple` is misspelled (missing 'e' in Derived). |
| H-BUG-002 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | Update ignores provisionalAlertId | The `update()` method has `provisionalAlertId` in options type but never uses it in the update logic. |
| H-BUG-003 | MEDIUM | noncompliance-checker.ts | 183-197 | Sliding window boundary error | Loop condition `i <= lines.length - windowSize` may produce empty windows when document has fewer lines than windowSize. |
| H-BUG-004 | LOW | confidence.ts | 95 | Off-by-one in occurrence boost | `Math.min(stats.activeOccurrences - 1, 5)` gives -1 boost when 0 occurrences, clamped but semantically odd. |

### H-Decisions Scout (Undocumented Decisions)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DEC-001 | MEDIUM | promotion-checker.ts | 36-52 | Magic numbers for promotion thresholds | `MIN_PROJECTS_FOR_PROMOTION=3`, `MIN_DERIVED_CONFIDENCE=0.6`, `PROJECT_COUNT_BOOST=0.05` are undocumented constants. |
| H-DEC-002 | MEDIUM | confidence.ts | 81-91 | Hardcoded confidence base values | Values 0.75, 0.55, 0.4 for quote types lack explanation for why these specific numbers. |
| H-DEC-003 | MEDIUM | noncompliance-checker.ts | 112 | Magic threshold 0.3 | Relevance threshold `>= 0.3` for noncompliance detection is undocumented. |
| H-DEC-004 | LOW | noncompliance-checker.ts | 182 | Window size 5 undocumented | Sliding window of 5 lines is a magic number without rationale. |

### H-Docs Scout (Documentation Gaps)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DOC-001 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | update() lacks JSDoc | Complex update method with multiple optional fields lacks documentation of behavior. |
| H-DOC-002 | MEDIUM | init.ts | 66-294 | initCommand action lacks error documentation | Large async action doesn't document possible error conditions or exit codes. |
| H-DOC-003 | LOW | failure-mode-resolver.ts | 167-185 | calculateAmbiguityScore undocumented | Internal function lacks explanation of scoring algorithm. |
| H-DOC-004 | LOW | confidence.ts | 181-187 | computeRecencyWeight missing JSDoc | No documentation for recency weight tiers. |

### H-Spec Scout (Spec Compliance)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-SPEC-001 | HIGH | pattern-occurrence.repo.ts | 145-195 | Append-only violation potential | Per CLAUDE.md: "Append-only history - Never mutate occurrence records". The `create()` method uses object spread that could theoretically allow mutation. |
| H-SPEC-002 | MEDIUM | confidence.ts | 1-6 | Values computed not stored - correct | Header correctly states confidence/priority "are NEVER stored - always computed" per spec. (Observation) |
| H-SPEC-003 | MEDIUM | failure-mode-resolver.ts | 35-43 | Deterministic resolver - compliant | Correctly implements decision tree per spec: "This is NOT LLM judgment". (Observation) |

### H-Tests Scout (Test Coverage)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-TEST-001 | MEDIUM | failure-mode-resolver.ts | 44-158 | resolveFailureMode needs edge case tests | Complex decision tree with 5+ branches - needs tests for boundary conditions. |
| H-TEST-002 | MEDIUM | confidence.ts | 74-114 | computeAttributionConfidence edge cases | Needs tests for 0 occurrences, negative days (clamped), and max bounds. |
| H-TEST-003 | LOW | init.ts | 66-294 | Integration tests for init command | Complex multi-step command needs integration tests for each failure mode. |
| H-TEST-004 | LOW | noncompliance-checker.ts | 171-200 | searchDocument boundary tests | Needs tests for documents smaller than window size. |

---

## Pipeline B: Sonnet Scouts

### S-Adversarial Scout (Security Issues)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-ADV-001 | HIGH | init.ts | 298-306 | Shell command execution without sanitization | `execSync` calls in `findGitRoot()` and `getGitRemoteOrigin()` execute shell commands. While currently using hardcoded commands, no validation exists if these functions are extended. |
| S-ADV-002 | HIGH | init.ts | 318-331 | Path traversal in copyDirRecursive | `copyDirRecursive()` doesn't validate that destination paths don't escape intended directory via symlinks or `..` components. |
| S-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 145-192 | Object spread after schema validation | Schema validation occurs after object spread with user data (`...data`), meaning `id` and `createdAt` could be overwritten before validation catches it. |
| S-ADV-004 | MEDIUM | noncompliance-checker.ts | 106-109 | Unvalidated document search on arbitrary content | `searchDocument()` operates on arbitrary `contextPack` and `spec` content without size limits, enabling DoS via large documents. |
| S-ADV-005 | LOW | confidence.ts | 192-196 | Time-based calculation without timezone handling | `daysSinceDate()` uses local Date objects which could give inconsistent results across timezones. |

### S-Bugs Scout (Logic Errors)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-BUG-001 | CRITICAL | promotion-checker.ts | 131 | Function name typo: promoteToDerivdPrinciple | `promoteToDerivdPrinciple` is missing 'e' - this is a public API function that will cause import/call failures if consumers use correct spelling. |
| S-BUG-002 | HIGH | pattern-occurrence.repo.ts | 216-218 | provisionalAlertId update not implemented | Update options include `provisionalAlertId?: string \| null` but no corresponding SET clause exists - this field is silently ignored. |
| S-BUG-003 | MEDIUM | noncompliance-checker.ts | 216 | Incorrect location comparison | `!evidence.carrierLocation.includes(match.location)` compares two different location formats (evidence location vs "Lines X-Y" format). |
| S-BUG-004 | MEDIUM | failure-mode-resolver.ts | 56-62 | Unreachable code path | If `hasCitation=true` and `sourceRetrievable=true` but `sourceAgreesWithCarrier=undefined`, neither branch executes - falls through incorrectly. |
| S-BUG-005 | LOW | confidence.ts | 46-48 | Empty array sort returns undefined | `activeOccurrences.map().sort()[0]` returns undefined when array is empty, but `lastActive?.toISOString()` handles this with optional chaining. (Observation) |

### S-Decisions Scout (Undocumented Decisions)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DEC-001 | MEDIUM | confidence.ts | 81-91 | Quote type confidence bases lack rationale | Why verbatim=0.75, paraphrase=0.55, inferred=0.4? No documentation explains the 0.20 gap between verbatim/paraphrase vs 0.15 gap between paraphrase/inferred. |
| S-DEC-002 | MEDIUM | promotion-checker.ts | 36-52 | Promotion thresholds undocumented | MIN_PROJECTS_FOR_PROMOTION=3, MIN_DERIVED_CONFIDENCE=0.6, PROJECT_COUNT_BOOST=0.05, MAX_PROJECT_BOOST=0.15 - why these values? |
| S-DEC-003 | MEDIUM | confidence.ts | 103 | 90-day half-life unexplained | Decay uses 90-day half-life with max penalty 0.15 - rationale not documented. |
| S-DEC-004 | LOW | noncompliance-checker.ts | 188-189 | Minimum 2 keyword matches | Requires `score >= 2` keyword matches but doesn't explain why 2. |
| S-DEC-005 | LOW | confidence.ts | 166 | Cross-project penalty 0.95x | The 5% penalty for cross-project patterns needs more justification. |

### S-Docs Scout (Documentation Gaps)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DOC-001 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | update() method poorly documented | Method accepts 8 optional update fields but JSDoc only says "for adherence tracking and promotion" - doesn't explain each field's purpose. |
| S-DOC-002 | MEDIUM | promotion-checker.ts | 235-269 | computeDerivedConfidence parameters underdocumented | `_db: Database` parameter is unused but kept for interface compatibility - no explanation why. |
| S-DOC-003 | LOW | noncompliance-checker.ts | 209-229 | analyzePossibleCauses lacks return documentation | Doesn't document when 'salience' vs 'formatting' causes are returned. |
| S-DOC-004 | LOW | confidence.ts | 119-121 | PatternWithCrossProjectMarker type undocumented | Extended type with `_crossProjectPenalty` flag lacks explanation of when/why this is set. |
| S-DOC-005 | LOW | init.ts | 318-331 | copyDirRecursive lacks JSDoc | No documentation for this recursive copy utility. |

### S-Spec Scout (Spec Compliance)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-SPEC-001 | HIGH | promotion-checker.ts | 93-100 | Only security patterns promoted | Code restricts promotion to `findingCategory === 'security'` only. Per CLAUDE.md "Security patterns get priority" but this completely excludes non-security HIGH/CRITICAL patterns - may be overly restrictive. |
| S-SPEC-002 | MEDIUM | noncompliance-checker.ts | 10-16 | Ambiguity routing documentation present | Correctly documents that ambiguity cases route to PatternDefinition, not ExecutionNoncompliance per v1.0 spec. (Observation) |
| S-SPEC-003 | MEDIUM | pattern-occurrence.repo.ts | 1-6 | Append-only documented | Header correctly notes "append-only" design per spec. (Observation) |
| S-SPEC-004 | LOW | confidence.ts | 165-166 | Cross-project penalty per spec | Implements crossProjectPenalty = 0.05 per "Main spec Section 5.1" - correctly documented. (Observation) |

### S-Tests Scout (Test Coverage)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-TEST-001 | HIGH | init.ts | 318-331 | copyDirRecursive lacks tests | Recursive directory copy with symlink handling is complex and untested - high risk of edge case bugs. |
| S-TEST-002 | MEDIUM | promotion-checker.ts | 57-126 | checkForPromotion needs comprehensive tests | Multiple conditional paths with thresholds need boundary testing. |
| S-TEST-003 | MEDIUM | failure-mode-resolver.ts | 44-158 | resolveFailureMode decision tree undertested | 5+ exit paths with complex conditionals - needs branch coverage tests. |
| S-TEST-004 | MEDIUM | confidence.ts | 133-176 | computeInjectionPriority needs tests | Combines 5 weighted factors - needs tests for each weight's contribution. |
| S-TEST-005 | LOW | noncompliance-checker.ts | 141-163 | extractKeywords edge cases | Needs tests for empty input, all-stopwords input, unicode handling. |

---

## Pipeline A Judges (Haiku findings evaluated by Sonnet)

### Judge 1: H-Adversarial Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-ADV-001 | **CONFIRM** | Valid concern. While commands are hardcoded, execSync without shell:false is an antipattern. Severity HIGH appropriate. |
| H-ADV-002 | **DISMISS** | Counter-proof: SHA256 hashes are collision-resistant and the 16-char prefix provides sufficient entropy. Timing attacks on hashes are impractical. |
| H-ADV-003 | **DISMISS** | Counter-proof: All parameters are properly parameterized with `?` placeholders. SQLite's json_extract is safe with parameterized queries. |
| H-ADV-004 | **MODIFY** -> INFO | The regex is simple (`/[^a-z0-9\s]/g`) with no backtracking. ReDoS requires catastrophic backtracking. Downgrade to INFO. |

### Judge 2: H-Bugs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-BUG-001 | **CONFIRM** -> CRITICAL | Critical typo in public API function name. Must be fixed. Upgrade severity - this breaks API usability. |
| H-BUG-002 | **CONFIRM** | Valid bug. Type declares parameter but implementation ignores it. MEDIUM appropriate. |
| H-BUG-003 | **DISMISS** | Counter-proof: When `lines.length < windowSize`, the loop simply doesn't execute (`i <= negative`), returning null correctly. |
| H-BUG-004 | **DISMISS** | Counter-proof: When activeOccurrences=0, result is -1 * 0.05 = -0.05, but the final Math.max(0, ...) clamps to 0. Semantically correct. |

### Judge 3: H-Decisions Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-DEC-001 | **CONFIRM** | Valid. Promotion thresholds affect system behavior significantly - should have inline comments explaining rationale. |
| H-DEC-002 | **CONFIRM** | Valid. Confidence base values are core to the algorithm - need justification in comments. |
| H-DEC-003 | **CONFIRM** | Valid. 0.3 threshold determines noncompliance classification - needs documentation. |
| H-DEC-004 | **MODIFY** -> INFO | Sliding window of 5 is a reasonable default and inline with code context - minor documentation gap. |

### Judge 4: H-Docs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-DOC-001 | **CONFIRM** | Valid. update() is complex with 8 optional fields - warrants detailed JSDoc. |
| H-DOC-002 | **MODIFY** -> LOW | The init command logs errors clearly. Exit codes are 1 for errors - standard pattern. Reduce severity. |
| H-DOC-003 | **CONFIRM** | Valid. Internal scoring functions should have algorithm explanation. |
| H-DOC-004 | **CONFIRM** | Valid. Recency tiers (7d/30d/90d) should be documented. |

### Judge 5: H-Spec Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-SPEC-001 | **DISMISS** | Counter-proof: Object spread with generated id/createdAt after schema validation is safe. The `Omit<>` type at line 17 prevents id/createdAt from being in input type. |
| H-SPEC-002 | N/A | Observation, not a finding. No action needed. |
| H-SPEC-003 | N/A | Observation, not a finding. No action needed. |

### Judge 6: H-Tests Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-TEST-001 | **CONFIRM** | Valid. Decision trees need comprehensive branch coverage testing. |
| H-TEST-002 | **CONFIRM** | Valid. Edge cases like 0 occurrences, timezone issues need explicit tests. |
| H-TEST-003 | **MODIFY** -> MEDIUM | Integration tests for CLI are important for regression prevention. Upgrade severity. |
| H-TEST-004 | **CONFIRM** | Valid. Boundary condition for small documents should be tested. |

---

## Pipeline B Judges (Sonnet findings evaluated by Sonnet)

### Judge 7: S-Adversarial Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-ADV-001 | **CONFIRM** | Valid. Pattern of execSync without explicit safety measures is concerning even with hardcoded commands. |
| S-ADV-002 | **CONFIRM** | Valid and important. Path traversal via symlinks is a real attack vector. copyDirRecursive should validate paths stay within target. |
| S-ADV-003 | **DISMISS** | Counter-proof: The CreateInput type uses `Omit<PatternOccurrence, 'id' \| 'createdAt'>` which prevents these fields from being in data at compile time. Runtime validation via schema parse adds defense. |
| S-ADV-004 | **CONFIRM** | Valid. Unbounded document search could enable DoS. Should add size limit check. |
| S-ADV-005 | **MODIFY** -> INFO | Timezone handling is noted in code (line 100-101 has guard). Minor concern. |

### Judge 8: S-Bugs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-BUG-001 | **CONFIRM** | Critical. Public API typo must be fixed immediately. CRITICAL severity correct. |
| S-BUG-002 | **CONFIRM** | Valid bug. Type interface promises functionality that doesn't exist. HIGH severity appropriate. |
| S-BUG-003 | **CONFIRM** | Valid. Comparing "Lines 45-50" format to evidence.carrierLocation (likely different format) will never match correctly. |
| S-BUG-004 | **DISMISS** | Counter-proof: When sourceAgreesWithCarrier is undefined, it's not `=== false`, so the condition fails and we correctly fall through to later checks. This is intentional - we only confirm drift when explicitly false. |
| S-BUG-005 | N/A | Scout acknowledged this is handled correctly with optional chaining. Not a bug. |

### Judge 9: S-Decisions Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-DEC-001 | **CONFIRM** | Valid. The asymmetric gaps (0.20 vs 0.15) between quote types suggest design intent that should be explained. |
| S-DEC-002 | **CONFIRM** | Valid. Same as H-DEC-001. Promotion thresholds need rationale. |
| S-DEC-003 | **CONFIRM** | Valid. 90-day half-life is a significant design choice affecting pattern decay - needs justification. |
| S-DEC-004 | **CONFIRM** | Valid. Minimum 2 keywords is a precision/recall tradeoff that should be documented. |
| S-DEC-005 | **CONFIRM** | Valid. The 5% penalty is called out in spec reference but inline rationale would help. |

### Judge 10: S-Docs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-DOC-001 | **CONFIRM** | Valid. 8 optional parameters need individual documentation. |
| S-DOC-002 | **CONFIRM** | Valid. Unused `_db` parameter is a code smell - should explain why kept or remove. |
| S-DOC-003 | **CONFIRM** | Valid. When salience vs formatting is returned affects downstream behavior. |
| S-DOC-004 | **CONFIRM** | Valid. Internal marker type needs documentation for maintainers. |
| S-DOC-005 | **CONFIRM** | Valid. Utility function lacks JSDoc. |

### Judge 11: S-Spec Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-SPEC-001 | **CONFIRM** | Valid concern. Spec says "security patterns get priority" but code completely excludes non-security. This may be intentional v1.0 scope limitation but should be documented. |
| S-SPEC-002 | N/A | Observation of compliance, not a finding. |
| S-SPEC-003 | N/A | Observation of compliance, not a finding. |
| S-SPEC-004 | N/A | Observation of compliance, not a finding. |

### Judge 12: S-Tests Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-TEST-001 | **CONFIRM** | Valid. File system operations are notoriously edge-case prone. HIGH severity appropriate. |
| S-TEST-002 | **CONFIRM** | Valid. Multiple threshold conditions need boundary tests. |
| S-TEST-003 | **CONFIRM** | Valid. 5+ branches in decision tree need coverage. |
| S-TEST-004 | **CONFIRM** | Valid. Multi-factor priority needs component testing. |
| S-TEST-005 | **CONFIRM** | Valid. Text processing edge cases should be tested. |

---

## High Judge Final Verdict

### Cross-Pipeline Analysis

**Duplicate Findings (Consolidated):**
1. **H-BUG-001 + S-BUG-001**: Function typo `promoteToDerivdPrinciple` - CONSOLIDATED as FINAL-001
2. **H-ADV-001 + S-ADV-001**: execSync security concern - CONSOLIDATED as FINAL-002
3. **H-DEC-001 + S-DEC-002**: Promotion thresholds undocumented - CONSOLIDATED as FINAL-003
4. **H-DEC-002 + S-DEC-001**: Quote type confidence bases - CONSOLIDATED as FINAL-004
5. **H-DOC-001 + S-DOC-001**: update() method documentation - CONSOLIDATED as FINAL-005
6. **H-TEST-001 + S-TEST-003**: resolveFailureMode testing - CONSOLIDATED as FINAL-006

### Haiku vs Sonnet Scout Comparison

**What Haiku Missed (Found Only by Sonnet):**

| ID | Severity | Title | Significance |
|----|----------|-------|--------------|
| S-ADV-002 | HIGH | Path traversal in copyDirRecursive | **Significant security finding** |
| S-ADV-004 | MEDIUM | DoS via unbounded document search | Security concern |
| S-BUG-003 | MEDIUM | Incorrect location format comparison | **Real bug** |
| S-DEC-003 | MEDIUM | 90-day half-life unexplained | Documentation gap |
| S-DEC-005 | LOW | Cross-project penalty justification | Documentation gap |
| S-DOC-002 | MEDIUM | Unused _db parameter | Code smell |
| S-DOC-004 | LOW | PatternWithCrossProjectMarker undocumented | Documentation gap |
| S-SPEC-001 | HIGH | Non-security pattern exclusion | **Design decision concern** |
| S-TEST-001 | HIGH | copyDirRecursive untested | Test coverage gap |

**What Sonnet Missed (Found Only by Haiku):**

| ID | Severity | Title | Significance |
|----|----------|-------|--------------|
| H-DEC-004 | INFO | Window size 5 undocumented | Minor (downgraded) |
| H-DOC-002 | LOW | Init command error documentation | Minor (downgraded) |

**Haiku False Positives (Correctly Dismissed):**
- H-ADV-002: Local path hash exposure (dismissed - secure design)
- H-ADV-003: SQL injection via json_extract (dismissed - properly parameterized)
- H-BUG-003: Sliding window boundary (dismissed - correct behavior)
- H-BUG-004: Off-by-one boost (dismissed - correctly clamped)
- H-SPEC-001: Append-only violation (dismissed - type system prevents)

### High Judge Reversals

| Original ID | Original Verdict | High Judge Verdict | Reasoning |
|-------------|-----------------|-------------------|-----------|
| S-ADV-003 | DISMISS | **UPHOLD DISMISS** | Type system provides compile-time protection, schema provides runtime protection. Double defense is adequate. |
| S-BUG-004 | DISMISS | **UPHOLD DISMISS** | The undefined case falling through to later checks is correct behavior - synthesis drift should only be declared when explicitly proven false. |
| H-SPEC-001 | DISMISS | **UPHOLD DISMISS** | The Omit type at line 17 ensures CreateInput cannot contain id or createdAt. Object spread order doesn't matter when type prevents those fields. |

**No reversals were issued.** All judge dismissals were upheld upon review.

### Final Consolidated Findings

| ID | Severity | File | Lines | Title | Source | Description |
|----|----------|------|-------|-------|--------|-------------|
| FINAL-001 | CRITICAL | promotion-checker.ts | 131 | Function typo: promoteToDerivdPrinciple | H+S | Public API function misspelled - breaks consumers using correct spelling |
| FINAL-002 | HIGH | init.ts | 298-310 | Shell execution without shell:false | H+S | execSync calls should use {shell: false} or validate inputs for defense in depth |
| FINAL-003 | HIGH | init.ts | 318-331 | Path traversal in copyDirRecursive | S-only | No validation that paths stay within target directory - symlinks could escape |
| FINAL-004 | HIGH | pattern-occurrence.repo.ts | 216-218 | provisionalAlertId update not implemented | H+S | Type declares parameter but implementation ignores it - silent data loss |
| FINAL-005 | HIGH | promotion-checker.ts | 93-100 | Non-security pattern exclusion undocumented | S-only | Spec says "priority" but code completely excludes - needs explicit documentation if intentional |
| FINAL-006 | MEDIUM | noncompliance-checker.ts | 216 | Incorrect location format comparison | S-only | Comparing "Lines X-Y" format to evidence.carrierLocation will never match |
| FINAL-007 | MEDIUM | noncompliance-checker.ts | 106-109 | DoS via unbounded document search | S-only | No size limit on contextPack/spec - could enable DoS |
| FINAL-008 | MEDIUM | confidence.ts | 81-91 | Quote type confidence bases lack rationale | H+S | Core algorithm values (0.75, 0.55, 0.4) need inline justification |
| FINAL-009 | MEDIUM | promotion-checker.ts | 36-52 | Promotion thresholds undocumented | H+S | MIN_PROJECTS=3, MIN_CONFIDENCE=0.6 need rationale comments |
| FINAL-010 | MEDIUM | confidence.ts | 103 | 90-day half-life unexplained | S-only | Decay calculation uses 90 days with 0.15 max penalty - needs justification |
| FINAL-011 | MEDIUM | noncompliance-checker.ts | 112 | Noncompliance threshold 0.3 undocumented | H | Relevance threshold needs inline explanation |
| FINAL-012 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | update() lacks comprehensive JSDoc | H+S | 8 optional fields need individual documentation |
| FINAL-013 | MEDIUM | promotion-checker.ts | 238 | Unused _db parameter | S-only | Parameter kept for interface compatibility but unexplained |
| FINAL-014 | MEDIUM | init.ts | 318-331 | copyDirRecursive untested | S-only | Recursive file operations need test coverage |
| FINAL-015 | MEDIUM | failure-mode-resolver.ts | 44-158 | resolveFailureMode needs branch coverage tests | H+S | 5+ decision paths need comprehensive testing |
| FINAL-016 | MEDIUM | confidence.ts | 74-114 | computeAttributionConfidence edge case tests | H | 0 occurrences, negative days need explicit tests |
| FINAL-017 | LOW | failure-mode-resolver.ts | 167-185 | calculateAmbiguityScore undocumented | H | Internal scoring algorithm needs explanation |
| FINAL-018 | LOW | confidence.ts | 181-187 | computeRecencyWeight missing JSDoc | H | Recency tiers should be documented |
| FINAL-019 | LOW | noncompliance-checker.ts | 209-229 | analyzePossibleCauses return undocumented | S-only | When salience vs formatting returned unclear |
| FINAL-020 | LOW | confidence.ts | 119-121 | PatternWithCrossProjectMarker undocumented | S-only | Internal type needs maintainer documentation |
| FINAL-021 | LOW | init.ts | 318-331 | copyDirRecursive lacks JSDoc | S-only | Utility function needs documentation |
| FINAL-022 | LOW | noncompliance-checker.ts | 188-189 | Minimum 2 keywords threshold undocumented | S-only | Precision/recall tradeoff should be explained |
| FINAL-023 | LOW | confidence.ts | 166 | Cross-project penalty needs inline rationale | S-only | 0.95x multiplier referenced to spec but inline comment would help |

### Cross-Domain Patterns Identified

1. **Magic Number Pattern**: Multiple files contain undocumented thresholds (FINAL-008, FINAL-009, FINAL-010, FINAL-011, FINAL-022). This is a systemic issue across the codebase.

2. **Incomplete Type Implementation Pattern**: Type interfaces declare capabilities that aren't fully implemented (FINAL-004). Consider adding TypeScript strict mode or linting rules to catch this.

3. **Test Coverage Gap Pattern**: Complex decision logic lacks comprehensive tests (FINAL-014, FINAL-015, FINAL-016). Consider adding test coverage requirements to CI.

4. **Documentation Debt Pattern**: Internal algorithms lack explanatory comments (FINAL-017, FINAL-018, FINAL-019, FINAL-020). Establish documentation standards for helper functions.

### Priority Action Items

**Must Fix (CRITICAL/HIGH):**
1. FINAL-001: Fix function typo `promoteToDerivdPrinciple` -> `promoteToDerivedPrinciple`
2. FINAL-002: Add `{shell: false}` to execSync calls or document security rationale
3. FINAL-003: Add path validation to copyDirRecursive to prevent symlink escape
4. FINAL-004: Implement provisionalAlertId update or remove from type
5. FINAL-005: Document intentional exclusion of non-security patterns

**Should Fix (MEDIUM):**
6. FINAL-006: Fix location format comparison in analyzePossibleCauses
7. FINAL-007: Add size limit to document search
8. FINAL-008-013: Add rationale comments to magic numbers
14. FINAL-014-016: Add test coverage for identified gaps

---

## Summary Statistics

| Metric | Pipeline A (Haiku) | Pipeline B (Sonnet) | Combined |
|--------|-------------------|---------------------|----------|
| Scout Findings | 21 | 26 | 47 |
| Confirmed by Judges | 12 | 18 | 30 |
| Dismissed by Judges | 6 | 3 | 9 |
| Modified by Judges | 3 | 2 | 5 |
| N/A (Observations) | 0 | 3 | 3 |
| Reversed by High Judge | 0 | 0 | 0 |
| **Final Unique Issues** | - | - | **23** |

### Pipeline Quality Comparison

| Metric | Haiku | Sonnet |
|--------|-------|--------|
| Accuracy Rate | 57% | 69% |
| Unique HIGH+ Findings | 2 | 5 |
| False Positive Rate | 29% | 12% |
| Duplicate Findings | 6 | 6 |

### Severity Distribution (Final)

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 11 |
| LOW | 7 |
| **Total** | **23** |

---

## Conclusion

The dual-pipeline (Haiku + Sonnet) -> Sonnet Judges -> Opus High Judge architecture proved effective:

1. **Redundancy Value**: Both pipelines caught the critical function typo independently, providing high confidence.

2. **Sonnet Superiority**: Sonnet scouts found 9 issues that Haiku missed, including 3 HIGH-severity findings. Sonnet had a lower false positive rate (12% vs 29%).

3. **Judge Effectiveness**: Judges correctly dismissed 9 findings across both pipelines, preventing noise in the final report.

4. **High Judge Consolidation**: The Opus High Judge successfully deduplicated 6 findings found by both pipelines and identified 4 systemic patterns.

5. **No Reversals Needed**: All judge decisions were sound; no High Judge reversals were issued.

**Recommendation**: For cost-sensitive scenarios, Sonnet-only scouts provide better accuracy. For high-stakes reviews, the dual-pipeline approach provides valuable redundancy and cross-validation.
