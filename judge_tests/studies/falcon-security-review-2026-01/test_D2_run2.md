# Multi-Model PR Review Analysis Report
## Test D2 Run 2 - High Volume Haiku Configuration

**Date:** 2026-01-21
**Reviewer:** Opus 4.5 High Judge
**Configuration:** 10 Haiku Scouts + 1 Sonnet Scout + 11 Judges

---

## Executive Summary

This report presents a comprehensive security and code quality review of 6 source files using a multi-model approach with 10 Haiku-simulated scout analyses, 1 Sonnet-level deep analysis, and subsequent judge evaluations.

### Files Reviewed
1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (329 lines)
3. `src/attribution/failure-mode-resolver.ts` (234 lines)
4. `src/attribution/noncompliance-checker.ts` (248 lines)
5. `src/cli/commands/init.ts` (332 lines)
6. `src/injection/confidence.ts` (197 lines)

---

## Phase 1: Haiku Scout Findings (Grouped by Domain)

### Scout 1: Security-General (Injection, Auth Bypass)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H1-SEC-01 | Dynamic SQL query construction pattern | pattern-occurrence.repo.ts:243 | MEDIUM |
| H1-SEC-02 | Missing input validation on repository methods | pattern-occurrence.repo.ts (multiple) | MEDIUM |
| H1-SEC-03 | Unvalidated workspace slug input | init.ts:150-162 | LOW |

### Scout 2: Security-Path (Traversal, Symlinks)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H2-PATH-01 | **Path traversal via symlinks in copyDirRecursive** | init.ts:318-331 | HIGH |
| H2-PATH-02 | User-controlled project name in file path | init.ts:92-100 | MEDIUM |

### Scout 3: Logic-Core (Main Function Bugs)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H3-LOGIC-01 | Typo in function name `promoteToDerivdPrinciple` | promotion-checker.ts:131 | LOW |
| H3-LOGIC-02 | Potential null reference in rowToEntity for prNumber | pattern-occurrence.repo.ts:401 | LOW |

### Scout 4: Logic-Edge (Boundary Conditions)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H4-EDGE-01 | Empty keywords array edge case | noncompliance-checker.ts:101-103 | LOW |
| H4-EDGE-02 | **Document shorter than window size (5 lines)** | noncompliance-checker.ts:183 | MEDIUM |
| H4-EDGE-03 | Zero patterns division handling | promotion-checker.ts:241-243 | LOW |

### Scout 5: Decisions-Thresholds (Magic Numbers)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H5-THRESH-01 | Hardcoded relevance threshold 0.3 | noncompliance-checker.ts:112 | LOW |
| H5-THRESH-02 | Multiple magic numbers in confidence calculation | confidence.ts:82-110 | LOW |
| H5-THRESH-03 | Promotion constants not configurable | promotion-checker.ts:36-52 | LOW |
| H5-THRESH-04 | Sliding window size hardcoded | noncompliance-checker.ts:182 | LOW |

### Scout 6: Decisions-Architecture (Design Choices)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H6-ARCH-01 | Repository creates own dependencies (no DI) | promotion-checker.ts:61-62, 171-172 | MEDIUM |
| H6-ARCH-02 | **Direct database access bypassing repository** | promotion-checker.ts:217-228 | MEDIUM |
| H6-ARCH-03 | Console.log in business logic | promotion-checker.ts:197-200 | LOW |

### Scout 7: Documentation-API (Public Interface Docs)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H7-DOC-01 | Missing JSDoc return types | confidence.ts:36-60 | LOW |
| H7-DOC-02 | Incomplete parameter documentation | pattern-occurrence.repo.ts:256-260 | LOW |

### Scout 8: Documentation-Internal (Implementation Comments)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H8-DOC-01 | Missing context in section header comment | failure-mode-resolver.ts:119 | LOW |
| H8-DOC-02 | Missing comment explaining sliding window algorithm | noncompliance-checker.ts:181-197 | LOW |

