# E1 Series Test Run 1: Opus 4.5 High Judge Full Pipeline Review

**Run ID:** E1-1
**Date:** 2026-01-21
**Model:** Claude Opus 4.5 (claude-opus-4-5-20251101)
**Role:** High Judge performing full Haiku Scout + Sonnet Scout + Sonnet Judge + Opus High Judge consolidation

## Files Reviewed

1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (330 lines)
3. `src/attribution/failure-mode-resolver.ts` (235 lines)
4. `src/attribution/noncompliance-checker.ts` (249 lines)
5. `src/cli/commands/init.ts` (333 lines)
6. `src/injection/confidence.ts` (198 lines)

---

## Phase 1: Haiku Scout Analysis

### Domain 1: Security

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-SEC-001 | init.ts | 296-301 | `execSync` for git commands without input sanitization; shell injection possible if git root path is attacker-controlled | HIGH |
| H-SEC-002 | init.ts | 318-331 | `copyDirRecursive` does not validate that destination paths don't escape intended directory (path traversal via symlinks) | HIGH |
| H-SEC-003 | init.ts | 167 | Workspace slug generated from project name using simple regex replace - could allow special characters to slip through | MEDIUM |
| H-SEC-004 | pattern-occurrence.repo.ts | 270-286 | JSON path extraction in SQL using `json_extract` - values come from fingerprints which are user-influenced data | MEDIUM |
| H-SEC-005 | noncompliance-checker.ts | 142-163 | Keyword extraction uses simple regex without XSS/injection protection; keywords injected into search | LOW |

### Domain 2: Logic Errors

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-LOG-001 | promotion-checker.ts | 131 | Function named `promoteToDerivdPrinciple` has typo (missing 'e' in 'Derived') | LOW |
| H-LOG-002 | confidence.ts | 101 | Decay penalty uses `daysSinceDate` which returns integer (Math.floor) but divides by 90 - loses precision for recent dates | LOW |
| H-LOG-003 | noncompliance-checker.ts | 183 | Sliding window stops at `lines.length - windowSize`, missing last 4 lines of document | MEDIUM |
| H-LOG-004 | failure-mode-resolver.ts | 89-96 | Empty `conflictSignals` array check uses `.length > 0` - correct but relies on array being initialized | LOW |
| H-LOG-005 | promotion-checker.ts | 227-228 | `findMatchingPatternsAcrossProjects` calls `findById` for each row, inefficient N+1 query pattern | MEDIUM |

### Domain 3: Undocumented Decisions

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-UND-001 | promotion-checker.ts | 36 | Magic number `MIN_PROJECTS_FOR_PROMOTION = 3` - why 3? No rationale documented | MEDIUM |
| H-UND-002 | promotion-checker.ts | 41 | `MIN_DERIVED_CONFIDENCE = 0.6` - threshold chosen without documented justification | MEDIUM |
| H-UND-003 | noncompliance-checker.ts | 112 | Relevance threshold `0.3` for noncompliance detection - arbitrary without explanation | MEDIUM |
| H-UND-004 | confidence.ts | 83-90 | Evidence quality base values (0.75, 0.55, 0.4) are magic numbers | MEDIUM |
| H-UND-005 | noncompliance-checker.ts | 182 | Window size of 5 lines - why 5? No documented rationale | LOW |
| H-UND-006 | confidence.ts | 183-186 | Recency weight thresholds (7, 30, 90 days) are magic numbers without explanation | LOW |

### Domain 4: Documentation

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-DOC-001 | pattern-occurrence.repo.ts | 200-246 | `update` method lacks JSDoc describing what fields can be updated and side effects | LOW |
| H-DOC-002 | init.ts | 318 | `copyDirRecursive` has no JSDoc explaining behavior with symlinks or error handling | LOW |
| H-DOC-003 | confidence.ts | 119-121 | `PatternWithCrossProjectMarker` type uses underscore-prefixed property without explaining convention | LOW |

