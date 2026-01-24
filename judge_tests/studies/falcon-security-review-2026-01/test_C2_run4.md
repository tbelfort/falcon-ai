# Test C2 Run 4: Dual-Pipeline Hierarchical Review

**Date:** 2026-01-21
**Configuration:** (Haiku + Sonnet) Scouts -> Sonnet Judges -> Opus High Judge

## Files Reviewed
- `src/storage/repositories/pattern-occurrence.repo.ts`
- `src/evolution/promotion-checker.ts`
- `src/attribution/failure-mode-resolver.ts`
- `src/attribution/noncompliance-checker.ts`
- `src/cli/commands/init.ts`
- `src/injection/confidence.ts`

---

## Pipeline A: Haiku Scouts

### H-Adversarial Scout (Security Issues)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-ADV-001 | HIGH | init.ts | 296-310 | Command injection via git commands | `execSync` used with `git rev-parse` and `git remote get-url` without input sanitization. While inputs come from git itself, shell metacharacters in unusual repo configurations could cause issues. |
| H-ADV-002 | MEDIUM | init.ts | 318-331 | Path traversal in copyDirRecursive | No validation that `src` and `dest` paths don't contain path traversal sequences (../) that could copy files outside intended directories. |
| H-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 256-288 | SQL injection via JSON path | Using string interpolation in JSON_EXTRACT queries. While parameters are properly bound, the JSON path structure could be manipulated if attacker controls fingerprint data. |
| H-ADV-004 | LOW | init.ts | 40-64 | Incomplete input validation | validateInput checks for null bytes but validateSlug allows hyphens at start/end which could cause edge cases in slug-based lookups. |

### H-Bugs Scout (Logic Errors)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-BUG-001 | MEDIUM | confidence.ts | 93-96 | Off-by-one in occurrence boost | Boost calculation uses `activeOccurrences - 1` but doesn't handle edge case of 0 active occurrences, resulting in -0.05 boost (negative). |
| H-BUG-002 | LOW | noncompliance-checker.ts | 183-197 | Sliding window edge case | Window loop condition `i <= lines.length - windowSize` could skip final lines when doc has fewer than 5 lines. |
| H-BUG-003 | MEDIUM | promotion-checker.ts | 227-229 | Unnecessary double query | `findMatchingPatternsAcrossProjects` returns patterns, then calls `findById` for each - the row already contains all data. |
| H-BUG-004 | LOW | confidence.ts | 192-197 | Timezone assumption in date calc | `daysSinceDate` assumes local timezone alignment - could cause issues with UTC ISO dates and local date comparison. |

### H-Decisions Scout (Undocumented Decisions)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DEC-001 | MEDIUM | promotion-checker.ts | 36-52 | Magic numbers without rationale | MIN_PROJECTS_FOR_PROMOTION=3, MIN_DERIVED_CONFIDENCE=0.6, PROJECT_COUNT_BOOST=0.05 lack documented rationale for these specific values. |
| H-DEC-002 | LOW | noncompliance-checker.ts | 111-112 | Magic threshold 0.3 | Relevance score threshold of 0.3 is undocumented - why 30% keyword match indicates guidance exists? |
| H-DEC-003 | LOW | confidence.ts | 103 | 90-day half-life undocumented | Decay penalty uses 90 days but no explanation why this duration was chosen. |
| H-DEC-004 | LOW | failure-mode-resolver.ts | 171-184 | Ambiguity score thresholds | Why >= 2 score triggers ambiguity? Why vaguenessSignals >= 3 gives score of 3? |

### H-Docs Scout (Documentation Gaps)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-DOC-001 | LOW | pattern-occurrence.repo.ts | 200-246 | update() missing JSDoc for all params | Function has JSDoc but doesn't document individual options like patternId, provisionalAlertId meaning. |
| H-DOC-002 | LOW | promotion-checker.ts | 131 | Typo in function name | `promoteToDerivdPrinciple` is missing 'e' - should be `promoteToDerivedPrinciple`. |
| H-DOC-003 | LOW | init.ts | 71-294 | Large function lacks inline comments | Main action handler is 220+ lines with minimal inline comments explaining business logic sections. |
| H-DOC-004 | LOW | confidence.ts | 119-121 | Internal marker undocumented | `_crossProjectPenalty` marker uses underscore convention but no docs explaining when/how it's set. |

