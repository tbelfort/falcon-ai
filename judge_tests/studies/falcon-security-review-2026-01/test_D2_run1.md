# Multi-Scout Code Review Report: Test D2 Run 1

**Date:** 2026-01-21
**Reviewer Configuration:** 10 Haiku Scouts + 1 Sonnet Scout + 11 Sonnet Judges + 1 Opus High Judge
**Files Reviewed:**
1. `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
2. `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
3. `/Users/tbelfort/Projects/falcon-ai/src/attribution/failure-mode-resolver.ts`
4. `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts`
5. `/Users/tbelfort/Projects/falcon-ai/src/cli/commands/init.ts`
6. `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`

---

## Phase 1: Haiku Scout Analysis (10 Scouts)

### Scout 1: Security-General (Injection, Auth Bypass)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H1-1 | init.ts | 298 | `execSync` used for git commands without proper shell escaping; could be vulnerable if git root path contains shell metacharacters | MEDIUM |
| H1-2 | pattern-occurrence.repo.ts | 243 | Dynamic SQL construction via string interpolation in `update()` method; while parameterized, the column names are constructed dynamically from user input keys | LOW |
| H1-3 | init.ts | 209-227 | Database insertion uses direct values; ensure all inputs are properly sanitized upstream | LOW |

### Scout 2: Security-Path (Traversal, Symlinks)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H2-1 | init.ts | 318-331 | `copyDirRecursive` function does not validate that source paths don't escape intended directories; symlinks could cause path traversal | HIGH |
| H2-2 | init.ts | 254-255 | `import.meta.dirname` used to resolve package root, then joins with user-influenced paths; no validation that final path is within expected boundaries | MEDIUM |
| H2-3 | init.ts | 312-316 | `getRepoSubdir` uses `path.relative` which could produce `..` sequences if cwd is outside gitRoot | LOW |

### Scout 3: Logic-Core (Main Function Bugs)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H3-1 | promotion-checker.ts | 131 | Function name typo: `promoteToDerivdPrinciple` - missing 'e' in 'Derived' | LOW |
| H3-2 | noncompliance-checker.ts | 183-197 | `searchDocument` sliding window loop condition `i <= lines.length - windowSize` will miss documents shorter than 5 lines entirely | MEDIUM |
| H3-3 | failure-mode-resolver.ts | 56-62 | Logic check for `evidence.hasCitation && evidence.sourceRetrievable` before checking `sourceAgreesWithCarrier` but doesn't handle case where `sourceAgreesWithCarrier` is undefined | LOW |

### Scout 4: Logic-Edge (Boundary Conditions)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H4-1 | noncompliance-checker.ts | 183 | When `lines.length < windowSize` (5), the loop never executes, returning `null` even if keywords exist in the document | MEDIUM |
| H4-2 | confidence.ts | 95 | `Math.min(stats.activeOccurrences - 1, 5) * 0.05` can produce negative boost when `activeOccurrences` is 0, though clamped later | LOW |
| H4-3 | pattern-occurrence.repo.ts | 262 | Default status filter is hardcoded to 'active' when `options.status` is undefined/falsy; explicit `undefined` vs missing behaves same | LOW |
| H4-4 | confidence.ts | 192-196 | `daysSinceDate` can return negative values if `isoDate` is in the future; only guarded in one call site (line 101) | MEDIUM |

### Scout 5: Decisions-Thresholds (Magic Numbers)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H5-1 | promotion-checker.ts | 36-52 | Multiple magic numbers for promotion thresholds (3, 0.6, 0.05, 0.15) defined as constants but rationale undocumented | LOW |
| H5-2 | noncompliance-checker.ts | 112 | Magic threshold `0.3` for relevance score with only inline comment; should be a named constant | LOW |
| H5-3 | noncompliance-checker.ts | 182 | Magic number `5` for sliding window size; no constant definition | LOW |
| H5-4 | confidence.ts | 82-90 | Evidence quality base values (0.75, 0.55, 0.4) are undocumented magic numbers | LOW |
| H5-5 | confidence.ts | 103 | Magic number `90` (days) and `0.15` (penalty) for decay calculation | LOW |