### Domain 5: Spec Compliance

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-SPC-001 | pattern-occurrence.repo.ts | 200-246 | `update` method can mutate occurrence records, but CLAUDE.md states "Append-only history - Never mutate occurrence records" | HIGH |
| H-SPC-002 | promotion-checker.ts | 93-99 | Promotion limited to security category only, but CLAUDE.md mentions security "prioritized" not "exclusive" | MEDIUM |
| H-SPC-003 | confidence.ts | 1-6 | Comment says confidence values "NEVER stored" but no runtime enforcement of this constraint | LOW |

### Domain 6: Coverage Gaps

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| H-COV-001 | init.ts | 71-294 | No unit tests for `initCommand` action handler; complex state machine untested | HIGH |
| H-COV-002 | promotion-checker.ts | 57-126 | `checkForPromotion` has multiple branches but no test file found | MEDIUM |
| H-COV-003 | failure-mode-resolver.ts | 44-158 | `resolveFailureMode` decision tree has 8+ branches, should have comprehensive test coverage | MEDIUM |
| H-COV-004 | noncompliance-checker.ts | 84-134 | `checkForNoncompliance` critical path untested | MEDIUM |

---

## Phase 2: Sonnet Scout Analysis

### Domain 1: Security

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-SEC-001 | init.ts | 296-310 | Shell command injection in `findGitRoot`, `getGitRemoteOrigin`, `getRepoSubdir` - all use `execSync` without sanitization | HIGH |
| S-SEC-002 | init.ts | 318-331 | Path traversal in `copyDirRecursive` - `entry.name` could contain `..` or be a symlink pointing outside | HIGH |
| S-SEC-003 | init.ts | 122-132 | SQL query construction is safe (parameterized) but error message could leak workspace info | LOW |
| S-SEC-004 | pattern-occurrence.repo.ts | 243 | Dynamic SQL construction in `update` method using string interpolation for column names | MEDIUM |
| S-SEC-005 | noncompliance-checker.ts | 171-200 | `searchDocument` returns excerpt that could contain sensitive data without sanitization | LOW |

### Domain 2: Logic Errors

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-LOG-001 | promotion-checker.ts | 131 | Typo in function name: `promoteToDerivdPrinciple` should be `promoteToDerivedPrinciple` | LOW |
| S-LOG-002 | confidence.ts | 95-96 | Occurrence boost calculation uses `stats.activeOccurrences - 1` which could be negative if activeOccurrences is 0 | MEDIUM |
| S-LOG-003 | noncompliance-checker.ts | 216 | `analyzePossibleCauses` compares location strings with `.includes()` - fragile string matching | MEDIUM |
| S-LOG-004 | promotion-checker.ts | 235-269 | `computeDerivedConfidence` creates new repository instances inside loop - inefficient | LOW |
| S-LOG-005 | confidence.ts | 192-196 | `daysSinceDate` doesn't handle invalid date strings - will return NaN | MEDIUM |
| S-LOG-006 | pattern-occurrence.repo.ts | 414 | `nullableIntToBool` called but method definition not visible in file - potential undefined method | LOW |

### Domain 3: Undocumented Decisions

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-UND-001 | confidence.ts | 103 | Decay half-life of 90 days and max penalty of 0.15 - no documented rationale | MEDIUM |
| S-UND-002 | confidence.ts | 157 | Relevance weight formula `1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps` - coefficients unexplained | MEDIUM |
| S-UND-003 | promotion-checker.ts | 47-52 | Project count boost factor (0.05) and max boost (0.15) - arbitrary without rationale | MEDIUM |
| S-UND-004 | noncompliance-checker.ts | 188-189 | Requires "at least 2 keyword matches" - threshold undocumented | LOW |