### Scout 9: Spec-Compliance (CLAUDE.md Adherence)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H9-SPEC-01 | Non-deterministic UUID generation | pattern-occurrence.repo.ts:149, init.ts | LOW |
| H9-SPEC-02 | **Security-only promotion vs security-priority** | promotion-checker.ts:93-99 | MEDIUM |

### Scout 10: Coverage-Critical (Untested Paths)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| H10-COV-01 | No error handling for database operations | pattern-occurrence.repo.ts:156-192 | MEDIUM |
| H10-COV-02 | Missing validation in EvidenceBundle | failure-mode-resolver.ts:44-158 | MEDIUM |
| H10-COV-03 | execSync without error handling | init.ts:296-310 | LOW |

---

## Phase 2: Sonnet Scout Findings (Deep Analysis)

| ID | Finding | Location | Initial Severity |
|----|---------|----------|------------------|
| S-SEC-01 | **CRITICAL: Symlink attack in copyDirRecursive** | init.ts:318-331 | CRITICAL |
| S-SEC-02 | TOCTOU race condition in init | init.ts:82-87, 232-235 | MEDIUM |
| S-SEC-03 | Insufficient slug validation regex | init.ts:57-64 | LOW |
| S-LOGIC-01 | Inconsistent error handling pattern | failure-mode-resolver.ts | LOW |
| S-LOGIC-02 | Potential integer overflow in date calculation | confidence.ts:192-196 | LOW |
| S-LOGIC-03 | Silent failure with non-null assertion | promotion-checker.ts:228 | MEDIUM |
| S-ARCH-01 | Circular dependency risk | promotion-checker.ts | LOW |
| S-ARCH-02 | Repository pattern violation (duplicate of H6-ARCH-02) | promotion-checker.ts:217-228 | MEDIUM |
| S-DATA-01 | **Append-only principle violation in update method** | pattern-occurrence.repo.ts:200-246 | HIGH |
| S-DATA-02 | Missing transaction boundary | init.ts:192-227 | MEDIUM |
| S-EDGE-01 | Empty string excerpt hash handling | pattern-occurrence.repo.ts:413-414 | LOW |
| S-COV-01 | No input sanitization for SQL LIKE patterns | pattern-occurrence.repo.ts | LOW |
| S-COV-02 | Missing bounds check on severity array | confidence.ts:142-147 | MEDIUM |

---

## Haiku Consensus Analysis

Issues found by 3+ Haiku scouts indicate higher confidence in the finding.

### High Consensus (3+ Scouts)

| Issue | Scouts | Description |
|-------|--------|-------------|
| Path traversal / symlink vulnerability | H2, H10, S | `copyDirRecursive` doesn't validate symlinks or entry names |
| Repository pattern violation / DI issues | H6, S, H10 | Direct DB access and hardcoded dependencies |
| Magic numbers not configurable | H5, H8 | Multiple thresholds hardcoded throughout |

### Medium Consensus (2 Scouts)

| Issue | Scouts | Description |
|-------|--------|-------------|
| Document < 5 lines not searched | H4, S | Sliding window algorithm edge case |
| Input validation gaps | H1, H10 | Various methods accept unvalidated input |

---

## Phase 3: Judge Verdicts

### Confirmed Findings

