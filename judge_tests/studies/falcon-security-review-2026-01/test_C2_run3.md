# Test C2 Run 3: Dual-Pipeline Hierarchical Review

**Date:** 2026-01-21
**Configuration:** (Haiku + Sonnet) Scouts -> Sonnet Judges -> Opus High Judge

## Architecture
```
Pipeline A:                      Pipeline B:
Haiku Scouts (6)                 Sonnet Scouts (6)
      |                                |
      v                                v
Sonnet Judges (6)                Sonnet Judges (6)
      |                                |
      +----------------+---------------+
                       |
                       v
             Opus High Judge (1)
             (receives ALL 12 judge reports, can REVERSE decisions)
```

## Files Reviewed
1. `src/storage/repositories/pattern-occurrence.repo.ts`
2. `src/evolution/promotion-checker.ts`
3. `src/attribution/failure-mode-resolver.ts`
4. `src/attribution/noncompliance-checker.ts`
5. `src/cli/commands/init.ts`
6. `src/injection/confidence.ts`

---

## Pipeline A: Haiku Scouts

### H-Adversarial Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-ADV-001 | HIGH | init.ts | 296-301 | Command injection via git commands | `findGitRoot()` uses `execSync` with shell interpretation. While it doesn't take user input directly, if the working directory path contains shell metacharacters, it could lead to issues. The function should use `{ shell: false }` option or spawn-based approach. |
| H-ADV-002 | MEDIUM | init.ts | 304-309 | Unvalidated git remote URL | `getGitRemoteOrigin()` returns user-controllable git remote URL that flows into database queries. While parameterized queries prevent SQL injection, malicious URL patterns could be stored. |
| H-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 263-287 | JSON extraction from untrusted data | `findByGitDoc` uses SQLite json_extract on user-controllable fingerprint data. While SQLite's JSON functions are generally safe, complex JSON injection patterns should be considered. |
| H-ADV-004 | LOW | init.ts | 318-331 | Directory traversal in copyDirRecursive | `copyDirRecursive` doesn't validate that destination paths remain within expected directories. Symlinks in source could cause writes outside intended destination. |
| H-ADV-005 | MEDIUM | noncompliance-checker.ts | 141-163 | ReDoS potential in keyword extraction | `extractKeywords` uses regex `/[^a-z0-9\s]/g` on potentially large user-controlled strings (title + description). While this specific regex is safe, the pattern of processing unbounded user input warrants review. |

### H-Bugs Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-BUG-001 | MEDIUM | promotion-checker.ts | 131 | Typo in function name | Function `promoteToDerivdPrinciple` has a typo - should be `promoteToDerivedPrinciple`. This affects API consistency and discoverability. |
| H-BUG-002 | LOW | noncompliance-checker.ts | 183 | Off-by-one in sliding window | Loop `for (let i = 0; i <= lines.length - windowSize; i++)` could miss the last valid window position if document has exactly windowSize lines. Should be `< lines.length - windowSize + 1`. |
| H-BUG-003 | MEDIUM | confidence.ts | 192-196 | Timezone-sensitive date calculation | `daysSinceDate` computes days based on local timezone. If `isoDate` is UTC and local time differs, results could be off by a day at boundaries. |
| H-BUG-004 | LOW | pattern-occurrence.repo.ts | 200-246 | Update method missing provisionalAlertId handling | The `update` method accepts `provisionalAlertId` in options but never processes it - it's missing from the updates array construction. |
| H-BUG-005 | MEDIUM | init.ts | 167 | Slug sanitization removes valid chars | `replace(/[^a-z0-9_]/g, '-')` removes uppercase letters before checking. Combined with case conversion, input "MyProject" becomes "myproject" but "My-Project" becomes "my-project". Inconsistent handling. |

### H-Decisions Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DEC-001 | LOW | promotion-checker.ts | 36-52 | Undocumented magic numbers for promotion | Constants MIN_PROJECTS_FOR_PROMOTION=3, MIN_DERIVED_CONFIDENCE=0.6, PROJECT_COUNT_BOOST=0.05 lack rationale. Why 3 projects? Why 60% confidence threshold? |
| H-DEC-002 | LOW | confidence.ts | 81-91 | Evidence quality base values undocumented | Magic numbers 0.75 (verbatim), 0.55 (paraphrase), 0.4 (inferred) lack justification. Why these specific values? |
| H-DEC-003 | LOW | noncompliance-checker.ts | 111-112 | Threshold 0.3 for relevance unexplained | `match.relevanceScore >= 0.3` threshold appears arbitrary. What's the rationale for 30%? |
| H-DEC-004 | LOW | noncompliance-checker.ts | 182 | Window size 5 not explained | `windowSize = 5` for sliding window search is undocumented. Why 5 lines? |
| H-DEC-005 | MEDIUM | failure-mode-resolver.ts | 69 | Confidence modifier -0.15 undocumented | The penalty for suspected synthesis drift (`confidenceModifier = -0.15`) lacks explanation. Why 15%? |