### Domain 4: Documentation

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-DOC-001 | failure-mode-resolver.ts | 167-185 | `calculateAmbiguityScore` internal algorithm not documented in JSDoc | LOW |
| S-DOC-002 | init.ts | 66-294 | Main action handler is 228 lines with minimal inline comments explaining flow | MEDIUM |
| S-DOC-003 | promotion-checker.ts | 235-269 | `computeDerivedConfidence` exported but lacks complete JSDoc | LOW |

### Domain 5: Spec Compliance

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-SPC-001 | pattern-occurrence.repo.ts | 200-246 | `update` allows mutating `status`, `wasInjected`, `wasAdheredTo` - violates "append-only" principle from CLAUDE.md | HIGH |
| S-SPC-002 | failure-mode-resolver.ts | 44-158 | Resolver implements decision tree but doesn't reference CLAUDE.md's "Deterministic over LLM judgment" principle in code | LOW |
| S-SPC-003 | promotion-checker.ts | 93-99 | Security-only promotion conflicts with CLAUDE.md's "Security patterns get priority" (priority != exclusivity) | MEDIUM |

### Domain 6: Coverage Gaps

| ID | File | Line | Issue | Severity |
|----|------|------|-------|----------|
| S-COV-001 | init.ts | 40-64 | `validateInput` and `validateSlug` validation functions need unit tests | MEDIUM |
| S-COV-002 | confidence.ts | 133-176 | `computeInjectionPriority` complex formula should have property-based tests | MEDIUM |
| S-COV-003 | failure-mode-resolver.ts | 195-218 | `calculateIncompletenessScore` internal function lacks direct test coverage | LOW |

---

## Phase 3: Sonnet Judge Verdicts

### Security Findings

| Scout ID | Finding | Judge Verdict | Rationale |
|----------|---------|---------------|-----------|
| H-SEC-001 | Shell injection in execSync | **CONFIRM** | `execSync` with `git rev-parse` is standard practice but path returned is used in subsequent file operations - if attacker controls working directory, could be exploited |
| H-SEC-002 | Path traversal in copyDirRecursive | **CONFIRM** | Symlink following could allow writing outside intended directory. Real vulnerability. |
| S-SEC-001 | Shell injection in git commands | **MODIFY** to MEDIUM | The git commands don't take user input directly; they operate on CWD which is harder to exploit. Combine with H-SEC-001. |
| S-SEC-002 | Path traversal via entry.name | **CONFIRM** | `entry.name` from `readdirSync` is filesystem-controlled but symlinks are real risk |
| H-SEC-003 | Workspace slug special chars | **DISMISS** | validateSlug function at line 57-64 validates the slug format strictly |
| S-SEC-004 | Dynamic SQL in update | **MODIFY** to LOW | Column names are hardcoded strings, not from user input |
| H-SEC-004 | JSON path extraction | **DISMISS** | Values are from stored data, parameterized query is safe |

### Logic Findings

| Scout ID | Finding | Judge Verdict | Rationale |
|----------|---------|---------------|-----------|
| H-LOG-001 | Typo in function name | **CONFIRM** | Real typo, should fix for code quality |
| S-LOG-001 | Same typo | **CONFIRM** | Duplicate of H-LOG-001 |
| S-LOG-002 | Negative occurrence boost | **CONFIRM** | `Math.min(-1, 5) * 0.05 = -0.05` - could reduce confidence incorrectly |
| H-LOG-003 | Missing last lines in window | **CONFIRM** | Sliding window logic misses trailing lines |
| S-LOG-005 | NaN from invalid dates | **CONFIRM** | `daysSinceDate('invalid')` returns NaN which propagates |
| H-LOG-005 | N+1 query pattern | **CONFIRM** | Performance issue but not a bug |
| S-LOG-003 | Fragile string matching | **CONFIRM** | Location format "Lines 45-50" compared with includes() is fragile |

### Undocumented Decisions