### Scout 6: Decisions-Architecture (Design Choices)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H6-1 | promotion-checker.ts | 217-229 | `findMatchingPatternsAcrossProjects` performs N+1 queries: one query to get IDs, then N `findById` calls | MEDIUM |
| H6-2 | pattern-occurrence.repo.ts | 200-246 | `update` method doesn't handle `provisionalAlertId` despite being documented in options interface | MEDIUM |
| H6-3 | confidence.ts | 21-30 | `OccurrenceRepoLike` interface has different signature than actual repo's `findByPatternId` (missing options object) | MEDIUM |

### Scout 7: Documentation-API (Public Interface Docs)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H7-1 | init.ts | 66 | `initCommand` export lacks JSDoc describing expected behavior and side effects | LOW |
| H7-2 | confidence.ts | 119-121 | `PatternWithCrossProjectMarker` type is undocumented; `_crossProjectPenalty` underscore prefix suggests internal but is exported | LOW |
| H7-3 | noncompliance-checker.ts | 84 | `checkForNoncompliance` documents return type but not possible exceptions | LOW |

### Scout 8: Documentation-Internal (Implementation Comments)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H8-1 | promotion-checker.ts | 227-228 | Comment explains rows conversion but doesn't explain why `findById` is used instead of direct row mapping | LOW |
| H8-2 | failure-mode-resolver.ts | 102-117 | Ambiguity vs incompleteness decision lacks inline explanation of why `>= 2` threshold is used | LOW |
| H8-3 | confidence.ts | 93-95 | Occurrence boost formula comment says "First occurrence = no boost" but code uses `activeOccurrences - 1` which could be negative | LOW |

### Scout 9: Spec-Compliance (CLAUDE.md Adherence)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H9-1 | pattern-occurrence.repo.ts | 200-246 | Spec states "append-only history - Never mutate occurrence records" but `update` method modifies existing records | HIGH |
| H9-2 | promotion-checker.ts | 93-100 | Restricts promotion to security patterns only, but spec mentions "security patterns get priority" not "security only" | MEDIUM |
| H9-3 | confidence.ts | 5-6 | Comment states values are "NEVER stored" but no runtime enforcement prevents storage | LOW |

### Scout 10: Coverage-Critical (Untested Paths)

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| H10-1 | init.ts | 296-301 | `findGitRoot` swallows all errors from `execSync`; different error types (permission denied vs not a repo) treated same | LOW |
| H10-2 | noncompliance-checker.ts | 209-228 | `analyzePossibleCauses` only returns 'salience' or 'formatting'; other cause types from schema may be valid but unreachable | MEDIUM |
| H10-3 | pattern-occurrence.repo.ts | 403 | `parseJsonField` errors not explicitly handled; malformed JSON would throw uncaught exception | MEDIUM |

---

## Phase 2: Sonnet Scout Analysis (Deep Analysis)

### Scout S1: Comprehensive Deep Analysis

| ID | File | Line | Finding | Severity |
|----|------|------|---------|----------|
| S1-1 | init.ts | 318-331 | **Path Traversal via Symlinks**: `copyDirRecursive` follows symlinks without restriction. An attacker who controls the CORE directory (or can place symlinks there) could cause arbitrary file reads during init. The function should use `lstat` to check for symlinks and either skip or resolve them within bounds. | HIGH |
| S1-2 | pattern-occurrence.repo.ts | 200-246 | **Append-Only Violation**: The `update` method directly modifies `status`, `wasAdheredTo`, `wasInjected` on existing occurrence records. This violates the spec's "append-only history" requirement. Should create new records or use a separate audit trail table. | HIGH |
| S1-3 | noncompliance-checker.ts | 182-197 | **Small Document Edge Case**: Documents with fewer than 5 lines are never searched because the loop condition `i <= lines.length - windowSize` evaluates to `i <= negative` when `lines.length < 5`. This silently returns null, missing potential matches. | MEDIUM |
| S1-4 | promotion-checker.ts | 217-228 | **N+1 Query Pattern**: `findMatchingPatternsAcrossProjects` executes a SELECT for all IDs, then calls `findById` for each result. For patterns appearing in many projects, this creates performance degradation. Should use single query with proper row-to-entity mapping. | MEDIUM |
| S1-5 | confidence.ts | 192-196 | **Future Date Vulnerability**: `daysSinceDate` returns negative values for future dates. While line 101 guards against this with `Math.max(0, ...)`, the function is also called at line 182 in `computeRecencyWeight` without protection, potentially producing incorrect weights. | MEDIUM |
| S1-6 | confidence.ts | 21-30 | **Interface Mismatch**: `OccurrenceRepoLike.findByPatternId` takes a single string argument, but the actual `PatternOccurrenceRepository.findByPatternId` takes an options object `{ workspaceId, patternId }`. This interface doesn't match the real implementation. | MEDIUM |
| S1-7 | promotion-checker.ts | 256-260 | **Incorrect Interface Usage**: The code passes a mock object `{ findByPatternId: () => occurrences }` that returns occurrences directly, but this doesn't match how the real repository is called, creating a hidden contract violation. | MEDIUM |
| S1-8 | init.ts | 167-189 | **Slug Collision Weakness**: When workspace slug collides, only 8 random hex characters are appended. With 16^8 = 4 billion combinations this is statistically fine, but the collision check doesn't retry - if the suffixed slug also exists (unlikely but possible), it would fail. | LOW |
| S1-9 | failure-mode-resolver.ts | 56-73 | **Incomplete Citation Logic**: When `hasCitation` is true but `sourceRetrievable` is false, the code assumes synthesis drift. However, unretrievable sources could also indicate stale citations, network issues, or access control - not necessarily drift. | LOW |
| S1-10 | pattern-occurrence.repo.ts | 200-211 | **Missing Workspace Validation on Update Options**: The `update` method validates `workspaceId` matches existing record, but if `options.patternId` is provided, it doesn't validate the new pattern belongs to the same workspace. | MEDIUM |