### H-Docs Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DOC-001 | LOW | pattern-occurrence.repo.ts | 19-29 | Missing JSDoc for findById | `findById` method lacks parameter documentation and return value description. |
| H-DOC-002 | LOW | init.ts | 66-71 | Command options missing descriptions | The commander options lack detailed descriptions for what values are acceptable. |
| H-DOC-003 | MEDIUM | confidence.ts | 36-60 | computePatternStats lacks example | Complex function computing statistics from occurrences lacks usage examples in JSDoc. |
| H-DOC-004 | LOW | failure-mode-resolver.ts | 167-185 | calculateAmbiguityScore internal logic undocumented | Scoring logic (3/2/1 points for vagueness signals) not explained in doc comments. |
| H-DOC-005 | LOW | promotion-checker.ts | 212-229 | findMatchingPatternsAcrossProjects lacks JSDoc | Private function performs critical cross-project query but has minimal documentation. |

### H-Spec Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-SPEC-001 | MEDIUM | pattern-occurrence.repo.ts | 1-5 | Append-only claim not enforced | File header states "append-only" but the `update` method allows modifying status to 'inactive'. Spec compliance unclear - is status change considered mutation? |
| H-SPEC-002 | LOW | promotion-checker.ts | 93-100 | Security-only promotion may be too restrictive | Spec mentions "Security patterns get priority in injection" but code only allows security category for promotion. Other HIGH/CRITICAL patterns may need promotion path. |
| H-SPEC-003 | MEDIUM | confidence.ts | 62-114 | Spec Section 4.1 formula deviation | Code comments reference "Spec Section 4.1" but implementation may deviate. Needs verification against actual spec formula. |
| H-SPEC-004 | LOW | noncompliance-checker.ts | 10-16 | Ambiguity routing note lacks spec reference | Comment describes ambiguity routing to DocUpdateRequest but doesn't cite which spec section defines this behavior. |
| H-SPEC-005 | LOW | failure-mode-resolver.ts | 1-14 | Decision tree steps don't match code structure | Header lists steps A-E but code flow doesn't clearly map to these labeled steps. |

### H-Tests Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-TEST-001 | MEDIUM | failure-mode-resolver.ts | 44-158 | resolveFailureMode lacks edge case coverage | Complex decision tree with multiple branches. Edge cases like empty evidence, null fields, boundary values need test coverage. |
| H-TEST-002 | MEDIUM | noncompliance-checker.ts | 171-199 | searchDocument window edge cases | Sliding window algorithm needs tests for: empty document, document shorter than window, single line matches. |
| H-TEST-003 | LOW | confidence.ts | 181-187 | computeRecencyWeight boundary tests | Function has 4 distinct return values based on day boundaries (7, 30, 90). Boundary value testing needed. |
| H-TEST-004 | MEDIUM | init.ts | 71-294 | init command lacks integration tests | Complex initialization flow with filesystem, git, and database operations needs end-to-end test coverage. |
| H-TEST-005 | LOW | promotion-checker.ts | 235-269 | computeDerivedConfidence untested scenarios | Function handles empty patterns array (returns 0) but edge cases with mixed confidence values need testing. |

---

## Pipeline B: Sonnet Scouts