| Scout ID | Finding | Judge Verdict | Rationale |
|----------|---------|---------------|-----------|
| H-UND-001 | MIN_PROJECTS_FOR_PROMOTION | **CONFIRM** | Magic number needs rationale |
| H-UND-002 | MIN_DERIVED_CONFIDENCE | **CONFIRM** | Same issue |
| H-UND-003 | Relevance threshold 0.3 | **CONFIRM** | Arbitrary threshold |
| H-UND-004 | Evidence quality bases | **CONFIRM** | Core algorithm magic numbers |
| S-UND-001 | Decay parameters | **CONFIRM** | Algorithm parameters need documentation |
| S-UND-002 | Relevance weight formula | **CONFIRM** | Formula coefficients unexplained |

### Spec Compliance

| Scout ID | Finding | Judge Verdict | Rationale |
|----------|---------|---------------|-----------|
| H-SPC-001 | update() violates append-only | **CONFIRM** | CRITICAL - Direct violation of stated design principle |
| S-SPC-001 | Same issue | **CONFIRM** | Duplicate - merge with H-SPC-001 |
| H-SPC-002 | Security-only promotion | **MODIFY** to HIGH | Spec says "prioritized" but code makes it exclusive - significant deviation |
| S-SPC-003 | Same issue | **CONFIRM** | Duplicate - merge with H-SPC-002 |

---

## Phase 4: Opus High Judge Consolidation

### Deduplication

| Merged ID | Original IDs | Consolidated Finding |
|-----------|--------------|---------------------|
| FINAL-001 | H-SEC-001, S-SEC-001 | Shell injection risk in git command execution |
| FINAL-002 | H-SEC-002, S-SEC-002 | Path traversal in copyDirRecursive via symlinks |
| FINAL-003 | H-LOG-001, S-LOG-001 | Function name typo: promoteToDerivdPrinciple |
| FINAL-004 | H-SPC-001, S-SPC-001 | update() method violates append-only principle |
| FINAL-005 | H-SPC-002, S-SPC-003 | Security-only promotion vs spec's "prioritized" |

### Final Consolidated Findings

| ID | Severity | Category | File | Line | Description | Recommendation |
|----|----------|----------|------|------|-------------|----------------|
| **FINAL-001** | HIGH | Security | init.ts | 296-310 | Shell command execution in `findGitRoot()`, `getGitRemoteOrigin()` using `execSync()`. While these don't directly accept user input, the working directory context could be manipulated in certain attack scenarios. | Consider using `git` library instead of shell commands, or validate output strictly |
| **FINAL-002** | **CRITICAL** | Security | init.ts | 318-331 | `copyDirRecursive()` follows symlinks and doesn't validate destination paths. An attacker could create a symlink in the CORE source pointing to `../../etc/passwd` or similar, causing arbitrary file writes. | Add `fs.lstatSync` check to reject symlinks, or use `fs.cpSync` with appropriate options |
| **FINAL-003** | LOW | Logic | promotion-checker.ts | 131 | Typo in exported function name `promoteToDerivdPrinciple` - missing 'e'. Will require API change to fix. | Rename to `promoteToDerivedPrinciple` and add deprecation alias |
| **FINAL-004** | **CRITICAL** | Spec Compliance | pattern-occurrence.repo.ts | 200-246 | The `update()` method allows mutating existing occurrence records (status, wasInjected, wasAdheredTo). This directly violates CLAUDE.md's "Append-only history - Never mutate occurrence records; mark inactive instead". The current implementation allows in-place updates rather than creating new records. | Remove mutation capability; implement append-only pattern with separate tracking table for status changes |
| **FINAL-005** | HIGH | Spec Compliance | promotion-checker.ts | 93-99 | Code rejects all non-security patterns for promotion with "Non-security patterns not eligible". However, CLAUDE.md states "Security patterns get priority in injection" - priority implies other categories should still be eligible, just ranked lower. | Change from hard rejection to priority scoring; allow non-security patterns with lower priority |
| **FINAL-006** | MEDIUM | Logic | confidence.ts | 95-96 | Occurrence boost calculation `Math.min(stats.activeOccurrences - 1, 5) * 0.05` can produce negative values when `activeOccurrences = 0`, resulting in `-0.05` confidence reduction. | Add `Math.max(0, ...)` wrapper: `Math.max(0, Math.min(stats.activeOccurrences - 1, 5)) * 0.05` |
| **FINAL-007** | MEDIUM | Logic | noncompliance-checker.ts | 183 | Sliding window loop `for (let i = 0; i <= lines.length - windowSize; i++)` misses the last 4 lines of any document. A document with 10 lines only searches lines 1-6. | Change loop condition to `i <= lines.length - 1` and adjust window slice to handle edge |
| **FINAL-008** | MEDIUM | Logic | confidence.ts | 192-196 | `daysSinceDate()` doesn't validate input and returns NaN for invalid dates, which propagates through confidence calculations. | Add validation: `if (isNaN(then.getTime())) return 0;` |
| **FINAL-009** | MEDIUM | Documentation | Multiple | - | Multiple magic numbers without documented rationale: MIN_PROJECTS_FOR_PROMOTION (3), MIN_DERIVED_CONFIDENCE (0.6), relevance threshold (0.3), evidence quality bases (0.75, 0.55, 0.4), decay half-life (90 days). | Add JSDoc comments explaining the rationale for each threshold, ideally with references to research or empirical testing |
| **FINAL-010** | MEDIUM | Coverage | init.ts | 71-294 | `initCommand` action handler has ~224 lines with complex branching (workspace creation, project creation, file copying) but no dedicated test file exists. Critical user-facing functionality. | Create `init.test.ts` with mock filesystem and database |