### H-Spec Scout (Spec Compliance)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-SPC-001 | MEDIUM | promotion-checker.ts | 93-99 | Security-only promotion hardcoded | Spec mentions security patterns are "prioritized" but code completely excludes non-security patterns from promotion. |
| H-SPC-002 | LOW | confidence.ts | 67-114 | Confidence formula lacks spec reference | Comment references "Spec Section 4.1" but exact formula isn't fully documented inline for verification. |
| H-SPC-003 | LOW | pattern-occurrence.repo.ts | 1-5 | Append-only claim vs update() | Header claims "append-only" but update() method allows mutation of existing records. |

### H-Tests Scout (Test Coverage)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| H-TST-001 | MEDIUM | failure-mode-resolver.ts | 44-158 | Complex decision tree needs edge case tests | Multiple branching paths need comprehensive test coverage for all failureMode outcomes. |
| H-TST-002 | MEDIUM | init.ts | 66-294 | CLI command difficult to unit test | Action handler does everything - git checks, DB writes, file copies - hard to test in isolation. |
| H-TST-003 | LOW | noncompliance-checker.ts | 141-163 | extractKeywords edge cases | Empty strings, single-character words, numbers-only text not covered. |

---

## Pipeline B: Sonnet Scouts

### S-Adversarial Scout (Security Issues)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-ADV-001 | HIGH | init.ts | 296-301 | Shell command execution without sanitization | `execSync('git rev-parse --show-toplevel')` is safe but pattern could be misused. More critically, git root path is used directly in file operations without canonicalization. |
| S-ADV-002 | HIGH | init.ts | 318-331 | Directory traversal via symlinks | `copyDirRecursive` follows symlinks without verification. Malicious CORE directory could link to sensitive system files. |
| S-ADV-003 | MEDIUM | pattern-occurrence.repo.ts | 243 | Dynamic SQL construction | `UPDATE pattern_occurrences SET ${updates.join(', ')}` - while safe due to hardcoded column names, dynamic SQL pattern is risky. |
| S-ADV-004 | MEDIUM | init.ts | 250 | YAML serialization injection | `yaml.stringify(config)` with user-controlled projectName could embed special YAML characters that cause parsing issues on read. |
| S-ADV-005 | LOW | noncompliance-checker.ts | 127 | Excerpt truncation may expose partial secrets | `match.excerpt` sliced to 500 chars could cut through sensitive data mid-word. |

### S-Bugs Scout (Logic Errors)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-BUG-001 | MEDIUM | confidence.ts | 95 | Negative occurrence boost | When `activeOccurrences = 0`, boost becomes `-0.05`. Should use `Math.max(0, stats.activeOccurrences - 1)`. |
| S-BUG-002 | MEDIUM | promotion-checker.ts | 173-178 | Duplicate pattern fetching | `findMatchingPatternsAcrossProjects` called twice in `promoteToDerivdPrinciple` - once at line 173, duplicating line 103's call pattern. |
| S-BUG-003 | LOW | failure-mode-resolver.ts | 56-62 | Boolean check order issue | `evidence.sourceAgreesWithCarrier === false` should explicitly check for false, but the outer condition already verified `hasCitation && sourceRetrievable`, making the inner check potentially redundant. |
| S-BUG-004 | LOW | noncompliance-checker.ts | 216 | String includes on potentially undefined | `evidence.carrierLocation.includes(match.location)` - if carrierLocation is empty string, this always returns false, causing false 'salience' flags. |
| S-BUG-005 | LOW | init.ts | 167 | Slug generation loses valid chars | `projectName.toLowerCase().replace(/[^a-z0-9_]/g, '-')` converts spaces to hyphens but also removes valid chars like already-existing hyphens, then re-adds them. |

### S-Decisions Scout (Undocumented Decisions)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DEC-001 | HIGH | promotion-checker.ts | 36-52 | Undocumented threshold values | Critical business logic thresholds (MIN_PROJECTS=3, MIN_CONFIDENCE=0.6) have no ADR or documented rationale. These gate automated security promotions. |
| S-DEC-002 | MEDIUM | confidence.ts | 81-91 | Evidence quality weights arbitrary | verbatim=0.75, paraphrase=0.55, inferred=0.4 - no documented justification for these specific values or their intervals. |
| S-DEC-003 | MEDIUM | noncompliance-checker.ts | 181-182 | Window size and minimum keywords hardcoded | windowSize=5, minMatches=2, threshold=0.3 are all magic numbers without documented reasoning. |
| S-DEC-004 | LOW | confidence.ts | 183-187 | Recency weight tiers undocumented | 7/30/90 day thresholds with 1.0/0.95/0.9/0.8 weights lack justification. |
| S-DEC-005 | LOW | failure-mode-resolver.ts | 105-117 | Score comparison threshold | Why `>= 2` to trigger failureMode? Why `>` for comparison instead of `>=`? |