### S-Adversarial Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-ADV-001 | HIGH | init.ts | 296-310 | Shell command injection in git operations | Three functions (`findGitRoot`, `getGitRemoteOrigin`, `getRepoSubdir`) use `execSync` with shell interpretation. If an attacker can control the working directory name or environment, they may inject commands. The functions should use `execFileSync` with explicit argument arrays instead. |
| S-ADV-002 | HIGH | init.ts | 318-331 | Symlink traversal in recursive copy | `copyDirRecursive` follows symlinks via `fs.copyFileSync` and `fs.readdirSync`. A malicious CORE directory with symlinks pointing outside could overwrite arbitrary files. Should use `lstatSync` to detect symlinks and either reject or handle specially. |
| S-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 263-388 | SQL injection via JSON path expressions | The `findByGitDoc`, `findByLinearDocId`, `findByWebUrl`, and `findByExternalId` methods use JSON path queries on user-controllable fingerprint data. While parameterized, the JSON structure itself could be crafted to cause unexpected behavior. |
| S-ADV-004 | MEDIUM | init.ts | 40-64 | Input validation incomplete | `validateInput` checks for null bytes and length but doesn't sanitize path traversal sequences (../) or shell metacharacters in project/workspace names that flow into filesystem paths. |
| S-ADV-005 | LOW | noncompliance-checker.ts | 157-163 | Unbounded keyword extraction | `extractKeywords` processes `title` and `description` without size limits. Extremely large inputs could cause performance issues or memory exhaustion. |
| S-ADV-006 | MEDIUM | init.ts | 250 | YAML serialization of untrusted data | `yaml.stringify(config)` serializes data including user-provided project name. YAML special characters could cause parsing issues when config is later read. |

### S-Bugs Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-BUG-001 | HIGH | promotion-checker.ts | 131 | Function name typo: promoteToDerivdPrinciple | Critical typo in exported function name - missing 'e' in 'Derived'. This is a public API that consumers will call incorrectly. Should be `promoteToDerivedPrinciple`. |
| S-BUG-002 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | Update ignores provisionalAlertId parameter | The `update` method signature accepts `provisionalAlertId` but the implementation never adds it to the updates array or SQL. The parameter is silently ignored. |
| S-BUG-003 | MEDIUM | noncompliance-checker.ts | 183 | Sliding window boundary error | Loop condition `i <= lines.length - windowSize` should be `i <= lines.length - windowSize` but the slice `lines.slice(i, i + windowSize)` could return fewer than windowSize elements at the boundary, causing inconsistent matching. |
| S-BUG-004 | LOW | confidence.ts | 192-196 | Date calculation ignores timezone | `daysSinceDate` creates Date objects from ISO strings without explicit timezone handling. If lastSeenActive is in a different timezone than the server, day calculations could be off by 1. |
| S-BUG-005 | MEDIUM | init.ts | 167 | Slug generation loses character info | `projectName.toLowerCase().replace(/[^a-z0-9_]/g, '-')` converts "My_Project" correctly but "MyProject123!" becomes "myproject123-" with trailing hyphen that then fails slug validation if only hyphens remain. |
| S-BUG-006 | LOW | failure-mode-resolver.ts | 89 | Empty conflictSignals array check | `evidence.conflictSignals.length > 0` works but if conflictSignals is undefined (not empty array), this will throw. Schema should guarantee array but defensive check missing. |

### S-Decisions Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DEC-001 | MEDIUM | promotion-checker.ts | 36-52 | Magic numbers lack domain justification | Multiple unexplained constants: MIN_PROJECTS_FOR_PROMOTION=3 (why not 2 or 5?), MIN_DERIVED_CONFIDENCE=0.6 (statistical basis?), PROJECT_COUNT_BOOST=0.05 (empirically derived?). These critical thresholds need documented rationale. |
| S-DEC-002 | MEDIUM | confidence.ts | 81-91 | Evidence quality scores arbitrary | Base confidence values (verbatim=0.75, paraphrase=0.55, inferred=0.4) have no documented derivation. Are these based on empirical data, expert judgment, or arbitrary? |
| S-DEC-003 | LOW | confidence.ts | 102-104 | 90-day half-life undocumented | Decay formula uses 90-day half-life with 0.15 max penalty. Why 90 days? What research supports this decay rate? |
| S-DEC-004 | LOW | noncompliance-checker.ts | 181-182 | Window parameters unexplained | `windowSize = 5` and minimum keyword matches `score >= 2` are unexplained. These directly affect false positive/negative rates. |
| S-DEC-005 | MEDIUM | failure-mode-resolver.ts | 105-117 | Ambiguity vs incompleteness threshold undocumented | Decision uses `>= 2` threshold for both scores. Why 2? What happens at score=2 for both (incompleteness wins due to order)? |
| S-DEC-006 | LOW | init.ts | 109 | Hash truncation length unexplained | `digest('hex').slice(0, 16)` - why 16 characters? This gives 64 bits of entropy which may be insufficient for collision resistance across all local repos. |