| Original ID | Final Severity | Verdict | Rationale |
|-------------|----------------|---------|-----------|
| H2-PATH-01 / S-SEC-01 | **CRITICAL** | CONFIRM | Symlink following allows file exfiltration from crafted CORE directory |
| S-DATA-01 | **HIGH** | CONFIRM | Update method violates append-only principle stated in CLAUDE.md |
| H4-EDGE-02 | **MEDIUM** | CONFIRM | Documents <5 lines never searched, real functional bug |
| H6-ARCH-01 | **MEDIUM** | CONFIRM | Prevents dependency injection and unit testing |
| H6-ARCH-02 / S-ARCH-02 | **MEDIUM** | CONFIRM | Clear repository pattern violation |
| H9-SPEC-02 | **MEDIUM** | CONFIRM | Security exclusivity vs priority conflicts with CLAUDE.md |
| H10-COV-01 | **MEDIUM** | CONFIRM | DB errors should be caught and wrapped |
| H10-COV-02 | **MEDIUM** | CONFIRM | External input needs defensive validation |
| S-LOGIC-03 | **MEDIUM** | CONFIRM | Non-null assertion without check is risky |
| S-DATA-02 | **MEDIUM** | CONFIRM | Transaction would improve reliability |
| S-COV-02 | **MEDIUM** | CONFIRM | Invalid severity causes NaN propagation |
| H1-SEC-01 | **LOW** | MODIFY | Safe pattern but flagged for awareness |
| H2-PATH-02 | **LOW** | MODIFY | path.basename provides partial protection |
| H3-LOGIC-01 | **LOW** | CONFIRM | Typo in public API |
| H4-EDGE-01 | **LOW** | CONFIRM | Graceful degradation is acceptable |
| H5-THRESH-01 | **LOW** | CONFIRM | Should be configurable |
| H5-THRESH-02 | **LOW** | CONFIRM | Documented in spec, acceptable for v1.0 |
| H5-THRESH-03 | **LOW** | CONFIRM | Should be configurable |
| H5-THRESH-04 | **LOW** | CONFIRM | Arbitrary but reasonable |
| H6-ARCH-03 | **LOW** | CONFIRM | Should use structured logger |
| H7-DOC-02 | **LOW** | CONFIRM | Options objects should be documented |
| H8-DOC-02 | **LOW** | CONFIRM | Algorithm rationale should be documented |
| S-SEC-02 | **LOW** | MODIFY | Race condition unlikely in CLI context |
| S-SEC-03 | **LOW** | CONFIRM | Slugs shouldn't start with special chars |
| S-EDGE-01 | **LOW** | CONFIRM | Empty string vs undefined matters |

### Dismissed Findings

| Original ID | Reason |
|-------------|--------|
| H1-SEC-02 | Parameterized queries protect against injection |
| H1-SEC-03 | Already protected by parameterized query |
| H3-LOGIC-02 | Schema validation ensures prNumber present |
| H4-EDGE-03 | Returning 0 for empty array is correct |
| H7-DOC-01 | TypeScript types provide sufficient documentation |
| H8-DOC-01 | Comment structure is clear |
| H9-SPEC-01 | "Deterministic" refers to decision logic, not IDs |
| H10-COV-03 | Exceptions properly caught |
| S-LOGIC-01 | Code structure is clear |
| S-LOGIC-02 | JavaScript handles large numbers safely |
| S-ARCH-01 | Speculative, no current circular dependency |
| S-COV-01 | No LIKE queries exist, speculative |

---

## Phase 4: High Judge Final Consolidated List

### CRITICAL (1)

#### 1. Symlink Attack Vulnerability in copyDirRecursive
**File:** `/Users/tbelfort/Projects/falcon-ai/src/cli/commands/init.ts`
**Lines:** 318-331
**Found by:** Haiku Scout 2 (H2-PATH-01), Sonnet Scout (S-SEC-01)

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

**Issue:** The function:
1. Does not validate that `entry.name` doesn't contain path traversal sequences (`..`)
2. Follows symlinks - `entry.isDirectory()` and `fs.copyFileSync` follow symlinks
3. A malicious CORE directory (from a compromised package) could contain symlinks pointing to sensitive files like `~/.ssh/id_rsa` or `/etc/passwd`

**Impact:** An attacker could craft a malicious package that, when `falcon init` is run, exfiltrates sensitive data by copying it into the project's `.falcon/` or `.claude/` directories.

**Recommendation:**
- Use `fs.lstatSync` to check if entry is a symlink and skip/error
- Validate `entry.name` doesn't contain `..` or absolute paths
- Consider using `fs.copyFile` with `COPYFILE_EXCL` flag

---

### HIGH (1)