### S-Docs Scout (Documentation Gaps)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-DOC-001 | HIGH | promotion-checker.ts | 131 | Function name typo | `promoteToDerivdPrinciple` missing 'e' in 'Derived' - breaks IDE autocomplete and causes confusion. |
| S-DOC-002 | MEDIUM | pattern-occurrence.repo.ts | 3-5 | Misleading "append-only" claim | Comments claim append-only but `update()` method exists at line 200, contradicting the stated design principle. |
| S-DOC-003 | MEDIUM | confidence.ts | 119-121 | Internal type marker undocumented | `_crossProjectPenalty` underscore-prefixed property lacks documentation explaining its lifecycle and who sets it. |
| S-DOC-004 | LOW | init.ts | 253-268 | CORE file installation not documented | Copies files from package to project but no docs explain what CORE contains or why. |
| S-DOC-005 | LOW | failure-mode-resolver.ts | 167-218 | Score calculation logic complex | Two scoring functions with multiple conditions lack detailed comments explaining the heuristics. |

### S-Spec Scout (Spec Compliance)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-SPC-001 | HIGH | pattern-occurrence.repo.ts | 200-246 | Append-only violation | Spec requires append-only history but `update()` mutates existing records. Should create new record with reference to previous. |
| S-SPC-002 | MEDIUM | promotion-checker.ts | 93-99 | Over-restrictive promotion criteria | Spec says security patterns are "prioritized" but implementation completely blocks non-security patterns. Should apply priority weighting, not exclusion. |
| S-SPC-003 | MEDIUM | noncompliance-checker.ts | 221 | Removed ambiguity cause | Comment notes ambiguity removed from NoncomplianceCause but this decision isn't reflected in schema or validated. |
| S-SPC-004 | LOW | confidence.ts | 67-114 | Spec section reference unverifiable | References "Spec Section 4.1" but no mechanism to verify formula matches current spec version. |

### S-Tests Scout (Test Coverage)

| ID | Severity | File | Lines | Title | Description |
|----|----------|------|-------|-------|-------------|
| S-TST-001 | HIGH | init.ts | 66-294 | Untestable monolithic handler | 220+ line function combining git checks, DB operations, file I/O - impossible to unit test components independently. |
| S-TST-002 | MEDIUM | failure-mode-resolver.ts | 44-158 | Decision tree coverage | 6 failure modes with multiple code paths - needs comprehensive test matrix for all combinations. |
| S-TST-003 | MEDIUM | confidence.ts | 74-114 | Edge case coverage needed | Negative days, null stats, empty patterns, boundary conditions at confidence clamps need explicit tests. |
| S-TST-004 | MEDIUM | noncompliance-checker.ts | 171-199 | searchDocument edge cases | Empty documents, single-line docs, docs shorter than window, docs with only stop words. |
| S-TST-005 | LOW | promotion-checker.ts | 275-329 | checkWorkspaceForPromotions untested paths | Nested conditionals and database queries need mocking and coverage verification. |

---

## Pipeline A Judges (Haiku findings evaluated by Sonnet)

### Judge for H-Adversarial Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-ADV-001 | **DISMISS** | Git commands use hardcoded strings, not user input. execSync output is only used as path strings. No actual command injection vector exists. |
| H-ADV-002 | **CONFIRM** | Path traversal is a valid concern. copyDirRecursive blindly follows paths without checking for `..` sequences or verifying canonical paths stay within intended boundaries. |
| H-ADV-003 | **DISMISS** | JSON_EXTRACT paths are hardcoded strings like `'$.kind'`, `'$.repo'`. User data goes into bound parameters, not the JSON path. No injection vector. |
| H-ADV-004 | **MODIFY (LOW->INFO)** | validateSlug is correct - hyphens at start/end are valid slug characters. The regex `^[a-z0-9_-]+$` with alphanumeric requirement is adequate. |