### S-Docs Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DOC-001 | MEDIUM | confidence.ts | 36-60 | computePatternStats lacks return value docs | Function returns PatternStats but JSDoc doesn't explain what each field represents or valid ranges. Critical for consumers to understand adherenceRate can be null. |
| S-DOC-002 | LOW | pattern-occurrence.repo.ts | 23-29 | findById missing @returns documentation | Method returns null if not found but JSDoc doesn't document this behavior. Callers may not expect null. |
| S-DOC-003 | MEDIUM | failure-mode-resolver.ts | 44-158 | resolveFailureMode lacks algorithm documentation | Complex decision tree implementation but JSDoc only says "deterministic function". Should document the decision priority order and why. |
| S-DOC-004 | LOW | init.ts | 296-316 | Helper functions lack JSDoc | `findGitRoot`, `getGitRemoteOrigin`, `getRepoSubdir` are undocumented. Their error handling behavior (return null on failure) should be explicit. |
| S-DOC-005 | LOW | noncompliance-checker.ts | 209-228 | analyzePossibleCauses undocumented | Private function makes important decisions about noncompliance causes but has no documentation explaining the logic. |
| S-DOC-006 | MEDIUM | promotion-checker.ts | 57-126 | checkForPromotion lacks precondition docs | Function assumes pattern is project-scoped but JSDoc doesn't state this precondition. Also doesn't document what happens if pattern.scope is workspace-level. |

### S-Spec Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-SPEC-001 | HIGH | pattern-occurrence.repo.ts | 200-246 | Append-only invariant violated | Header claims "append-only" per spec but `update` method mutates existing records (status, wasInjected, wasAdheredTo). This contradicts the append-only design principle stated in CLAUDE.md. Should create new records or use a different pattern. |
| S-SPEC-002 | MEDIUM | promotion-checker.ts | 93-99 | Promotion restriction not in spec | Code restricts promotion to security category only, but spec (referenced in file header) says "security patterns get PRIORITY" not exclusivity. Non-security HIGH/CRITICAL patterns should still be eligible. |
| S-SPEC-003 | MEDIUM | confidence.ts | 62-114 | Spec formula reference unverifiable | Comment references "Spec Section 4.1" but we cannot verify the formula matches. If spec changed, code may be out of sync. Need spec version tracking. |
| S-SPEC-004 | LOW | failure-mode-resolver.ts | 7-14 | Decision tree steps misaligned | Header documents steps A-E but code doesn't use these labels in comments. Step mapping is unclear - maintainers can't verify spec compliance. |
| S-SPEC-005 | MEDIUM | noncompliance-checker.ts | 10-16 | Ambiguity routing diverges from comment | Comment says route to DocUpdateRequest AND PatternDefinition but code only returns NoncomplianceCheckResult. The DocUpdateRequest creation path isn't implemented here. |

### S-Tests Scout

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-TEST-001 | HIGH | init.ts | 71-294 | init command lacks test coverage | Complex command with 9 steps involving filesystem, database, git operations. No test file found. Critical paths: existing project check, workspace creation, CORE file copying all untested. |
| S-TEST-002 | MEDIUM | failure-mode-resolver.ts | 44-158 | Decision tree branches untested | resolveFailureMode has 10+ distinct code paths. Test coverage should include: synthesis drift proven, synthesis drift suspected, mandatory doc missing, conflicts, ambiguity vs incompleteness scoring, each carrierInstructionKind. |
| S-TEST-003 | MEDIUM | noncompliance-checker.ts | 84-134 | checkForNoncompliance boundary conditions | Function needs tests for: keyword count = 0, relevanceScore exactly 0.3, document shorter than window, contextPack match vs spec match priority. |
| S-TEST-004 | LOW | confidence.ts | 133-176 | computeInjectionPriority edge cases | Test coverage needed for: zero overlaps, maximum overlaps, cross-project penalty flag, null lastSeenActive. |
| S-TEST-005 | MEDIUM | pattern-occurrence.repo.ts | 256-388 | Document fingerprint queries untested | Phase 5 methods (findByGitDoc, findByLinearDocId, findByWebUrl, findByExternalId) have complex JSON queries that need test coverage to verify correct extraction. |
| S-TEST-006 | LOW | promotion-checker.ts | 275-329 | checkWorkspaceForPromotions integration test | Function queries multiple tables and creates repos internally. Integration test needed to verify correct pattern discovery and filtering. |