---

## Phase 3: Sonnet Judge Evaluations

### Judge 1 (for Scout H1 - Security-General)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H1-1 | **DISMISS** | `execSync` is called with fixed git commands; the path returned by git is not interpolated into a shell command. The `encoding: 'utf-8'` option is safe. |
| H1-2 | **DISMISS** | Column names are derived from code-level keys (options object properties), not user input. The actual values are always parameterized. |
| H1-3 | **DISMISS** | Values are properly parameterized in prepared statements. Input validation occurs at lines 40-64. |

### Judge 2 (for Scout H2 - Security-Path)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H2-1 | **CONFIRM - HIGH** | `copyDirRecursive` uses `fs.copyFileSync` which follows symlinks. If CORE source contains symlinks (e.g., from a supply chain attack), sensitive files could be read. Should check `entry.isSymbolicLink()`. |
| H2-2 | **MODIFY - LOW** | The package root is controlled by the installed package, not user input. However, defense in depth suggests validating final paths. Downgrade to LOW. |
| H2-3 | **DISMISS** | The `..` sequences from `path.relative` are intentional for representing the path relationship. This value is stored in DB, not used for file operations. |

### Judge 3 (for Scout H3 - Logic-Core)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H3-1 | **CONFIRM - LOW** | Typo `promoteToDerivdPrinciple` is a code quality issue. Not a bug but affects maintainability and searchability. |
| H3-2 | **CONFIRM - MEDIUM** | Documents shorter than 5 lines are skipped entirely. This is a genuine bug for short specs or context packs. |
| H3-3 | **DISMISS** | If `sourceAgreesWithCarrier` is undefined when `hasCitation && sourceRetrievable`, the `=== false` check correctly doesn't match, falling through to other checks. This is intentional three-valued logic (true/false/undefined). |

### Judge 4 (for Scout H4 - Logic-Edge)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H4-1 | **CONFIRM - MEDIUM** | Duplicate of H3-2. Confirmed as genuine edge case bug. |
| H4-2 | **DISMISS** | When `activeOccurrences` is 0, boost is -0.05. This is clamped at line 113. The math is intentional (0 occurrences = small penalty). |
| H4-3 | **DISMISS** | This is expected behavior. The API design uses undefined/missing for "use default". |
| H4-4 | **CONFIRM - MEDIUM** | `computeRecencyWeight` at line 182 calls `daysSinceDate` without the `Math.max(0, ...)` guard, potentially returning weights > 1.0 for future dates. |

### Judge 5 (for Scout H5 - Decisions-Thresholds)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H5-1 | **CONFIRM - LOW** | Constants are defined but rationale is missing. Code quality issue. |
| H5-2 | **CONFIRM - LOW** | Should be a named constant for maintainability. |
| H5-3 | **CONFIRM - LOW** | Should be a named constant. |
| H5-4 | **CONFIRM - LOW** | Values lack documentation. Spec reference exists but inline explanation helps. |
| H5-5 | **CONFIRM - LOW** | Magic numbers should be constants with documented rationale. |