### Judge for H-Bugs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-BUG-001 | **CONFIRM** | Valid bug. When activeOccurrences=0, `Math.min(0-1, 5) * 0.05 = -0.05`. Should guard against negative. |
| H-BUG-002 | **DISMISS** | When doc has fewer than 5 lines, `lines.length - windowSize` is negative, loop doesn't execute, returns null. This is correct behavior - can't match 2+ keywords in < 5 lines. |
| H-BUG-003 | **CONFIRM** | Performance issue confirmed. Raw SQL returns all fields, then findById re-queries. Wasteful database access pattern. |
| H-BUG-004 | **MODIFY (LOW->INFO)** | Date calculation uses UTC consistently via Date object. Unlikely to cause production issues but good practice to document timezone handling. |

### Judge for H-Decisions Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-DEC-001 | **CONFIRM** | Valid concern. These thresholds gate automated security principle promotion. Rationale should be documented for auditability. |
| H-DEC-002 | **CONFIRM** | 0.3 threshold directly affects whether findings become noncompliance vs patterns. Business-critical threshold needs documentation. |
| H-DEC-003 | **CONFIRM** | 90-day decay affects pattern confidence. Should document why 90 days vs 30 or 180. |
| H-DEC-004 | **MODIFY (LOW->INFO)** | Score thresholds are documented in comments somewhat - "Multiple vagueness signals", "Require at least 2". Could be clearer but not undocumented. |

### Judge for H-Docs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-DOC-001 | **CONFIRM** | Valid. update() options are complex and non-obvious. JSDoc should document each option parameter. |
| H-DOC-002 | **CONFIRM (Severity MEDIUM)** | Typo in function name is a code quality issue. `promoteToDerivdPrinciple` should be `promoteToDerivedPrinciple`. Elevate to MEDIUM as it affects code searchability. |
| H-DOC-003 | **DISMISS** | While function is long, it's well-structured with STEP comments (1-9). Business logic is clear from comments. |
| H-DOC-004 | **CONFIRM** | Internal marker needs documentation explaining its purpose and lifecycle. |

### Judge for H-Spec Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-SPC-001 | **CONFIRM** | Valid spec deviation. "Prioritized" implies weighted preference, not complete exclusion. Current implementation is overly restrictive. |
| H-SPC-002 | **DISMISS** | Reference to spec section is documentation - implementation should match spec. This is informational, not a violation. |
| H-SPC-003 | **CONFIRM** | Significant contradiction. Header claims append-only but update() mutates. Either docs or code need to change. |

### Judge for H-Tests Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| H-TST-001 | **CONFIRM** | Decision tree with 6+ outcomes needs test matrix. Complex branching logic is error-prone without coverage. |
| H-TST-002 | **CONFIRM** | Valid testability concern. Should extract pure functions for git validation, config generation, file operations. |
| H-TST-003 | **DISMISS** | Edge cases are handled: empty string -> empty keywords (returns false), short words filtered by length > 2. |

---

## Pipeline B Judges (Sonnet findings evaluated by Sonnet)

### Judge for S-Adversarial Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-ADV-001 | **DISMISS** | Git root path comes from git itself, not user. Path is used for legitimate file operations. No actual vulnerability. |
| S-ADV-002 | **CONFIRM** | Valid security concern. copyDirRecursive should use `fs.realpathSync` and verify dest stays within gitRoot. Symlink attacks are real threat in package installation. |
| S-ADV-003 | **MODIFY (MEDIUM->LOW)** | Column names are hardcoded, not user-controlled. Pattern is safe here but could be flagged by static analysis tools. |
| S-ADV-004 | **DISMISS** | yaml.stringify properly escapes special characters. Project name is validated for null bytes. No injection vector. |
| S-ADV-005 | **DISMISS** | Excerpt is from guidance documents, not secrets. 500-char truncation is reasonable for display. |

### Judge for S-Bugs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-BUG-001 | **CONFIRM** | Duplicate of H-BUG-001. Valid bug - negative boost when activeOccurrences=0. |
| S-BUG-002 | **CONFIRM** | Performance bug confirmed. Unnecessary duplicate query pattern. Should refactor to single fetch. |
| S-BUG-003 | **DISMISS** | Check order is correct. `sourceAgreesWithCarrier === false` explicitly checks for false (not null/undefined). Inner check is necessary, not redundant. |
| S-BUG-004 | **CONFIRM** | Valid edge case. Empty carrierLocation causes false positives for salience flag. Should check for empty string. |
| S-BUG-005 | **DISMISS** | Behavior is intentional - creating safe slug from any project name. Re-adding hyphens for non-alnum is correct. |