---

## Pipeline A Judges (Haiku findings evaluated by Sonnet)

### Judge for H-Adversarial

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-ADV-001 | HIGH | CONFIRM | HIGH | Valid: execSync with shell interpretation is risky |
| H-ADV-002 | MEDIUM | DISMISS | - | Counter-proof: URL is canonicalized, parameterized queries |
| H-ADV-003 | MEDIUM | MODIFY | LOW | SQLite json_extract is safe, theoretical concern only |
| H-ADV-004 | LOW | CONFIRM | LOW | Valid symlink concern, defense-in-depth warranted |
| H-ADV-005 | MEDIUM | DISMISS | - | Regex is not vulnerable to ReDoS, linear time |

**Confirmed: 3 | Dismissed: 2**

### Judge for H-Bugs

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-BUG-001 | MEDIUM | CONFIRM | MEDIUM | Clear typo in public API function |
| H-BUG-002 | LOW | DISMISS | - | Loop condition is correct, no off-by-one |
| H-BUG-003 | MEDIUM | CONFIRM | MEDIUM | Valid timezone edge case concern |
| H-BUG-004 | LOW | CONFIRM | LOW | Parameter accepted but never processed |
| H-BUG-005 | MEDIUM | MODIFY | LOW | Behavior is consistent, edge case only |

**Confirmed: 4 | Dismissed: 1**

### Judge for H-Decisions

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-DEC-001 | LOW | CONFIRM | LOW | Critical thresholds lack justification |
| H-DEC-002 | LOW | CONFIRM | LOW | Core calculation values undocumented |
| H-DEC-003 | LOW | CONFIRM | LOW | 30% threshold is arbitrary |
| H-DEC-004 | LOW | CONFIRM | LOW | Window size affects search accuracy |
| H-DEC-005 | MEDIUM | MODIFY | LOW | Penalty factor, not critical threshold |

**Confirmed: 5 | Dismissed: 0**

### Judge for H-Docs

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-DOC-001 | LOW | CONFIRM | LOW | Public method should have docs |
| H-DOC-002 | LOW | DISMISS | - | Options are self-explanatory |
| H-DOC-003 | MEDIUM | CONFIRM | MEDIUM | Complex function needs examples |
| H-DOC-004 | LOW | CONFIRM | LOW | Scoring logic needs explanation |
| H-DOC-005 | LOW | CONFIRM | LOW | Important query needs documentation |

**Confirmed: 4 | Dismissed: 1**

### Judge for H-Spec

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-SPEC-001 | MEDIUM | CONFIRM | MEDIUM | Append-only claim but update allows changes |
| H-SPEC-002 | LOW | CONFIRM | LOW | "Priority" interpreted as exclusivity |
| H-SPEC-003 | MEDIUM | CONFIRM | MEDIUM | Cannot verify spec compliance |
| H-SPEC-004 | LOW | DISMISS | - | Design note, not spec claim |
| H-SPEC-005 | LOW | CONFIRM | LOW | Steps don't map to code |

**Confirmed: 4 | Dismissed: 1**

### Judge for H-Tests

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| H-TEST-001 | MEDIUM | CONFIRM | MEDIUM | Complex decision tree needs coverage |
| H-TEST-002 | MEDIUM | CONFIRM | MEDIUM | Boundary testing important |
| H-TEST-003 | LOW | CONFIRM | LOW | Day boundaries need testing |
| H-TEST-004 | MEDIUM | CONFIRM | MEDIUM | Complex flow needs e2e tests |
| H-TEST-005 | LOW | CONFIRM | LOW | Edge cases need testing |

**Confirmed: 5 | Dismissed: 0**

---

## Pipeline B Judges (Sonnet findings evaluated by Sonnet)

### Judge for S-Adversarial

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-ADV-001 | HIGH | CONFIRM | HIGH | Valid: execSync with shell is risky |
| S-ADV-002 | HIGH | CONFIRM | HIGH | Symlink traversal can write outside |
| S-ADV-003 | MEDIUM | DISMISS | - | JSON paths hardcoded, not user-controllable |
| S-ADV-004 | MEDIUM | CONFIRM | MEDIUM | Path traversal sequences not checked |
| S-ADV-005 | LOW | CONFIRM | LOW | No size limit is DoS vector |
| S-ADV-006 | MEDIUM | DISMISS | - | yaml.stringify properly escapes |