#### 2. Append-Only Principle Violation in PatternOccurrence Update
**File:** `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 200-246
**Found by:** Sonnet Scout (S-DATA-01)

```typescript
update(options: {
  workspaceId: string;
  id: string;
  patternId?: string;           // Can modify!
  provisionalAlertId?: string | null;
  wasInjected?: boolean;        // Can modify!
  wasAdheredTo?: boolean | null; // Can modify!
  status?: 'active' | 'inactive';
  inactiveReason?: string | null;
}): PatternOccurrence | null {
```

**Issue:** CLAUDE.md explicitly states: "Append-only history - Never mutate occurrence records; mark inactive instead"

The update method allows modification of:
- `patternId` - Changes which pattern this occurrence belongs to
- `wasInjected` - Retroactively changes injection history
- `wasAdheredTo` - Retroactively changes adherence tracking

These mutations violate the append-only principle and could corrupt historical analysis.

**Recommendation:**
- Remove mutable fields from update method
- Only allow `status` and `inactiveReason` changes
- Create new occurrence records for corrections with references to original

---

### MEDIUM (9)

#### 3. Document Shorter Than Window Size Not Searched
**File:** `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts`
**Lines:** 181-197
**Found by:** Haiku Scout 4 (H4-EDGE-02)

```typescript
const windowSize = 5;
for (let i = 0; i <= lines.length - windowSize; i++) {
```

**Issue:** If `lines.length < 5`, the loop never executes, meaning short documents are never searched for keyword matches.

**Impact:** Short context packs or specs (under 5 lines) will never trigger noncompliance detection.

**Recommendation:** Handle edge case with single-pass for short documents, or reduce minimum window size.

---

#### 4. Repository Creates Own Dependencies (No Dependency Injection)
**File:** `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
**Lines:** 61-62, 171-172
**Found by:** Haiku Scout 6 (H6-ARCH-01)

```typescript
export function checkForPromotion(db: Database, pattern: PatternDefinition): PromotionCheckResult {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
```

**Issue:** Functions instantiate their own repositories, preventing:
- Mocking for unit tests
- Caching implementations
- Alternative storage backends

**Recommendation:** Accept repositories as parameters or use a factory/DI container.

---

#### 5. Direct Database Access Bypassing Repository
**File:** `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
**Lines:** 217-228
**Found by:** Haiku Scout 6 (H6-ARCH-02), Sonnet Scout (S-ARCH-02)

```typescript
function findMatchingPatternsAcrossProjects(db: Database, workspaceId: string, patternKey: string): PatternDefinition[] {
  const rows = db.prepare(`
    SELECT * FROM pattern_definitions
    WHERE workspace_id = ? AND pattern_key = ? AND status = 'active'
  `).all(workspaceId, patternKey);
```

**Issue:** Direct SQL access bypasses the repository layer, violating separation of concerns and making it impossible to:
- Add caching at the repository level
- Mock database access for testing
- Enforce access controls consistently

**Recommendation:** Add `findByPatternKey` method to `PatternDefinitionRepository`.

---

#### 6. Security-Only Promotion Conflicts with CLAUDE.md
**File:** `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
**Lines:** 93-99
**Found by:** Haiku Scout 9 (H9-SPEC-02)

```typescript
if (pattern.findingCategory !== 'security') {
  return {
    qualifies: false,
    projectCount,
    averageConfidence: 0,
    reason: `Non-security patterns not eligible for promotion (category: ${pattern.findingCategory})`,
  };
}
```

**Issue:** CLAUDE.md states "Security bias - Security patterns get priority in injection" but the implementation excludes non-security patterns entirely from promotion.

**Impact:** Patterns in categories like `correctness`, `performance`, or `maintainability` can never become workspace-level principles, even if they appear across many projects.

**Recommendation:** Allow promotion with security patterns receiving a boost, not exclusive eligibility.

---

#### 7. No Error Handling for Database Operations
**File:** `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 156-192
**Found by:** Haiku Scout 10 (H10-COV-01)

```typescript
create(data: CreateInput): PatternOccurrence {
  // ... validation ...
  this.db.prepare(`INSERT INTO pattern_occurrences ...`).run(...);  // No try/catch
  return occurrence;
}
```

**Issue:** Database operations can fail (constraint violations, disk errors, etc.) but no error handling wraps the critical `prepare().run()` call.

**Recommendation:** Wrap in try/catch with contextual error messages.

---

#### 8. Missing Validation in EvidenceBundle Processing
**File:** `/Users/tbelfort/Projects/falcon-ai/src/attribution/failure-mode-resolver.ts`
**Lines:** 44-158
**Found by:** Haiku Scout 10 (H10-COV-02)

```typescript
export function resolveFailureMode(evidence: EvidenceBundle): ResolverResult {
  // Assumes evidence.hasCitation, evidence.sourceRetrievable, etc. exist and are valid types
```

**Issue:** The function assumes the EvidenceBundle structure is valid but doesn't validate. If the Attribution Agent produces malformed evidence, this could throw or produce incorrect results.

**Recommendation:** Add schema validation at function entry or use Zod to parse input.

---

#### 9. Non-null Assertion Without Validation
**File:** `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
**Line:** 228
**Found by:** Sonnet Scout (S-LOGIC-03)

```typescript
return rows.map((row) => patternRepo.findById(row.id as string)!);
```

**Issue:** The `!` assertion assumes `findById` always returns a value, but the pattern could be deleted between the query and the lookup (race condition).

**Recommendation:** Filter null results or throw explicit error for missing patterns.

---

#### 10. Missing Transaction Boundary in Init
**File:** `/Users/tbelfort/Projects/falcon-ai/src/cli/commands/init.ts`
**Lines:** 192-227
**Found by:** Sonnet Scout (S-DATA-02)

```typescript
// STEP 5: Create workspace (DB write)
db.prepare(`INSERT INTO workspaces ...`).run(...);

// STEP 6: Create project (DB write)
db.prepare(`INSERT INTO projects ...`).run(...);

// STEP 7: Write config file (filesystem)
fs.writeFileSync(configPath, yaml.stringify(config));
```

**Issue:** If step 7 fails, the database contains orphaned workspace/project records with no corresponding config file.

**Recommendation:** Use database transaction and clean up on file write failure.

---

#### 11. Invalid Severity Causes NaN Propagation
**File:** `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`
**Lines:** 142-147
**Found by:** Sonnet Scout (S-COV-02)

```typescript
const severityWeight: Record<Severity, number> = {
  CRITICAL: 1.0, HIGH: 0.9, MEDIUM: 0.7, LOW: 0.5,
};
// ...
return attributionConfidence * severityWeight[pattern.severityMax] * ...;
```

**Issue:** If `pattern.severityMax` is not a valid `Severity` value, `severityWeight[pattern.severityMax]` returns `undefined`, causing NaN to propagate through calculations.

**Recommendation:** Add validation or use a default value with warning.

---

### LOW (13)

| ID | Finding | File | Line |
|----|---------|------|------|
| 12 | Dynamic SQL pattern (safe but flaggable) | pattern-occurrence.repo.ts | 243 |
| 13 | User-controlled project name (partial protection) | init.ts | 92-100 |
| 14 | Typo in function name `promoteToDerivdPrinciple` | promotion-checker.ts | 131 |
| 15 | Empty keywords array edge case | noncompliance-checker.ts | 101-103 |
| 16 | Hardcoded relevance threshold | noncompliance-checker.ts | 112 |
| 17 | Magic numbers in confidence calculation | confidence.ts | 82-110 |
| 18 | Promotion constants not configurable | promotion-checker.ts | 36-52 |
| 19 | Sliding window size hardcoded | noncompliance-checker.ts | 182 |
| 20 | Console.log in business logic | promotion-checker.ts | 197-200 |
| 21 | Incomplete parameter documentation | pattern-occurrence.repo.ts | 256-260 |
| 22 | Missing algorithm rationale comment | noncompliance-checker.ts | 181-197 |
| 23 | TOCTOU race condition (unlikely in CLI) | init.ts | 82-87 |
| 24 | Slug validation allows leading dash/underscore | init.ts | 57-64 |
| 25 | Empty string excerpt hash handling | pattern-occurrence.repo.ts | 413-414 |

---

## Summary Statistics

### Scout Findings Count

| Scout | Domain | Raw Findings | After Judge |
|-------|--------|--------------|-------------|
| Haiku 1 | Security-General | 3 | 1 |
| Haiku 2 | Security-Path | 2 | 2 |
| Haiku 3 | Logic-Core | 2 | 1 |
| Haiku 4 | Logic-Edge | 3 | 2 |
| Haiku 5 | Decisions-Thresholds | 4 | 4 |
| Haiku 6 | Decisions-Architecture | 3 | 3 |
| Haiku 7 | Documentation-API | 2 | 1 |
| Haiku 8 | Documentation-Internal | 2 | 1 |
| Haiku 9 | Spec-Compliance | 2 | 1 |
| Haiku 10 | Coverage-Critical | 3 | 2 |
| **Haiku Total** | - | **26** | **18** |
| Sonnet | All Domains | 14 | 9 |

### Haiku Consensus Analysis

- **High Consensus (3+ scouts):** 3 issues
- **Medium Consensus (2 scouts):** 2 issues
- **Single Scout Findings:** 21 issues

### Final Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 9 |
| LOW | 13 |
| **Total Confirmed** | **24** |
| Dismissed | 12 |

### Comparison: Haiku Consensus vs Sonnet

| Finding | Haiku Found | Sonnet Found | Notes |
|---------|-------------|--------------|-------|
| Symlink vulnerability | Yes (H2) | Yes (S-SEC-01) | Both identified CRITICAL |
| Append-only violation | No | Yes (S-DATA-01) | Sonnet unique insight |
| Repository pattern violation | Yes (H6) | Yes (S-ARCH-02) | Consensus |
| Missing transaction | No | Yes (S-DATA-02) | Sonnet unique insight |
| Severity bounds check | No | Yes (S-COV-02) | Sonnet unique insight |

**Observation:** Sonnet found 3 unique MEDIUM/HIGH issues that none of the 10 Haiku scouts identified, particularly around data integrity (append-only violation, transaction boundaries) and edge cases (severity bounds).

---

## Quality Rating

**Overall Code Quality: 6.5/10**

### Strengths
- Well-documented code with clear JSDoc comments
- Proper use of TypeScript types
- Parameterized SQL queries (no SQL injection)
- Defensive coding in some areas (e.g., negative days check in confidence.ts)

### Areas for Improvement
- Critical security vulnerability in file copying
- Spec compliance issue with append-only principle
- Inconsistent use of dependency injection
- Missing error handling in database operations
- Several edge cases not handled

### Priority Recommendations
1. **Immediate:** Fix symlink vulnerability in `copyDirRecursive`
2. **High:** Review and restrict `PatternOccurrence.update` to maintain append-only semantics
3. **Medium:** Add dependency injection support to promotion-checker
4. **Medium:** Add transaction support to init command
5. **Low:** Make thresholds configurable via config file

---

## Appendix: Raw Finding Cross-Reference

| Final ID | Original IDs | Source Scouts |
|----------|--------------|---------------|
| 1 | H2-PATH-01, S-SEC-01 | Haiku 2, Sonnet |
| 2 | S-DATA-01 | Sonnet |
| 3 | H4-EDGE-02 | Haiku 4 |
| 4 | H6-ARCH-01 | Haiku 6 |
| 5 | H6-ARCH-02, S-ARCH-02 | Haiku 6, Sonnet |
| 6 | H9-SPEC-02 | Haiku 9 |
| 7 | H10-COV-01 | Haiku 10 |
| 8 | H10-COV-02 | Haiku 10 |
| 9 | S-LOGIC-03 | Sonnet |
| 10 | S-DATA-02 | Sonnet |
| 11 | S-COV-02 | Sonnet |

---

*Report generated by Opus 4.5 High Judge consolidation process*