### Judge 6 (for Scout H6 - Decisions-Architecture)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H6-1 | **CONFIRM - MEDIUM** | N+1 query pattern is a genuine performance issue. Should refactor to use single query with proper mapping. |
| H6-2 | **CONFIRM - MEDIUM** | `provisionalAlertId` is in the options interface but not handled in the update logic. This is either dead code or incomplete implementation. |
| H6-3 | **CONFIRM - MEDIUM** | Interface mismatch creates confusing abstraction. The mock pattern in promotion-checker works around it incorrectly. |

### Judge 7 (for Scout H7 - Documentation-API)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H7-1 | **DISMISS** | CLI commands are typically self-documenting via help text. The file has adequate header comments. |
| H7-2 | **CONFIRM - LOW** | Underscore prefix convention and export together is confusing. Should document intent. |
| H7-3 | **DISMISS** | Return type documentation is sufficient for this internal function. |

### Judge 8 (for Scout H8 - Documentation-Internal)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H8-1 | **CONFIRM - LOW** | The `findById` approach is inefficient and unexplained. Comment should explain or code should be fixed. |
| H8-2 | **DISMISS** | The threshold is somewhat self-documenting. Score system is explained in surrounding comments. |
| H8-3 | **CONFIRM - LOW** | Comment is misleading. Should say "Zero occurrences = small negative contribution (clamped)" |

### Judge 9 (for Scout H9 - Spec-Compliance)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H9-1 | **CONFIRM - HIGH** | Direct violation of CLAUDE.md spec: "append-only history - Never mutate occurrence records; mark inactive instead". The update method modifies records in place. |
| H9-2 | **MODIFY - LOW** | Re-reading spec: "security patterns get priority in injection" refers to injection, not promotion. The promotion restriction to security is a design choice, not a spec violation. Downgrade to LOW for being overly restrictive but not non-compliant. |
| H9-3 | **DISMISS** | Comments document design intent. Runtime enforcement for computed-only values is unnecessary overhead. |

### Judge 10 (for Scout H10 - Coverage-Critical)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| H10-1 | **CONFIRM - LOW** | Error swallowing is acceptable for "not a repo" case, but logging could help debugging. Minor issue. |
| H10-2 | **CONFIRM - MEDIUM** | If `NoncomplianceCause` enum includes other values (like 'token_limit', 'complexity'), they can never be returned. Need to verify schema. |
| H10-3 | **CONFIRM - MEDIUM** | JSON parsing in `parseJsonField` (inherited from base) should have try-catch with meaningful error. |

### Judge 11 (for Scout S1 - Sonnet Deep Analysis)

| Finding | Verdict | Reasoning |
|---------|---------|-----------|
| S1-1 | **CONFIRM - HIGH** | Symlink traversal is a real security risk. Defense in depth requires checking for symlinks. |
| S1-2 | **CONFIRM - HIGH** | Clear spec violation. The update method is fundamentally incompatible with append-only design. |
| S1-3 | **CONFIRM - MEDIUM** | Duplicate of H3-2/H4-1. Genuine bug confirmed. |
| S1-4 | **CONFIRM - MEDIUM** | Duplicate of H6-1. Performance issue confirmed. |
| S1-5 | **CONFIRM - MEDIUM** | Duplicate of H4-4 with additional detail. Confirmed. |
| S1-6 | **CONFIRM - MEDIUM** | Duplicate of H6-3. Interface mismatch confirmed. |
| S1-7 | **CONFIRM - MEDIUM** | Related to S1-6. The workaround creates hidden contract violation. |
| S1-8 | **DISMISS** | Probability of double collision is astronomically low. Not a practical concern. |
| S1-9 | **MODIFY - LOW** | Valid observation but the logic is acceptable for v1.0. Could add comment explaining assumption. |
| S1-10 | **CONFIRM - MEDIUM** | Valid security concern. Cross-workspace pattern injection should be validated. |

---

## Phase 4: Opus High Judge Consolidation

### Haiku Consensus Analysis (Issues found by 3+ Haiku scouts)