### Judge for S-Decisions Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-DEC-001 | **CONFIRM** | Duplicate of H-DEC-001 with better severity. Critical thresholds need ADR documentation. |
| S-DEC-002 | **CONFIRM** | Evidence quality weights are arbitrary-seeming. Should document calibration methodology. |
| S-DEC-003 | **CONFIRM** | Multiple magic numbers in single function. Should be named constants with rationale. |
| S-DEC-004 | **CONFIRM** | Recency tiers arbitrary. Why 7/30/90? Document business reasoning. |
| S-DEC-005 | **MODIFY (LOW->INFO)** | >= 2 threshold is documented as "Multiple vagueness signals". Comparison uses > intentionally (strict dominance). |

### Judge for S-Docs Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-DOC-001 | **CONFIRM** | Duplicate of H-DOC-002. Function name typo is significant code quality issue. |
| S-DOC-002 | **CONFIRM** | Duplicate of H-SPC-003. Design principle contradiction between docs and code. |
| S-DOC-003 | **CONFIRM** | Duplicate of H-DOC-004. Internal marker needs documentation. |
| S-DOC-004 | **DISMISS** | CORE file installation is explained in CLAUDE.md which serves as project documentation. |
| S-DOC-005 | **MODIFY (LOW->INFO)** | Scoring functions have inline comments explaining heuristics. Could be more detailed but adequate. |

### Judge for S-Spec Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-SPC-001 | **CONFIRM** | Duplicate of H-SPC-003 with stronger framing. Append-only principle violated by update(). |
| S-SPC-002 | **CONFIRM** | Duplicate of H-SPC-001. Over-restrictive implementation vs spec intent. |
| S-SPC-003 | **DISMISS** | Comment documents the decision. Schema changes are tracked separately. Not a spec violation. |
| S-SPC-004 | **DISMISS** | Spec reference is documentation best practice. Not a compliance issue. |

### Judge for S-Tests Findings

| Finding ID | Verdict | Reasoning |
|------------|---------|-----------|
| S-TST-001 | **CONFIRM** | Duplicate of H-TST-002. Monolithic handler is untestable. |
| S-TST-002 | **CONFIRM** | Duplicate of H-TST-001. Decision tree needs comprehensive test coverage. |
| S-TST-003 | **CONFIRM** | Valid. Boundary conditions at clamps (0.0, 1.0) and edge cases need explicit tests. |
| S-TST-004 | **CONFIRM** | Valid. Document edge cases need coverage - empty, single-line, short docs. |
| S-TST-005 | **MODIFY (LOW->INFO)** | Database queries are tested via integration tests typically. Mocking concern is valid but lower priority. |

---

## High Judge Final Verdict

### Consolidated Final Findings

#### Security Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-SEC-001 | Both | H-ADV-002, S-ADV-002 | **HIGH** | init.ts | 318-331 | Symlink/Path Traversal in copyDirRecursive | **CONFIRM** - Both pipelines identified. copyDirRecursive follows symlinks and doesn't validate paths. Real attack vector if CORE directory is compromised. |
| FINAL-SEC-002 | Sonnet | S-ADV-003 | **INFO** | pattern-occurrence.repo.ts | 243 | Dynamic SQL pattern | **CONFIRM (as INFO)** - Safe in context but static analyzers will flag. Worth noting as code smell. |

#### Bugs Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-BUG-001 | Both | H-BUG-001, S-BUG-001 | **MEDIUM** | confidence.ts | 95 | Negative occurrence boost when activeOccurrences=0 | **CONFIRM** - Valid bug found by both pipelines. `Math.min(-1, 5) * 0.05 = -0.05` violates confidence invariants. |
| FINAL-BUG-002 | Both | H-BUG-003, S-BUG-002 | **LOW** | promotion-checker.ts | 227-229 | Duplicate pattern fetching | **CONFIRM** - Performance issue, not correctness bug. Both pipelines found it. |
| FINAL-BUG-003 | Sonnet | S-BUG-004 | **LOW** | noncompliance-checker.ts | 216 | Empty carrierLocation causes false salience flags | **CONFIRM** - Valid edge case Haiku missed. Empty string `.includes()` always returns false. |