**Confirmed: 4 | Dismissed: 2**

### Judge for S-Bugs

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-BUG-001 | HIGH | CONFIRM | HIGH | Public API typo |
| S-BUG-002 | MEDIUM | CONFIRM | MEDIUM | Silent bug, caller expects it to work |
| S-BUG-003 | MEDIUM | DISMISS | - | Fewer elements at boundary is acceptable |
| S-BUG-004 | LOW | CONFIRM | LOW | Timezone edge case |
| S-BUG-005 | MEDIUM | CONFIRM | MEDIUM | Trailing hyphen possible |
| S-BUG-006 | LOW | DISMISS | - | Schema guarantees array |

**Confirmed: 4 | Dismissed: 2**

### Judge for S-Decisions

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-DEC-001 | MEDIUM | CONFIRM | MEDIUM | Critical thresholds need rationale |
| S-DEC-002 | MEDIUM | CONFIRM | MEDIUM | Core values need documentation |
| S-DEC-003 | LOW | CONFIRM | LOW | Decay rate should be documented |
| S-DEC-004 | LOW | CONFIRM | LOW | Parameters affect accuracy |
| S-DEC-005 | MEDIUM | CONFIRM | MEDIUM | Threshold and tie-breaking undocumented |
| S-DEC-006 | LOW | DISMISS | - | 64 bits sufficient for local repos |

**Confirmed: 5 | Dismissed: 1**

### Judge for S-Docs

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-DOC-001 | MEDIUM | CONFIRM | MEDIUM | Return value fields need docs |
| S-DOC-002 | LOW | CONFIRM | LOW | Null return not documented |
| S-DOC-003 | MEDIUM | CONFIRM | MEDIUM | Decision tree needs algorithm docs |
| S-DOC-004 | LOW | CONFIRM | LOW | Error handling should be explicit |
| S-DOC-005 | LOW | CONFIRM | LOW | Important logic undocumented |
| S-DOC-006 | MEDIUM | CONFIRM | MEDIUM | Preconditions not documented |

**Confirmed: 6 | Dismissed: 0**

### Judge for S-Spec

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-SPEC-001 | HIGH | CONFIRM | HIGH | Violates CLAUDE.md append-only principle |
| S-SPEC-002 | MEDIUM | CONFIRM | MEDIUM | Spec says priority, not exclusivity |
| S-SPEC-003 | MEDIUM | CONFIRM | MEDIUM | Formula unverifiable without spec |
| S-SPEC-004 | LOW | CONFIRM | LOW | Step mapping unclear |
| S-SPEC-005 | MEDIUM | CONFIRM | MEDIUM | DocUpdateRequest path not implemented |

**Confirmed: 5 | Dismissed: 0**

### Judge for S-Tests

| Finding | Original Severity | Verdict | Final Severity | Reasoning |
|---------|------------------|---------|----------------|-----------|
| S-TEST-001 | HIGH | CONFIRM | HIGH | Critical CLI entry point untested |
| S-TEST-002 | MEDIUM | CONFIRM | MEDIUM | 10+ code paths need coverage |
| S-TEST-003 | MEDIUM | CONFIRM | MEDIUM | Boundary conditions critical |
| S-TEST-004 | LOW | CONFIRM | LOW | Edge cases need coverage |
| S-TEST-005 | MEDIUM | CONFIRM | MEDIUM | Complex JSON queries need tests |
| S-TEST-006 | LOW | CONFIRM | LOW | Integration test needed |

**Confirmed: 6 | Dismissed: 0**

---

## High Judge Final Verdict

### Pipeline Comparison: What Haiku Missed vs Sonnet

| Finding | Haiku Assessment | Sonnet Assessment | High Judge Notes |
|---------|-----------------|-------------------|------------------|
| Symlink traversal | H-ADV-004: LOW | S-ADV-002: HIGH | Sonnet correctly identified arbitrary file write risk |
| Path traversal validation | Not found | S-ADV-004: MEDIUM | Sonnet caught validation gap |
| Slug trailing hyphen | H-BUG-005: imprecise | S-BUG-005: precise | Sonnet gave clearer bug description |
| Append-only violation | H-SPEC-001: MEDIUM | S-SPEC-001: HIGH | Sonnet cited CLAUDE.md directly |
| Init test coverage | H-TEST-004: MEDIUM | S-TEST-001: HIGH | Sonnet recognized criticality |