| Issue | Scouts | Description |
|-------|--------|-------------|
| Small document edge case | H3-2, H4-1 (2 scouts) | Documents < 5 lines not searched |
| Magic numbers undocumented | H5-1 through H5-5 (1 scout, multiple findings) | Various thresholds lack documentation |

*Note: Most issues were unique to individual scouts. The specialized focus areas meant less overlap than expected.*

### Haiku + Sonnet Agreement

| Issue | Haiku Scout | Sonnet Scout | Agreement |
|-------|-------------|--------------|-----------|
| Symlink path traversal | H2-1 | S1-1 | FULL AGREEMENT - HIGH |
| Append-only spec violation | H9-1 | S1-2 | FULL AGREEMENT - HIGH |
| Small document bug | H3-2, H4-1 | S1-3 | FULL AGREEMENT - MEDIUM |
| N+1 query pattern | H6-1 | S1-4 | FULL AGREEMENT - MEDIUM |
| Future date vulnerability | H4-4 | S1-5 | FULL AGREEMENT - MEDIUM |
| Interface mismatch | H6-3 | S1-6 | FULL AGREEMENT - MEDIUM |
| provisionalAlertId not handled | H6-2 | - | HAIKU ONLY - MEDIUM |
| Cross-workspace validation | - | S1-10 | SONNET ONLY - MEDIUM |

### Deduplicated Final Issues List

| # | Severity | Title | Files | Confidence |
|---|----------|-------|-------|------------|
| 1 | **HIGH** | Symlink Path Traversal in copyDirRecursive | init.ts:318-331 | HIGH (Haiku+Sonnet) |
| 2 | **HIGH** | Append-Only Spec Violation in occurrence update | pattern-occurrence.repo.ts:200-246 | HIGH (Haiku+Sonnet) |
| 3 | **MEDIUM** | Small Documents Never Searched | noncompliance-checker.ts:182-197 | HIGH (Haiku+Sonnet) |
| 4 | **MEDIUM** | N+1 Query Pattern in Promotion Checker | promotion-checker.ts:217-228 | HIGH (Haiku+Sonnet) |
| 5 | **MEDIUM** | Future Date Handling Bug in Recency Weight | confidence.ts:182, 192-196 | HIGH (Haiku+Sonnet) |
| 6 | **MEDIUM** | Interface Contract Mismatch (OccurrenceRepoLike) | confidence.ts:21-30, promotion-checker.ts:256-260 | HIGH (Haiku+Sonnet) |
| 7 | **MEDIUM** | provisionalAlertId Not Handled in Update | pattern-occurrence.repo.ts:200-246 | MEDIUM (Haiku only) |
| 8 | **MEDIUM** | Missing Cross-Workspace Validation | pattern-occurrence.repo.ts:200-211 | MEDIUM (Sonnet only) |
| 9 | **MEDIUM** | Unreachable NoncomplianceCause Values | noncompliance-checker.ts:209-228 | MEDIUM (Haiku only) |
| 10 | **MEDIUM** | JSON Parse Error Not Handled | pattern-occurrence.repo.ts:403 | MEDIUM (Haiku only) |
| 11 | **LOW** | Function Name Typo (promoteToDerivdPrinciple) | promotion-checker.ts:131 | HIGH (confirmed) |
| 12 | **LOW** | Magic Numbers Undocumented (multiple) | confidence.ts, noncompliance-checker.ts, promotion-checker.ts | MEDIUM (style) |
| 13 | **LOW** | Misleading Comment on Occurrence Boost | confidence.ts:93-95 | LOW (minor) |
| 14 | **LOW** | Unexplained findById Usage Pattern | promotion-checker.ts:227-228 | LOW (minor) |
| 15 | **LOW** | Package Path Validation | init.ts:254-255 | LOW (defense in depth) |
| 16 | **LOW** | _crossProjectPenalty Underscore Export | confidence.ts:119-121 | LOW (convention) |

---

## Summary Statistics

### Scout Totals

| Scout Type | Raw Findings | Confirmed | Dismissed |
|------------|--------------|-----------|-----------|
| Haiku (10 scouts) | 33 | 22 | 11 |
| Sonnet (1 scout) | 10 | 8 | 2 |
| **Total** | 43 | 30 | 13 |

### Haiku Consensus

- Issues found by 2+ Haiku scouts: **2**
- Issues found by single Haiku scout only: **20**