#### Undocumented Decisions Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-DEC-001 | Both | H-DEC-001, S-DEC-001 | **HIGH** | promotion-checker.ts | 36-52 | Critical thresholds without ADR | **CONFIRM** - Both pipelines flagged. Security-critical business logic thresholds need documented rationale. |
| FINAL-DEC-002 | Both | H-DEC-002, S-DEC-003 | **MEDIUM** | noncompliance-checker.ts | 111, 181-182 | Multiple magic numbers | **CONFIRM** - Consolidate related findings. Multiple undocumented thresholds in same file. |
| FINAL-DEC-003 | Both | H-DEC-003, S-DEC-004 | **LOW** | confidence.ts | 103, 183-187 | Time-based thresholds undocumented | **CONFIRM** - 90-day decay and 7/30/90 recency tiers need rationale. |
| FINAL-DEC-004 | Sonnet | S-DEC-002 | **MEDIUM** | confidence.ts | 81-91 | Evidence quality weights arbitrary | **CONFIRM** - Haiku missed this. 0.75/0.55/0.4 weights affect all confidence calculations. |

#### Documentation Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-DOC-001 | Both | H-DOC-002, S-DOC-001 | **MEDIUM** | promotion-checker.ts | 131 | Typo: promoteToDerivdPrinciple | **CONFIRM** - Both pipelines found. Function name typo breaks searchability and discoverability. |
| FINAL-DOC-002 | Haiku | H-DOC-001 | **LOW** | pattern-occurrence.repo.ts | 200-246 | update() missing param documentation | **CONFIRM** - Haiku-only finding that's valid. Complex options need JSDoc. |
| FINAL-DOC-003 | Both | H-DOC-004, S-DOC-003 | **LOW** | confidence.ts | 119-121 | _crossProjectPenalty undocumented | **CONFIRM** - Both pipelines found. Internal marker needs documentation. |

#### Spec Compliance Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-SPC-001 | Both | H-SPC-003, S-SPC-001, S-DOC-002 | **HIGH** | pattern-occurrence.repo.ts | 1-5, 200-246 | Append-only principle violated | **CONFIRM** - Multiple pipelines, multiple scouts flagged. Header claims append-only but update() mutates. Major spec deviation. |
| FINAL-SPC-002 | Both | H-SPC-001, S-SPC-002 | **MEDIUM** | promotion-checker.ts | 93-99 | Over-restrictive promotion (security-only) | **CONFIRM** - Spec says "prioritized", code completely blocks non-security. Deviation from spec intent. |

#### Test Coverage Domain

| Final ID | Source | Original ID(s) | Severity | File | Lines | Title | Verdict |
|----------|--------|----------------|----------|------|-------|-------|---------|
| FINAL-TST-001 | Both | H-TST-002, S-TST-001 | **MEDIUM** | init.ts | 66-294 | Monolithic untestable handler | **CONFIRM** - Both pipelines identified. 220+ line function is untestable. |
| FINAL-TST-002 | Both | H-TST-001, S-TST-002 | **MEDIUM** | failure-mode-resolver.ts | 44-158 | Decision tree needs test coverage | **CONFIRM** - Both pipelines identified. Complex branching needs comprehensive tests. |
| FINAL-TST-003 | Sonnet | S-TST-003 | **LOW** | confidence.ts | 74-114 | Boundary condition tests needed | **CONFIRM** - Haiku missed. Confidence clamping at 0/1 needs explicit tests. |
| FINAL-TST-004 | Sonnet | S-TST-004 | **LOW** | noncompliance-checker.ts | 171-199 | searchDocument edge cases | **CONFIRM** - Haiku missed. Empty/short doc handling needs coverage. |

### High Judge Reversals

| Original Finding | Judge Decision | High Judge Reversal | Reasoning |
|------------------|----------------|---------------------|-----------|
| H-ADV-001 | DISMISS | **UPHOLD DISMISS** | Correct dismissal - git commands are hardcoded |
| S-ADV-001 | DISMISS | **UPHOLD DISMISS** | Correct dismissal - git path is trusted source |
| H-BUG-002 | DISMISS | **REVERSE TO CONFIRM (INFO)** | Edge case worth documenting even if technically correct. Behavior when doc < 5 lines should be explicit. |
| S-BUG-003 | DISMISS | **UPHOLD DISMISS** | Correct analysis of boolean check semantics |

### Pipeline Comparison: What Did Haiku Miss vs Sonnet?

**Findings Sonnet Found That Haiku Missed:**