### High Judge Reversals

| Original | Reversal | Reasoning |
|----------|----------|-----------|
| H-SPEC-001 MEDIUM | **Upgrade to HIGH** | Sonnet correctly identified this violates CLAUDE.md: "Never mutate occurrence records; mark inactive instead" |
| H-ADV-004 LOW | **Upgrade to MEDIUM** | Combined with S-ADV-004, pattern of insufficient path validation warranting MEDIUM |
| H-TEST-004 MEDIUM | **Upgrade to HIGH** | Init command is primary CLI entry point; no test coverage is critical gap |

### Cross-Domain Patterns

**Pattern 1: Path Security** (init.ts)
- Findings: S-ADV-001, S-ADV-002, S-ADV-004, H-ADV-001, H-ADV-004
- Recommendation: Security audit of all path handling

**Pattern 2: Magic Number Documentation** (promotion-checker.ts, confidence.ts, noncompliance-checker.ts, failure-mode-resolver.ts)
- Findings: All H-DEC and S-DEC findings
- Recommendation: Create THRESHOLDS.md documenting rationale

**Pattern 3: Spec Compliance Verification** (pattern-occurrence.repo.ts, confidence.ts, noncompliance-checker.ts, failure-mode-resolver.ts)
- Findings: All H-SPEC and S-SPEC findings
- Recommendation: Spec version tracking and automated compliance checks

**Pattern 4: Test Coverage Gaps** (All 6 files)
- Findings: All H-TEST and S-TEST findings
- Recommendation: 80% coverage target for these files

### Final Verdict List

#### HIGH (5)

| ID | File | Title | Source |
|----|------|-------|--------|
| FINAL-001 | init.ts:296-310 | Shell command injection in git operations | H-ADV-001, S-ADV-001 |
| FINAL-002 | init.ts:318-331 | Symlink traversal in recursive copy | S-ADV-002 (H-ADV-004 upgraded) |
| FINAL-003 | promotion-checker.ts:131 | Function typo: promoteToDerivdPrinciple | H-BUG-001, S-BUG-001 |
| FINAL-004 | pattern-occurrence.repo.ts:200-246 | Append-only invariant violated by update() | H-SPEC-001 (upgraded), S-SPEC-001 |
| FINAL-005 | init.ts | Init command lacks test coverage | H-TEST-004 (upgraded), S-TEST-001 |

#### MEDIUM (16)

| ID | File | Title | Source |
|----|------|-------|--------|
| FINAL-006 | init.ts:40-64 | Input validation incomplete (path traversal) | S-ADV-004 |
| FINAL-007 | pattern-occurrence.repo.ts:200-246 | Update ignores provisionalAlertId | H-BUG-004, S-BUG-002 |
| FINAL-008 | init.ts:167 | Slug generation edge cases | H-BUG-005, S-BUG-005 |
| FINAL-009 | promotion-checker.ts:36-52 | Magic numbers lack domain justification | H-DEC-001, S-DEC-001 |
| FINAL-010 | confidence.ts:81-91 | Evidence quality scores arbitrary | H-DEC-002, S-DEC-002 |
| FINAL-011 | failure-mode-resolver.ts:105-117 | Ambiguity threshold undocumented | S-DEC-005 |
| FINAL-012 | confidence.ts:36-60 | computePatternStats lacks return docs | H-DOC-003, S-DOC-001 |
| FINAL-013 | failure-mode-resolver.ts:44-158 | resolveFailureMode lacks algorithm docs | S-DOC-003 |
| FINAL-014 | promotion-checker.ts:57-126 | checkForPromotion lacks precondition docs | S-DOC-006 |
| FINAL-015 | promotion-checker.ts:93-99 | Promotion restriction not in spec | H-SPEC-002, S-SPEC-002 |
| FINAL-016 | confidence.ts:62-114 | Spec formula reference unverifiable | H-SPEC-003, S-SPEC-003 |
| FINAL-017 | noncompliance-checker.ts:10-16 | Ambiguity routing diverges from comment | S-SPEC-005 |
| FINAL-018 | failure-mode-resolver.ts:44-158 | Decision tree branches untested | H-TEST-001, S-TEST-002 |
| FINAL-019 | noncompliance-checker.ts:171-199 | searchDocument window edge cases | H-TEST-002 |
| FINAL-020 | noncompliance-checker.ts:84-134 | checkForNoncompliance boundary tests | S-TEST-003 |
| FINAL-021 | pattern-occurrence.repo.ts:256-388 | Document fingerprint queries untested | S-TEST-005 |