### Identified Patterns

1. **Magic Number Anti-Pattern**: Multiple files use hardcoded thresholds (confidence values, window sizes, promotion criteria) without documented rationale. This makes the system difficult to tune and maintain.

2. **Spec-Code Drift**: Two significant cases where implementation diverges from stated design principles (append-only violation, security-exclusive vs security-priority).

3. **Shell Command Risk**: The CLI relies heavily on `execSync` for git operations, creating a potential attack surface.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Haiku Findings | 23 |
| Total Sonnet Findings | 20 |
| Deduplicated after Judge | 5 |
| Final Consolidated Findings | 10 |
| CRITICAL Severity | 2 |
| HIGH Severity | 2 |
| MEDIUM Severity | 4 |
| LOW Severity | 2 |

### Severity Distribution

- **CRITICAL (2)**: FINAL-002 (path traversal), FINAL-004 (append-only violation)
- **HIGH (2)**: FINAL-001 (shell injection), FINAL-005 (spec non-compliance on security-only)
- **MEDIUM (4)**: FINAL-006 through FINAL-010
- **LOW (2)**: FINAL-003 (typo)

### Category Distribution

- Security: 2
- Spec Compliance: 2
- Logic: 3
- Documentation: 1
- Coverage: 1
- Other: 1

---

## Quality Rating

**Overall Code Quality: 6.5/10**

### Strengths
- Well-structured TypeScript with good type definitions
- Comprehensive file-level JSDoc documentation
- Proper use of parameterized SQL queries (no SQL injection)
- Clear separation of concerns between modules
- Good error handling patterns in most areas

### Areas for Improvement
- CRITICAL: Two serious issues need immediate attention (path traversal, append-only violation)
- Magic numbers throughout confidence/priority calculations need documentation
- Spec compliance issues indicate drift between design and implementation
- Test coverage for critical paths is lacking
- Shell command usage creates unnecessary attack surface

### Recommended Priority