1. **S-ADV-004 (YAML injection)** - Sonnet explored deeper attack surface (dismissed but shows more thorough analysis)
2. **S-ADV-005 (Excerpt truncation)** - Sonnet considered data exposure angle (dismissed but creative)
3. **S-BUG-004 (Empty carrierLocation)** - **CONFIRMED** - Real edge case bug Haiku overlooked
4. **S-DEC-002 (Evidence quality weights)** - **CONFIRMED** - Critical undocumented decision Haiku missed
5. **S-TST-003 (Boundary conditions)** - **CONFIRMED** - Testing gap Haiku didn't identify
6. **S-TST-004 (searchDocument edge cases)** - **CONFIRMED** - Testing gap Haiku didn't identify

**Quality Assessment:**
- Haiku found 16 total findings across 6 scouts
- Sonnet found 24 total findings across 6 scouts
- Haiku confirmation rate: 11/16 = 68.75%
- Sonnet confirmation rate: 17/24 = 70.83%
- Sonnet found 4 unique confirmed issues Haiku missed
- Sonnet explored more attack surfaces (5 security findings vs Haiku's 4)

**Verdict:** Sonnet pipeline produced more comprehensive coverage, particularly in edge cases and boundary conditions. Haiku identified core issues but missed nuanced findings.

### Cross-Domain Patterns Identified

1. **Magic Number Proliferation**: Multiple files (promotion-checker.ts, confidence.ts, noncompliance-checker.ts) contain undocumented thresholds affecting business logic. This is a systemic issue requiring ADR documentation.

2. **Spec-Code Mismatch Pattern**: Both append-only violation and security-only promotion show pattern of code deviating from documented design principles without updating documentation.

3. **Testability Debt**: Two major files (init.ts, failure-mode-resolver.ts) have testability issues. Codebase needs refactoring toward pure functions and dependency injection.

4. **Input Validation Inconsistency**: init.ts validates some inputs (projectName) but copyDirRecursive lacks path validation. Inconsistent security posture.

### Final Quality Rating

| Aspect | Rating | Notes |
|--------|--------|-------|
| Security Posture | **6/10** | One HIGH issue (symlink attack) and multiple undocumented thresholds affecting security decisions |
| Code Quality | **7/10** | Function name typo, magic numbers, but generally well-structured |
| Spec Compliance | **5/10** | Two significant spec deviations (append-only, promotion criteria) |
| Testability | **5/10** | Two major files need refactoring for testability |
| Documentation | **6/10** | Missing ADRs for thresholds, JSDoc gaps |

**Overall Codebase Quality: 5.8/10**

---

## Summary Statistics

| Metric | Pipeline A (Haiku) | Pipeline B (Sonnet) | Combined |
|--------|-------------------|---------------------|----------|
| Scout Findings | 16 | 24 | 40 |
| Confirmed by Judges | 11 | 17 | 28 |
| Dismissed by Judges | 5 | 7 | 12 |
| Modified by Judges | 3 | 4 | 7 |
| Reversed by High Judge | 1 | 0 | 1 |
| **Final Unique Issues** | | | **16** |

### Final Issues by Severity

| Severity | Count | Issues |
|----------|-------|--------|
| HIGH | 3 | FINAL-SEC-001, FINAL-DEC-001, FINAL-SPC-001 |
| MEDIUM | 7 | FINAL-BUG-001, FINAL-DEC-002, FINAL-DEC-004, FINAL-DOC-001, FINAL-SPC-002, FINAL-TST-001, FINAL-TST-002 |
| LOW | 5 | FINAL-BUG-002, FINAL-BUG-003, FINAL-DEC-003, FINAL-DOC-002, FINAL-DOC-003, FINAL-TST-003, FINAL-TST-004 |
| INFO | 2 | FINAL-SEC-002, H-BUG-002 (reversed) |

### Final Issues by File

| File | Count | Severity Distribution |
|------|-------|----------------------|
| promotion-checker.ts | 4 | 1 HIGH, 2 MEDIUM, 1 LOW |
| confidence.ts | 4 | 2 MEDIUM, 2 LOW |
| init.ts | 2 | 1 HIGH, 1 MEDIUM |
| pattern-occurrence.repo.ts | 3 | 1 HIGH, 1 LOW, 1 INFO |
| noncompliance-checker.ts | 2 | 1 MEDIUM, 1 LOW |
| failure-mode-resolver.ts | 1 | 1 MEDIUM |