#### LOW (14)

| ID | File | Title | Source |
|----|------|-------|--------|
| FINAL-022 | pattern-occurrence.repo.ts:263-287 | JSON extraction theoretical concern | H-ADV-003 (modified) |
| FINAL-023 | noncompliance-checker.ts:141-163 | Unbounded keyword extraction | S-ADV-005 |
| FINAL-024 | confidence.ts:192-196 | Date calculation timezone edge case | H-BUG-003, S-BUG-004 |
| FINAL-025 | confidence.ts:102-104 | 90-day half-life undocumented | S-DEC-003 |
| FINAL-026 | noncompliance-checker.ts:181-182 | Window parameters unexplained | H-DEC-004, S-DEC-004 |
| FINAL-027 | noncompliance-checker.ts:111-112 | Threshold 0.3 unexplained | H-DEC-003 |
| FINAL-028 | pattern-occurrence.repo.ts:23-29 | findById missing @returns doc | H-DOC-001, S-DOC-002 |
| FINAL-029 | failure-mode-resolver.ts:167-185 | calculateAmbiguityScore undocumented | H-DOC-004 |
| FINAL-030 | promotion-checker.ts:212-229 | findMatchingPatternsAcrossProjects undocumented | H-DOC-005 |
| FINAL-031 | init.ts:296-316 | Helper functions lack JSDoc | S-DOC-004 |
| FINAL-032 | noncompliance-checker.ts:209-228 | analyzePossibleCauses undocumented | S-DOC-005 |
| FINAL-033 | failure-mode-resolver.ts:7-14 | Decision tree steps misaligned | H-SPEC-005, S-SPEC-004 |
| FINAL-034 | confidence.ts:181-187 | computeRecencyWeight boundary tests | H-TEST-003 |
| FINAL-035 | confidence.ts:133-176 | computeInjectionPriority edge cases | S-TEST-004 |

---

## Summary Statistics

| Metric | Pipeline A (Haiku) | Pipeline B (Sonnet) | Combined |
|--------|-------------------|---------------------|----------|
| Scout Findings | 30 | 35 | 65 |
| Confirmed by Judges | 25 | 30 | 55 |
| Dismissed by Judges | 5 | 5 | 10 |
| Reversed by High Judge | 3 | 0 | 3 |
| Final Unique Issues | - | - | 35 |

### By Severity (Final)

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 5 |
| MEDIUM | 16 |
| LOW | 14 |
| **Total** | **35** |

### By Domain (Final)

| Domain | HIGH | MEDIUM | LOW | Total |
|--------|------|--------|-----|-------|
| Adversarial/Security | 2 | 1 | 2 | 5 |
| Bugs | 1 | 2 | 1 | 4 |
| Decisions | 0 | 3 | 3 | 6 |
| Documentation | 0 | 3 | 5 | 8 |
| Spec Compliance | 1 | 3 | 1 | 5 |
| Test Coverage | 1 | 4 | 2 | 7 |

### Pipeline Quality Rating

| Pipeline | Rating | Notes |
|----------|--------|-------|
| Pipeline A (Haiku -> Sonnet) | 7/10 | Good basic coverage, some severity underestimation |
| Pipeline B (Sonnet -> Sonnet) | 9/10 | Excellent depth, accurate severity assessment |
| Combined System | 9.5/10 | Comprehensive through dual pipeline, High Judge adds value |

### Key Observations

1. **Sonnet scouts demonstrated superior analysis** with better severity calibration, deeper security analysis, and more comprehensive spec compliance checking.

2. **Haiku scouts were adequate** for basic code defect detection, documentation gap identification, and standard spec compliance checking.

3. **The High Judge role proved valuable** in consolidating duplicate findings, upgrading underrated issues (3 reversals), and identifying cross-domain patterns.

4. **Dual pipeline architecture** caught issues that single pipeline would miss, particularly in the security domain where Sonnet's deeper analysis identified symlink and path traversal issues that Haiku underrated.

5. **Recommendation**: For security-critical code, prefer Sonnet scouts. Haiku scouts are acceptable for documentation and low-risk code paths.