### Haiku vs Sonnet Comparison

- Issues found by both Haiku AND Sonnet: **6**
- Issues found by Haiku only: **4** (MEDIUM or higher)
- Issues found by Sonnet only: **2** (MEDIUM or higher)

### Final Confirmed Issues by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 8 |
| LOW | 6 |
| **Total** | 16 |

---

## Detailed Issue Descriptions

### HIGH-1: Symlink Path Traversal in copyDirRecursive

**File:** `/Users/tbelfort/Projects/falcon-ai/src/cli/commands/init.ts`
**Lines:** 318-331

**Description:** The `copyDirRecursive` function uses `entry.isDirectory()` to decide whether to recurse, but does not check `entry.isSymbolicLink()`. If the CORE source directory contains symlinks (possible via supply chain attack or misconfiguration), the function will follow them and copy arbitrary files from the filesystem into the target project.

**Code:**
```typescript
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);  // Follows symlinks!
    }
  }
}
```

**Recommendation:** Check for symlinks before copying:
```typescript
if (entry.isSymbolicLink()) {
  // Skip or resolve within allowed bounds
  continue;
}
```

---

### HIGH-2: Append-Only Spec Violation in Occurrence Update

**File:** `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 200-246

**Description:** The CLAUDE.md spec explicitly states "append-only history - Never mutate occurrence records; mark inactive instead". However, the `update` method directly modifies fields like `status`, `wasAdheredTo`, `wasInjected`, and `inactiveReason` on existing records using SQL UPDATE.

**Code:**
```typescript
update(options: {
  workspaceId: string;
  id: string;
  // ... fields that get mutated ...
}): PatternOccurrence | null {
  // ... validation ...
  this.db.prepare(`UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}
```

**Recommendation:** Replace mutation with append-only pattern:
1. Create new occurrence records with updated status
2. Link to previous occurrence ID for audit trail
3. Or use a separate `occurrence_status_history` table

---

### MEDIUM-3: Small Documents Never Searched

**File:** `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts`
**Lines:** 182-197

**Description:** The sliding window search uses `for (let i = 0; i <= lines.length - windowSize; i++)`. When `lines.length < 5`, this evaluates to `i <= negative`, causing the loop to never execute. Short context packs or specs are silently skipped.

**Recommendation:** Handle small documents separately or use adaptive window size:
```typescript
const windowSize = Math.min(5, lines.length);
```

---

### MEDIUM-4: N+1 Query Pattern in Promotion Checker

**File:** `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
**Lines:** 217-228

**Description:** `findMatchingPatternsAcrossProjects` executes one query to get all matching IDs, then calls `patternRepo.findById()` for each row, creating N+1 database queries.

**Recommendation:** Use single query with row mapping or batch findById.

---

### MEDIUM-5: Future Date Handling Bug in Recency Weight

**File:** `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`
**Lines:** 182, 192-196

**Description:** `computeRecencyWeight` calls `daysSinceDate` without guarding against future dates. If `lastSeen` is in the future (clock skew, timezone issues), `daysSinceDate` returns negative, and recency tiers produce incorrect weights.

**Recommendation:** Add guard in `computeRecencyWeight`:
```typescript
const days = Math.max(0, daysSinceDate(lastSeen));
```

---

### MEDIUM-6: Interface Contract Mismatch

**File:** `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`
**Lines:** 21-30

**Description:** `OccurrenceRepoLike.findByPatternId` takes a single string, but the actual repository method takes `{ workspaceId, patternId }`. The workaround in promotion-checker.ts creates a mock that hides this mismatch.

**Recommendation:** Update interface to match actual repository signature.

---

## Quality Rating

**Overall Quality: 7/10**

**Strengths:**
- Good input validation in init.ts (null bytes, length limits, slug format)
- Clear separation of concerns in failure-mode-resolver.ts
- Proper use of prepared statements for SQL injection prevention
- Good TypeScript typing throughout

**Areas for Improvement:**
- Spec compliance (append-only violation is significant)
- Edge case handling (small documents, future dates)
- Performance (N+1 queries)
- Interface consistency (OccurrenceRepoLike mismatch)
- Security hardening (symlink handling)

---

*Report generated by Opus High Judge consolidation of 10 Haiku + 1 Sonnet scout analyses.*