1. **Immediate**: Fix FINAL-002 (path traversal) - security vulnerability
2. **Immediate**: Address FINAL-004 (append-only violation) - architectural issue
3. **High**: Resolve FINAL-005 (security-only vs priority) - spec compliance
4. **Medium**: Add input validation for dates (FINAL-008)
5. **Medium**: Fix occurrence boost negative value (FINAL-006)
6. **Low**: Document magic numbers (FINAL-009)
7. **Low**: Fix typo (FINAL-003)

---

## Scout Findings JSON (for subsequent reviewers)

```json
{
  "run": "E1-1",
  "timestamp": "2026-01-21T08:30:00.000Z",
  "model": "claude-opus-4-5-20251101",
  "files_reviewed": [
    "src/storage/repositories/pattern-occurrence.repo.ts",
    "src/evolution/promotion-checker.ts",
    "src/attribution/failure-mode-resolver.ts",
    "src/attribution/noncompliance-checker.ts",
    "src/cli/commands/init.ts",
    "src/injection/confidence.ts"
  ],
  "haiku_findings": [
    {"id": "H-SEC-001", "category": "security", "severity": "HIGH", "file": "init.ts", "line": "296-301", "summary": "execSync shell injection risk in git commands"},
    {"id": "H-SEC-002", "category": "security", "severity": "HIGH", "file": "init.ts", "line": "318-331", "summary": "Path traversal in copyDirRecursive via symlinks"},
    {"id": "H-SEC-003", "category": "security", "severity": "MEDIUM", "file": "init.ts", "line": "167", "summary": "Workspace slug generation may allow special chars"},
    {"id": "H-SEC-004", "category": "security", "severity": "MEDIUM", "file": "pattern-occurrence.repo.ts", "line": "270-286", "summary": "JSON path extraction with user-influenced data"},
    {"id": "H-SEC-005", "category": "security", "severity": "LOW", "file": "noncompliance-checker.ts", "line": "142-163", "summary": "Keyword extraction lacks sanitization"},
    {"id": "H-LOG-001", "category": "logic", "severity": "LOW", "file": "promotion-checker.ts", "line": "131", "summary": "Function name typo: promoteToDerivdPrinciple"},
    {"id": "H-LOG-002", "category": "logic", "severity": "LOW", "file": "confidence.ts", "line": "101", "summary": "Decay penalty loses precision due to Math.floor"},
    {"id": "H-LOG-003", "category": "logic", "severity": "MEDIUM", "file": "noncompliance-checker.ts", "line": "183", "summary": "Sliding window misses last 4 lines"},
    {"id": "H-LOG-004", "category": "logic", "severity": "LOW", "file": "failure-mode-resolver.ts", "line": "89-96", "summary": "conflictSignals relies on array initialization"},
    {"id": "H-LOG-005", "category": "logic", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "227-228", "summary": "N+1 query pattern in findMatchingPatternsAcrossProjects"},
    {"id": "H-UND-001", "category": "undocumented", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "36", "summary": "Magic number MIN_PROJECTS_FOR_PROMOTION = 3"},
    {"id": "H-UND-002", "category": "undocumented", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "41", "summary": "Magic number MIN_DERIVED_CONFIDENCE = 0.6"},
    {"id": "H-UND-003", "category": "undocumented", "severity": "MEDIUM", "file": "noncompliance-checker.ts", "line": "112", "summary": "Magic number relevance threshold 0.3"},
    {"id": "H-UND-004", "category": "undocumented", "severity": "MEDIUM", "file": "confidence.ts", "line": "83-90", "summary": "Magic numbers for evidence quality bases"},
    {"id": "H-UND-005", "category": "undocumented", "severity": "LOW", "file": "noncompliance-checker.ts", "line": "182", "summary": "Magic number window size 5"},
    {"id": "H-UND-006", "category": "undocumented", "severity": "LOW", "file": "confidence.ts", "line": "183-186", "summary": "Magic numbers for recency weight thresholds"},
    {"id": "H-DOC-001", "category": "documentation", "severity": "LOW", "file": "pattern-occurrence.repo.ts", "line": "200-246", "summary": "update method lacks JSDoc"},
    {"id": "H-DOC-002", "category": "documentation", "severity": "LOW", "file": "init.ts", "line": "318", "summary": "copyDirRecursive lacks JSDoc"},
    {"id": "H-DOC-003", "category": "documentation", "severity": "LOW", "file": "confidence.ts", "line": "119-121", "summary": "Underscore-prefixed property unexplained"},
    {"id": "H-SPC-001", "category": "spec-compliance", "severity": "HIGH", "file": "pattern-occurrence.repo.ts", "line": "200-246", "summary": "update() violates append-only principle"},
    {"id": "H-SPC-002", "category": "spec-compliance", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "93-99", "summary": "Security-only promotion vs spec priority"},
    {"id": "H-SPC-003", "category": "spec-compliance", "severity": "LOW", "file": "confidence.ts", "line": "1-6", "summary": "No runtime enforcement of never-stored constraint"},
    {"id": "H-COV-001", "category": "coverage", "severity": "HIGH", "file": "init.ts", "line": "71-294", "summary": "initCommand action handler untested"},
    {"id": "H-COV-002", "category": "coverage", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "57-126", "summary": "checkForPromotion lacks tests"},
    {"id": "H-COV-003", "category": "coverage", "severity": "MEDIUM", "file": "failure-mode-resolver.ts", "line": "44-158", "summary": "resolveFailureMode decision tree needs coverage"},
    {"id": "H-COV-004", "category": "coverage", "severity": "MEDIUM", "file": "noncompliance-checker.ts", "line": "84-134", "summary": "checkForNoncompliance critical path untested"}
  ],
  "sonnet_findings": [
    {"id": "S-SEC-001", "category": "security", "severity": "HIGH", "file": "init.ts", "line": "296-310", "summary": "Shell injection in findGitRoot, getGitRemoteOrigin"},
    {"id": "S-SEC-002", "category": "security", "severity": "HIGH", "file": "init.ts", "line": "318-331", "summary": "Path traversal via entry.name or symlinks"},
    {"id": "S-SEC-003", "category": "security", "severity": "LOW", "file": "init.ts", "line": "122-132", "summary": "Error message could leak workspace info"},
    {"id": "S-SEC-004", "category": "security", "severity": "MEDIUM", "file": "pattern-occurrence.repo.ts", "line": "243", "summary": "Dynamic SQL for column names"},
    {"id": "S-SEC-005", "category": "security", "severity": "LOW", "file": "noncompliance-checker.ts", "line": "171-200", "summary": "searchDocument returns unsanitized excerpts"},
    {"id": "S-LOG-001", "category": "logic", "severity": "LOW", "file": "promotion-checker.ts", "line": "131", "summary": "Typo: promoteToDerivdPrinciple"},
    {"id": "S-LOG-002", "category": "logic", "severity": "MEDIUM", "file": "confidence.ts", "line": "95-96", "summary": "Negative occurrence boost when activeOccurrences=0"},
    {"id": "S-LOG-003", "category": "logic", "severity": "MEDIUM", "file": "noncompliance-checker.ts", "line": "216", "summary": "Fragile string matching for locations"},
    {"id": "S-LOG-004", "category": "logic", "severity": "LOW", "file": "promotion-checker.ts", "line": "235-269", "summary": "Repository instances created in loop"},
    {"id": "S-LOG-005", "category": "logic", "severity": "MEDIUM", "file": "confidence.ts", "line": "192-196", "summary": "daysSinceDate returns NaN for invalid dates"},
    {"id": "S-LOG-006", "category": "logic", "severity": "LOW", "file": "pattern-occurrence.repo.ts", "line": "414", "summary": "nullableIntToBool method not visible"},
    {"id": "S-UND-001", "category": "undocumented", "severity": "MEDIUM", "file": "confidence.ts", "line": "103", "summary": "Decay half-life and max penalty undocumented"},
    {"id": "S-UND-002", "category": "undocumented", "severity": "MEDIUM", "file": "confidence.ts", "line": "157", "summary": "Relevance weight coefficients unexplained"},
    {"id": "S-UND-003", "category": "undocumented", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "47-52", "summary": "Project count boost factors arbitrary"},
    {"id": "S-UND-004", "category": "undocumented", "severity": "LOW", "file": "noncompliance-checker.ts", "line": "188-189", "summary": "2 keyword match threshold undocumented"},
    {"id": "S-DOC-001", "category": "documentation", "severity": "LOW", "file": "failure-mode-resolver.ts", "line": "167-185", "summary": "calculateAmbiguityScore algorithm not documented"},
    {"id": "S-DOC-002", "category": "documentation", "severity": "MEDIUM", "file": "init.ts", "line": "66-294", "summary": "Main action handler lacks inline comments"},
    {"id": "S-DOC-003", "category": "documentation", "severity": "LOW", "file": "promotion-checker.ts", "line": "235-269", "summary": "computeDerivedConfidence lacks complete JSDoc"},
    {"id": "S-SPC-001", "category": "spec-compliance", "severity": "HIGH", "file": "pattern-occurrence.repo.ts", "line": "200-246", "summary": "update() violates append-only principle"},
    {"id": "S-SPC-002", "category": "spec-compliance", "severity": "LOW", "file": "failure-mode-resolver.ts", "line": "44-158", "summary": "Doesn't reference deterministic principle in code"},
    {"id": "S-SPC-003", "category": "spec-compliance", "severity": "MEDIUM", "file": "promotion-checker.ts", "line": "93-99", "summary": "Security-only vs security-priority discrepancy"},
    {"id": "S-COV-001", "category": "coverage", "severity": "MEDIUM", "file": "init.ts", "line": "40-64", "summary": "validateInput and validateSlug need tests"},
    {"id": "S-COV-002", "category": "coverage", "severity": "MEDIUM", "file": "confidence.ts", "line": "133-176", "summary": "computeInjectionPriority needs property tests"},
    {"id": "S-COV-003", "category": "coverage", "severity": "LOW", "file": "failure-mode-resolver.ts", "line": "195-218", "summary": "calculateIncompletenessScore lacks direct tests"}
  ],
  "final_findings": [
    {"id": "FINAL-001", "severity": "HIGH", "category": "security", "summary": "Shell injection risk in git command execution"},
    {"id": "FINAL-002", "severity": "CRITICAL", "category": "security", "summary": "Path traversal in copyDirRecursive via symlinks"},
    {"id": "FINAL-003", "severity": "LOW", "category": "logic", "summary": "Function name typo: promoteToDerivdPrinciple"},
    {"id": "FINAL-004", "severity": "CRITICAL", "category": "spec-compliance", "summary": "update() method violates append-only principle"},
    {"id": "FINAL-005", "severity": "HIGH", "category": "spec-compliance", "summary": "Security-only promotion vs spec priority"},
    {"id": "FINAL-006", "severity": "MEDIUM", "category": "logic", "summary": "Negative occurrence boost when activeOccurrences=0"},
    {"id": "FINAL-007", "severity": "MEDIUM", "category": "logic", "summary": "Sliding window misses last 4 lines"},
    {"id": "FINAL-008", "severity": "MEDIUM", "category": "logic", "summary": "daysSinceDate returns NaN for invalid dates"},
    {"id": "FINAL-009", "severity": "MEDIUM", "category": "documentation", "summary": "Multiple magic numbers without rationale"},
    {"id": "FINAL-010", "severity": "MEDIUM", "category": "coverage", "summary": "initCommand action handler lacks tests"}
  ],
  "quality_rating": 6.5,
  "critical_count": 2,
  "high_count": 2,
  "medium_count": 4,
  "low_count": 2
}
```

---

*End of E1-1 Review Report*
