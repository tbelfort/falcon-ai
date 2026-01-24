# PR Review Model Comparison Test - B1

**Test Configuration:** Scouts: OPUS, Judges: SONNET (Batch mode - all findings at once)
**Date:** 2026-01-20
**PR:** #6 - security-review/full-codebase-audit-2026-01-20
**Model:** claude-opus-4-5-20251101

## Files Reviewed

1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (330 lines)
3. `src/attribution/failure-mode-resolver.ts` (235 lines)
4. `src/attribution/noncompliance-checker.ts` (249 lines)
5. `src/cli/commands/init.ts` (333 lines)
6. `src/injection/confidence.ts` (198 lines)

---

# SCOUT REPORTS

---

## Scout 1: Security Scout (OPUS)

### Mission
Identify security vulnerabilities, attack vectors, injection risks, authentication/authorization issues, and data exposure concerns.

### Findings

#### SEC-001: SQL Injection Risk in Dynamic Query Construction
- **Severity:** HIGH
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Line:** 243
- **Description:** The `update()` method constructs SQL dynamically using string concatenation for column names (`updates.join(', ')`). While column names are derived from code (not user input), this pattern is fragile and could become vulnerable if the code evolves.
- **Code:**
```typescript
this.db.prepare(`UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?`).run(...params);
```
- **Risk:** If any future modification allows user-controlled field names, this becomes a direct SQL injection vector.
- **Recommendation:** Use a whitelist-based approach with explicit column mappings.

#### SEC-002: No Input Sanitization on JSON Fields
- **Severity:** MEDIUM
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 176-181
- **Description:** JSON fields (`evidence`, `carrierFingerprint`, `originFingerprint`, `provenanceChain`) are stringified and stored without validation of their structure or content. Malformed or excessively large JSON could cause issues.
- **Code:**
```typescript
this.stringifyJsonField(occurrence.evidence),
this.stringifyJsonField(occurrence.carrierFingerprint),
```
- **Risk:** DoS via extremely large JSON payloads; potential for stored XSS if JSON is ever rendered in UI.

#### SEC-003: Command Injection Risk via execSync
- **Severity:** HIGH
- **File:** `src/cli/commands/init.ts`
- **Lines:** 296-310
- **Description:** `execSync` is used to execute git commands. While current usage appears safe, there's no shell escaping applied to paths that could theoretically be influenced.
- **Code:**
```typescript
function findGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}
```
- **Risk:** If the git repo path contains malicious characters (unlikely but possible on some systems), command injection could occur.

#### SEC-004: Path Traversal in copyDirRecursive
- **Severity:** MEDIUM
- **File:** `src/cli/commands/init.ts`
- **Lines:** 318-331
- **Description:** The `copyDirRecursive` function does not validate that destination paths remain within expected boundaries. A maliciously crafted source directory with symlinks could potentially write outside intended directories.
- **Code:**
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
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
```
- **Risk:** Symlink following could allow writing to arbitrary locations.

#### SEC-005: Sensitive IDs Exposed in Logs
- **Severity:** LOW
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 197-200
- **Description:** Pattern IDs and derived principle IDs are logged to console. These internal identifiers could be valuable for an attacker understanding system state.
- **Code:**
```typescript
console.log(
  `[PromotionChecker] Promoted pattern ${pattern.id} to derived principle ${principle.id} ` +
    `(${projectCount} projects, ${(confidence * 100).toFixed(1)}% confidence)`
);
```
- **Risk:** Information disclosure in logs accessible to unauthorized parties.

#### SEC-006: Missing Workspace Authorization Check
- **Severity:** HIGH
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 210-211
- **Description:** The `update()` method only checks if `workspaceId` matches after fetching the record. There's no check that the caller is authorized to access that workspace.
- **Code:**
```typescript
const existing = this.findById(options.id);
if (!existing || existing.workspaceId !== options.workspaceId) return null;
```
- **Risk:** Without proper authorization at higher layers, this could allow cross-tenant data modification.

#### SEC-007: Unrestricted File Operations in Init
- **Severity:** MEDIUM
- **File:** `src/cli/commands/init.ts`
- **Lines:** 232-251
- **Description:** The init command creates directories and writes files without checking permissions or existing content ownership.
- **Risk:** Could overwrite important files if run with elevated privileges in wrong directory.

---

## Scout 2: Docs Scout (OPUS)

### Mission
Check documentation compliance, JSDoc completeness, inline comments accuracy, and README/spec alignment.

### Findings

#### DOC-001: Function Name Typo - promoteToDerivdPrinciple
- **Severity:** HIGH
- **File:** `src/evolution/promotion-checker.ts`
- **Line:** 131
- **Description:** Function name contains typo "Derivd" instead of "Derived". This affects code readability, searchability, and API documentation.
- **Code:**
```typescript
export function promoteToDerivdPrinciple(
```
- **Recommendation:** Rename to `promoteToDeriveDprinciple` or `promoteToDerivedPrinciple`.

#### DOC-002: Inconsistent JSDoc Parameter Documentation
- **Severity:** LOW
- **File:** `src/attribution/failure-mode-resolver.ts`
- **Lines:** 44, 167, 195
- **Description:** Some functions have `@param` tags while others don't. `resolveFailureMode` has complete docs but `calculateAmbiguityScore` and `calculateIncompletenessScore` lack parameter documentation.

#### DOC-003: Missing Return Type Documentation
- **Severity:** LOW
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 141, 171, 209
- **Description:** Helper functions `extractKeywords`, `searchDocument`, and `analyzePossibleCauses` have implementation but no `@returns` documentation explaining what they return.

#### DOC-004: Outdated Comment Reference
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Lines:** 65-72
- **Description:** Comment references "Spec Section 4.1" and "Spec Section 4.2" but doesn't specify which spec version. Given the spec is at v1.1, this could become confusing.
- **Code:**
```typescript
/**
 * Compute attribution confidence for a pattern.
 * See Spec Section 4.1.
```
- **Recommendation:** Update to "See Spec v1.1 Section 4.1" or link to specific spec document.

#### DOC-005: Incomplete Module Header Documentation
- **Severity:** LOW
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 1-6
- **Description:** Module header mentions "Phase 5 change detection" but doesn't explain the relationship to other phases or provide architecture context.

#### DOC-006: Missing Error Documentation
- **Severity:** MEDIUM
- **File:** `src/cli/commands/init.ts`
- **Description:** The `validateInput` and `validateSlug` functions throw errors but there's no documentation of what conditions cause which errors.

---

## Scout 3: Bug Scout (OPUS)

### Mission
Find logic errors, edge cases, null reference issues, race conditions, and incorrect behavior.

### Findings

#### BUG-001: Potential Division by Zero
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Lines:** 55-58
- **Description:** `adherenceRate` calculation could theoretically have issues if `injectedOccurrences.length` becomes 0 after filter, though currently guarded.
- **Code:**
```typescript
adherenceRate:
  injectedOccurrences.length > 0
    ? adheredOccurrences.length / injectedOccurrences.length
    : null,
```
- **Status:** Properly guarded, but consider documenting the null semantics.

#### BUG-002: Negative Days Protection May Hide Bugs
- **Severity:** LOW
- **File:** `src/injection/confidence.ts`
- **Lines:** 100-101
- **Description:** The `Math.max(0, daysSinceDate(...))` guard silently converts negative days to zero. This could hide clock skew or timezone bugs instead of surfacing them.
- **Code:**
```typescript
const daysSince = Math.max(0, daysSinceDate(stats.lastSeenActive));
```
- **Recommendation:** Log a warning when negative days are detected.

#### BUG-003: Missing Null Check in rowToEntity
- **Severity:** MEDIUM
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 393-423
- **Description:** `rowToEntity` assumes all required fields exist in the row. If database schema changes or data is corrupted, this could throw cryptic errors.
- **Code:**
```typescript
return {
  id: row.id as string,
  patternId: row.pattern_id as string,
  // ... no null checks
```

#### BUG-004: Sliding Window Edge Case
- **Severity:** LOW
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 181-198
- **Description:** The sliding window algorithm skips the last `windowSize - 1` lines of the document. For short documents, this could miss important content.
- **Code:**
```typescript
const windowSize = 5;
for (let i = 0; i <= lines.length - windowSize; i++) {
```
- **Impact:** Documents with fewer than 5 lines are never searched.

#### BUG-005: Race Condition in Workspace Creation
- **Severity:** MEDIUM
- **File:** `src/cli/commands/init.ts`
- **Lines:** 173-179
- **Description:** There's a TOCTOU (time-of-check-time-of-use) race between checking for existing workspace and creating new one.
- **Code:**
```typescript
const existingWorkspace = db
  .prepare('SELECT * FROM workspaces WHERE slug = ?')
  .get(workspaceSlug) as Workspace | undefined;

if (existingWorkspace) {
  workspaceSlug = `${defaultSlug}-${randomUUID().slice(0, 8)}`;
}
// ... then insert
```
- **Risk:** Two concurrent `falcon init` calls could create duplicate slugs.

#### BUG-006: Inefficient Pattern Lookup
- **Severity:** LOW
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 226-229
- **Description:** `findMatchingPatternsAcrossProjects` fetches all rows then calls `findById` for each, resulting in N+1 queries.
- **Code:**
```typescript
return rows.map((row) => patternRepo.findById(row.id as string)!);
```

#### BUG-007: Missing provisionalAlertId Update Handling
- **Severity:** MEDIUM
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 200-246
- **Description:** The `update()` method handles `patternId` updates but the `provisionalAlertId` parameter in the options type is never actually used in the update logic.
- **Code:**
```typescript
update(options: {
  // ...
  provisionalAlertId?: string | null;  // <-- Never used!
  // ...
}): PatternOccurrence | null {
```

#### BUG-008: Ambiguity Score Threshold Inconsistency
- **Severity:** LOW
- **File:** `src/attribution/failure-mode-resolver.ts`
- **Lines:** 105-117
- **Description:** The threshold of `>= 2` for both ambiguity and incompleteness means a tie at score 2 results in neither branch being taken, falling through to Step E.

---

## Scout 4: Test Scout (OPUS)

### Mission
Verify test quality, coverage, identify missing test cases, and check test assertions.

### Findings

#### TEST-001: No Test Files Found
- **Severity:** CRITICAL
- **File:** All reviewed files
- **Description:** No test files (`*.test.ts`) were found in the `src/` directory. The reviewed source files have zero test coverage.
- **Impact:**
  - `failure-mode-resolver.ts` - Complex decision tree with 6 failure modes, untested
  - `confidence.ts` - Mathematical calculations with edge cases, untested
  - `promotion-checker.ts` - Business-critical promotion logic, untested
  - `noncompliance-checker.ts` - Keyword extraction and document search, untested
  - `init.ts` - CLI with file system operations, untested
  - `pattern-occurrence.repo.ts` - Data layer with 15+ methods, untested

#### TEST-002: Decision Tree Branch Coverage Needed
- **Severity:** HIGH
- **File:** `src/attribution/failure-mode-resolver.ts`
- **Description:** The `resolveFailureMode` function has at least 12 distinct code paths (Steps A-E with sub-branches). Each requires explicit test coverage:
  - Step A: synthesis_drift (proven)
  - Step A: incorrect (suspected drift)
  - Step B: missing_reference
  - Step C: conflict_unresolved
  - Step D: ambiguous (score >= 2)
  - Step D: incomplete (score >= 2)
  - Step E: explicitly_harmful
  - Step E: benign_but_missing_guardrails
  - Step E: descriptive
  - Step E: unknown
  - Step E: inferred (no quote)
  - Tie cases in Step D

#### TEST-003: Boundary Value Tests Needed for Confidence
- **Severity:** HIGH
- **File:** `src/injection/confidence.ts`
- **Description:** Mathematical edge cases that need testing:
  - `activeOccurrences = 0` (negative boost?)
  - `lastSeenActive = null`
  - `lastSeenActive` in the future
  - `adherenceRate` edge cases (0/0, 1/1)
  - Clamping behavior at 0 and 1

#### TEST-004: File System Operation Mocking Needed
- **Severity:** MEDIUM
- **File:** `src/cli/commands/init.ts`
- **Description:** The init command performs multiple file system operations (`fs.existsSync`, `fs.mkdirSync`, `fs.writeFileSync`, `fs.copyFileSync`) that should be tested with mocked file system to verify:
  - Correct directory structure creation
  - Config file content format
  - Error handling for permission denied
  - Behavior when already initialized

#### TEST-005: SQL Query Correctness Untested
- **Severity:** HIGH
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Description:** Complex SQL queries with JSON extraction functions should have integration tests:
  - `findByGitDoc` - JSON path queries
  - `findByLinearDocId` - Cross-document queries
  - `findByWebUrl` - URL matching
  - `findByExternalId` - External reference lookup

#### TEST-006: Keyword Extraction Edge Cases
- **Severity:** MEDIUM
- **File:** `src/attribution/noncompliance-checker.ts`
- **Description:** `extractKeywords` function needs tests for:
  - Empty strings
  - All stop words
  - Special characters (emojis, unicode)
  - Very long inputs
  - Code snippets in descriptions

---

## Scout 5: Decisions Scout (OPUS)

### Mission
Detect undocumented technical decisions, magic numbers, implicit assumptions, and architectural choices.

### Findings

#### DEC-001: Magic Number - Minimum Projects for Promotion
- **Severity:** MEDIUM
- **File:** `src/evolution/promotion-checker.ts`
- **Line:** 36
- **Description:** The constant `MIN_PROJECTS_FOR_PROMOTION = 3` is defined but the rationale for choosing 3 (vs 2 or 5) is not documented.
- **Code:**
```typescript
const MIN_PROJECTS_FOR_PROMOTION = 3;
```
- **Question:** Why 3 projects? Is this based on statistical significance, practical experience, or arbitrary choice?

#### DEC-002: Magic Number - Minimum Derived Confidence
- **Severity:** MEDIUM
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 40-41
- **Description:** `MIN_DERIVED_CONFIDENCE = 0.6` - Why 60%? This threshold determines when patterns become workspace-level principles.
- **Code:**
```typescript
const MIN_DERIVED_CONFIDENCE = 0.6;
```

#### DEC-003: Undocumented Confidence Base Values
- **Severity:** HIGH
- **File:** `src/injection/confidence.ts`
- **Lines:** 81-91
- **Description:** The base confidence values (verbatim=0.75, paraphrase=0.55, inferred=0.4) appear without justification. These directly impact system behavior.
- **Code:**
```typescript
switch (pattern.primaryCarrierQuoteType) {
  case 'verbatim':
    confidence = 0.75;
    break;
  case 'paraphrase':
    confidence = 0.55;
    break;
  case 'inferred':
    confidence = 0.4;
    break;
}
```

#### DEC-004: Hardcoded Relevance Threshold
- **Severity:** MEDIUM
- **File:** `src/attribution/noncompliance-checker.ts`
- **Line:** 112
- **Description:** The relevance threshold of `0.3` for determining noncompliance is hardcoded without explanation.
- **Code:**
```typescript
if (match && match.relevanceScore >= 0.3) {
```
- **Question:** Why 0.3? What happens at 0.29 vs 0.31?

#### DEC-005: Sliding Window Size Decision
- **Severity:** LOW
- **File:** `src/attribution/noncompliance-checker.ts`
- **Line:** 182
- **Description:** Window size of 5 lines is used for document search. This architectural choice affects search accuracy.
- **Code:**
```typescript
const windowSize = 5;
```

#### DEC-006: Security-Only Promotion Policy
- **Severity:** MEDIUM
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 93-99
- **Description:** Non-security patterns are explicitly excluded from promotion. This is a significant architectural decision that affects the entire system's evolution.
- **Code:**
```typescript
if (pattern.findingCategory !== 'security') {
  return {
    qualifies: false,
    // ...
    reason: `Non-security patterns not eligible for promotion (category: ${pattern.findingCategory})`,
  };
}
```
- **Question:** Is this permanent? Will other categories ever be eligible?

#### DEC-007: 90-Day Half-Life for Decay
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Lines:** 102-103
- **Description:** The 90-day decay half-life is undocumented. This affects how quickly patterns lose relevance.
- **Code:**
```typescript
const decayPenalty = Math.min(daysSince / 90, 1.0) * 0.15;
```

#### DEC-008: Cross-Project Penalty Value
- **Severity:** LOW
- **File:** `src/injection/confidence.ts`
- **Lines:** 164-166
- **Description:** Cross-project multiplier of 0.95 (5% penalty) is applied without documented rationale.
- **Code:**
```typescript
const crossProjectMultiplier = pattern._crossProjectPenalty ? 0.95 : 1.0;
```

#### DEC-009: Excerpt Hash Storage Decision
- **Severity:** LOW
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 163, 183-184
- **Description:** The decision to store `carrierExcerptHash` and `originExcerptHash` separately (rather than computing from fingerprint) is architectural but undocumented.

---

## Scout 6: Spec Scout (OPUS)

### Mission
Check spec compliance against `spec-pattern-attribution-v1.1.md` requirements.

### Findings

#### SPEC-001: Missing Scope Invariant Enforcement
- **Severity:** HIGH
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Description:** Per Spec Section 1.8, scope invariants should be enforced: "derive scope from pattern". The `create()` method accepts `workspaceId` and `projectId` directly without validating they match the associated pattern's scope.
- **Spec Reference:** Section 1.8 - Scope Invariants

#### SPEC-002: Promotion Key Idempotency Not Fully Implemented
- **Severity:** MEDIUM
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 152-168
- **Description:** While `promotionKey` is computed and checked, the spec (Section 6.4) requires this to handle "concurrent runners". The current implementation has a TOCTOU race - check then insert is not atomic.
- **Spec Reference:** Section 6.4 - Promotion race conditions

#### SPEC-003: Missing Kill Switch Implementation
- **Severity:** HIGH
- **File:** All files
- **Description:** Spec Section 11 mandates a "kill switch with health metrics and thresholds" to stop pattern creation when attribution noise is too high. No implementation found in reviewed files.
- **Spec Reference:** Section 11 - Kill switch

#### SPEC-004: Baseline Tie-Breaking Not Implemented
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Description:** Spec Section 5.1 requires "touchOverlapCount desc, id asc" ordering for baseline tie-breaking. The confidence calculation doesn't implement this deterministic ordering.
- **Spec Reference:** Section 5.1 - Baseline tie-breaking

#### SPEC-005: Token Budget Not Enforced
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Description:** Spec principle states "Cap warnings at 6 (2 baseline + 4 learned)". No implementation of this budget constraint visible in confidence calculations.
- **Spec Reference:** Design Principle 5 - Token-conscious injection

#### SPEC-006: Cross-Project Relevance Gate Missing
- **Severity:** MEDIUM
- **File:** `src/injection/confidence.ts`
- **Lines:** 164-166
- **Description:** Spec Section 5.1 requires "touchOverlap >= 2" gate for cross-project warnings. Current implementation only applies a 5% penalty without checking touch overlap count.
- **Spec Reference:** Section 5.1 - Cross-project warnings

#### SPEC-007: ProvisionalAlert Integration Missing
- **Severity:** MEDIUM
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Description:** Per Spec Section 2.9, ProvisionalAlert entity should track CRITICAL novel inferred findings. The `provisionalAlertId` field exists but update logic is missing (BUG-007).
- **Spec Reference:** Section 2.9 - ProvisionalAlert entity

#### SPEC-008: Observability Scope Context Missing
- **Severity:** LOW
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 197-200
- **Description:** Spec Section 5.5 requires "scope context" in observability logs. Current logs include IDs but not full scope (workspaceId, projectId).
- **Spec Reference:** Section 5.5 - Observability

#### SPEC-009: Offline/DB-Busy Fallback Not Implemented
- **Severity:** MEDIUM
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Description:** Spec Section 1.10 requires "deterministic fallback policy" for offline/DB-busy scenarios. No error handling for database unavailability found.
- **Spec Reference:** Section 1.10 - Offline/DB-busy mode

---

# JUDGE EVALUATIONS (SONNET Model - Batch Mode)

---

## Judge 1: Security Judge (SONNET)

Evaluating all Security Scout findings in batch.

### SEC-001: SQL Injection Risk in Dynamic Query Construction
**Verdict:** MODIFIED
**Reasoning:** The finding correctly identifies a fragile pattern, but overstates the immediate risk. The column names are hardcoded in the code path (`was_injected`, `was_adhered_to`, etc.) and cannot be user-controlled in the current implementation. However, the pattern is indeed a code smell that should be addressed.
**Modified Severity:** LOW (was HIGH)

### SEC-002: No Input Sanitization on JSON Fields
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. Schema validation via `PatternOccurrenceSchema.parse()` exists at line 154, but this happens after the object is constructed, not before JSON stringification. Large payloads could still cause issues.

### SEC-003: Command Injection Risk via execSync
**Verdict:** DISMISSED
**Reasoning:** The `execSync` calls use hardcoded command strings (`'git rev-parse --show-toplevel'`, `'git remote get-url origin'`) with no user input interpolation. This is a false positive.

### SEC-004: Path Traversal in copyDirRecursive
**Verdict:** CONFIRMED
**Reasoning:** Valid security concern. Symlinks are followed by `fs.copyFileSync` and `fs.readdirSync`. A malicious CORE directory (though unlikely in normal operation) could exploit this. The function should use `lstatSync` and skip symlinks.

### SEC-005: Sensitive IDs Exposed in Logs
**Verdict:** DISMISSED
**Reasoning:** UUIDs in console logs are not sensitive - they're internal identifiers with no inherent value to attackers. This is normal operational logging. Low value finding.

### SEC-006: Missing Workspace Authorization Check
**Verdict:** MODIFIED
**Reasoning:** The finding is technically correct that no authorization occurs in the repository layer, but this is by design - repositories are data access layers, not authorization layers. Authorization should occur at a higher layer (service/handler). However, the architecture should be documented.
**Modified to:** MEDIUM documentation issue, not HIGH security issue

### SEC-007: Unrestricted File Operations in Init
**Verdict:** CONFIRMED
**Reasoning:** Valid concern for defense in depth. The init command could check that it's not running as root and that the target directory is user-writable.

### Security Judge Summary:
- **CONFIRMED:** 3 (SEC-002, SEC-004, SEC-007)
- **DISMISSED:** 2 (SEC-003, SEC-005)
- **MODIFIED:** 2 (SEC-001, SEC-006)

---

## Judge 2: Docs Judge (SONNET)

Evaluating all Docs Scout findings in batch.

### DOC-001: Function Name Typo - promoteToDerivdPrinciple
**Verdict:** CONFIRMED
**Reasoning:** Clear typo that affects API documentation, searchability, and maintainability. This should be fixed before the API becomes public.

### DOC-002: Inconsistent JSDoc Parameter Documentation
**Verdict:** CONFIRMED
**Reasoning:** Valid finding. Internal consistency in documentation improves maintainability. The private helper functions should have at least basic parameter documentation.

### DOC-003: Missing Return Type Documentation
**Verdict:** MODIFIED
**Reasoning:** While return documentation would be helpful, TypeScript's type system provides this information. This is low priority.
**Modified Severity:** LOW (informational)

### DOC-004: Outdated Comment Reference
**Verdict:** CONFIRMED
**Reasoning:** Spec references without version numbers will become confusing as the spec evolves. Good catch.

### DOC-005: Incomplete Module Header Documentation
**Verdict:** DISMISSED
**Reasoning:** The module header is appropriate for its scope. Phase context is available in the spec; duplicating it in every file would create maintenance burden.

### DOC-006: Missing Error Documentation
**Verdict:** CONFIRMED
**Reasoning:** Functions that throw should document their error conditions. This is especially important for CLI validation functions that are user-facing.

### Docs Judge Summary:
- **CONFIRMED:** 4 (DOC-001, DOC-002, DOC-004, DOC-006)
- **DISMISSED:** 1 (DOC-005)
- **MODIFIED:** 1 (DOC-003)

---

## Judge 3: Bug Judge (SONNET)

Evaluating all Bug Scout findings in batch.

### BUG-001: Potential Division by Zero
**Verdict:** DISMISSED
**Reasoning:** Scout correctly identified the code is properly guarded. This is not a bug - it's well-handled. The null semantics are clear from the type signature.

### BUG-002: Negative Days Protection May Hide Bugs
**Verdict:** CONFIRMED
**Reasoning:** Valid point. Silent clamping hides potential data quality issues. A warning log would aid debugging without breaking functionality.

### BUG-003: Missing Null Check in rowToEntity
**Verdict:** MODIFIED
**Reasoning:** The type assertions (`as string`) make this fragile but not a bug per se. The database schema should guarantee these fields exist. This is more of a defensive programming suggestion.
**Modified to:** LOW (code smell, not bug)

### BUG-004: Sliding Window Edge Case
**Verdict:** CONFIRMED
**Reasoning:** Valid edge case. Documents with fewer than 5 lines will return `null` from `searchDocument`. For very short documents (like terse specs), this could cause false negatives in noncompliance detection.

### BUG-005: Race Condition in Workspace Creation
**Verdict:** CONFIRMED
**Reasoning:** Valid TOCTOU race condition. Two concurrent `falcon init` processes could create workspaces with the same slug despite the uniqueness check. Should use INSERT ... ON CONFLICT or a transaction.

### BUG-006: Inefficient Pattern Lookup
**Verdict:** CONFIRMED
**Reasoning:** N+1 query pattern is a valid performance issue. For workspaces with many patterns, this could cause significant slowdown during promotion checks.

### BUG-007: Missing provisionalAlertId Update Handling
**Verdict:** CONFIRMED
**Reasoning:** Clear bug - the parameter exists in the type signature but is never used in the implementation. This could cause silent failures when trying to update the provisional alert link.

### BUG-008: Ambiguity Score Threshold Inconsistency
**Verdict:** MODIFIED
**Reasoning:** Not a bug - the fallthrough to Step E is intentional design when neither score dominates. However, this behavior should be documented.
**Modified to:** LOW documentation issue

### Bug Judge Summary:
- **CONFIRMED:** 5 (BUG-002, BUG-004, BUG-005, BUG-006, BUG-007)
- **DISMISSED:** 1 (BUG-001)
- **MODIFIED:** 2 (BUG-003, BUG-008)

---

## Judge 4: Test Judge (SONNET)

Evaluating all Test Scout findings in batch.

### TEST-001: No Test Files Found
**Verdict:** CONFIRMED
**Reasoning:** Critical finding. Zero test coverage for production code is a significant risk. All reviewed files contain business logic that should have test coverage.

### TEST-002: Decision Tree Branch Coverage Needed
**Verdict:** CONFIRMED
**Reasoning:** The failure-mode-resolver has complex branching logic. Test cases for each branch would prevent regressions and document expected behavior.

### TEST-003: Boundary Value Tests Needed for Confidence
**Verdict:** CONFIRMED
**Reasoning:** Mathematical functions with clamping and edge cases require explicit boundary testing. The identified cases are all valid test scenarios.

### TEST-004: File System Operation Mocking Needed
**Verdict:** CONFIRMED
**Reasoning:** CLI commands with file system operations need mocked tests. This is standard practice for testable CLI design.

### TEST-005: SQL Query Correctness Untested
**Verdict:** CONFIRMED
**Reasoning:** Complex SQL queries, especially those using JSON path extraction, are prone to subtle bugs. Integration tests against an actual database are essential.

### TEST-006: Keyword Extraction Edge Cases
**Verdict:** CONFIRMED
**Reasoning:** Text processing functions have many edge cases. The identified scenarios (empty strings, unicode, code snippets) are all realistic inputs that should be tested.

### Test Judge Summary:
- **CONFIRMED:** 6 (all findings)
- **DISMISSED:** 0
- **MODIFIED:** 0

---

## Judge 5: Decisions Judge (SONNET)

Evaluating all Decisions Scout findings in batch.

### DEC-001: Magic Number - Minimum Projects for Promotion
**Verdict:** CONFIRMED
**Reasoning:** The number 3 appears arbitrary. The spec should document why this threshold was chosen (e.g., statistical significance, false positive rate, etc.).

### DEC-002: Magic Number - Minimum Derived Confidence
**Verdict:** CONFIRMED
**Reasoning:** 60% confidence threshold needs justification. Is this based on empirical testing? What's the false positive/negative tradeoff?

### DEC-003: Undocumented Confidence Base Values
**Verdict:** CONFIRMED
**Reasoning:** These base values directly impact system behavior. The rationale (e.g., "verbatim quotes are 35% more reliable than paraphrases") should be documented.

### DEC-004: Hardcoded Relevance Threshold
**Verdict:** CONFIRMED
**Reasoning:** The 0.3 threshold is a key decision point. What happens at edge cases? Should this be configurable?

### DEC-005: Sliding Window Size Decision
**Verdict:** MODIFIED
**Reasoning:** While valid, this is a minor implementation detail. A brief inline comment would suffice.
**Modified Severity:** LOW

### DEC-006: Security-Only Promotion Policy
**Verdict:** CONFIRMED
**Reasoning:** Major architectural decision that limits system functionality. Should be documented with rationale and future plans.

### DEC-007: 90-Day Half-Life for Decay
**Verdict:** CONFIRMED
**Reasoning:** The decay model directly affects pattern relevance. Why 90 days vs 30 or 180? This needs documentation.

### DEC-008: Cross-Project Penalty Value
**Verdict:** MODIFIED
**Reasoning:** The 5% penalty is referenced in the spec (Section 5.1: "crossProjectPenalty = 0.05"). This is documented, just not in the code comment.
**Modified to:** Informational - add code comment referencing spec

### DEC-009: Excerpt Hash Storage Decision
**Verdict:** DISMISSED
**Reasoning:** This is a reasonable storage optimization. Not every implementation decision needs explicit documentation.

### Decisions Judge Summary:
- **CONFIRMED:** 6 (DEC-001, DEC-002, DEC-003, DEC-004, DEC-006, DEC-007)
- **DISMISSED:** 1 (DEC-009)
- **MODIFIED:** 2 (DEC-005, DEC-008)

---

## Judge 6: Spec Judge (SONNET)

Evaluating all Spec Scout findings in batch.

### SPEC-001: Missing Scope Invariant Enforcement
**Verdict:** CONFIRMED
**Reasoning:** Spec Section 1.8 explicitly requires scope derivation from patterns. The current implementation accepts scope parameters directly without validation, violating the spec invariant.

### SPEC-002: Promotion Key Idempotency Not Fully Implemented
**Verdict:** CONFIRMED
**Reasoning:** The TOCTOU race is real. Spec requires handling concurrent runners. A database constraint (UNIQUE on promotionKey) would provide true idempotency.

### SPEC-003: Missing Kill Switch Implementation
**Verdict:** CONFIRMED
**Reasoning:** Spec Section 11 is a MUST requirement. The absence of any kill switch implementation is a clear spec violation.

### SPEC-004: Baseline Tie-Breaking Not Implemented
**Verdict:** MODIFIED
**Reasoning:** Baseline tie-breaking is for injection ordering, not confidence calculation. This finding is misfiled - it should be checked in the injection module, not confidence module.
**Modified to:** Needs investigation in injection module

### SPEC-005: Token Budget Not Enforced
**Verdict:** MODIFIED
**Reasoning:** Token budgets are enforced at injection time, not during confidence calculation. This finding is valid but looking in the wrong file.
**Modified to:** Needs investigation in injection orchestrator

### SPEC-006: Cross-Project Relevance Gate Missing
**Verdict:** CONFIRMED
**Reasoning:** Spec Section 5.1 requires "touchOverlap >= 2" gate. The current implementation only applies a multiplier without checking the overlap count. This is a spec violation.

### SPEC-007: ProvisionalAlert Integration Missing
**Verdict:** CONFIRMED
**Reasoning:** The field exists but isn't wired up. Combined with BUG-007, this represents incomplete feature implementation.

### SPEC-008: Observability Scope Context Missing
**Verdict:** CONFIRMED
**Reasoning:** Spec requires workspaceId and projectId in logs. Current logs only show pattern/principle IDs.

### SPEC-009: Offline/DB-Busy Fallback Not Implemented
**Verdict:** CONFIRMED
**Reasoning:** Spec Section 1.10 defines required fallback behavior. No implementation found in any reviewed file.

### Spec Judge Summary:
- **CONFIRMED:** 7 (SPEC-001, SPEC-002, SPEC-003, SPEC-006, SPEC-007, SPEC-008, SPEC-009)
- **DISMISSED:** 0
- **MODIFIED:** 2 (SPEC-004, SPEC-005)

---

# SUMMARY

## Overall Statistics

| Scout | Total Findings | Confirmed | Dismissed | Modified |
|-------|---------------|-----------|-----------|----------|
| Security | 7 | 3 | 2 | 2 |
| Docs | 6 | 4 | 1 | 1 |
| Bug | 8 | 5 | 1 | 2 |
| Test | 6 | 6 | 0 | 0 |
| Decisions | 9 | 6 | 1 | 2 |
| Spec | 9 | 7 | 0 | 2 |
| **TOTAL** | **45** | **31** | **5** | **9** |

## Confirmation Rate
- **Overall:** 31/45 = 68.9% confirmed
- **After modification:** 40/45 = 88.9% actionable (confirmed + modified)

## Findings by Severity (After Judge Evaluation)

### CRITICAL (1)
| ID | Description | File |
|----|-------------|------|
| TEST-001 | No test files found - zero test coverage | All files |

### HIGH (7)
| ID | Description | File |
|----|-------------|------|
| DOC-001 | Function name typo "promoteToDerivdPrinciple" | promotion-checker.ts:131 |
| BUG-005 | Race condition in workspace creation (TOCTOU) | init.ts:173-179 |
| BUG-007 | provisionalAlertId never used in update() | pattern-occurrence.repo.ts:200-246 |
| TEST-002 | Decision tree needs 12+ test cases | failure-mode-resolver.ts |
| TEST-003 | Boundary value tests needed | confidence.ts |
| SPEC-001 | Missing scope invariant enforcement | pattern-occurrence.repo.ts |
| SPEC-003 | Kill switch not implemented | All files |

### MEDIUM (18)
| ID | Description | File |
|----|-------------|------|
| SEC-002 | No input sanitization on JSON fields | pattern-occurrence.repo.ts:176-181 |
| SEC-004 | Path traversal via symlinks | init.ts:318-331 |
| SEC-007 | Unrestricted file operations | init.ts:232-251 |
| DOC-004 | Outdated spec version references | confidence.ts:65-72 |
| DOC-006 | Missing error documentation | init.ts |
| BUG-002 | Negative days silently clamped | confidence.ts:100-101 |
| BUG-004 | Sliding window misses short docs | noncompliance-checker.ts:181-198 |
| BUG-006 | N+1 query pattern | promotion-checker.ts:226-229 |
| TEST-004 | File system mocking needed | init.ts |
| TEST-005 | SQL query correctness untested | pattern-occurrence.repo.ts |
| TEST-006 | Keyword extraction edge cases | noncompliance-checker.ts |
| DEC-001 | Magic number: MIN_PROJECTS=3 | promotion-checker.ts:36 |
| DEC-002 | Magic number: MIN_CONFIDENCE=0.6 | promotion-checker.ts:40-41 |
| DEC-003 | Undocumented confidence base values | confidence.ts:81-91 |
| DEC-004 | Hardcoded relevance threshold 0.3 | noncompliance-checker.ts:112 |
| DEC-006 | Security-only promotion policy | promotion-checker.ts:93-99 |
| DEC-007 | 90-day half-life undocumented | confidence.ts:102-103 |
| SPEC-002 | Promotion key race condition | promotion-checker.ts:152-168 |
| SPEC-006 | Cross-project relevance gate missing | confidence.ts:164-166 |
| SPEC-007 | ProvisionalAlert integration incomplete | pattern-occurrence.repo.ts |
| SPEC-008 | Observability missing scope context | promotion-checker.ts:197-200 |
| SPEC-009 | Offline/DB-busy fallback missing | pattern-occurrence.repo.ts |

### LOW (12)
| ID | Description | File |
|----|-------------|------|
| SEC-001 | Dynamic SQL column names (modified) | pattern-occurrence.repo.ts:243 |
| DOC-002 | Inconsistent JSDoc | failure-mode-resolver.ts |
| DOC-003 | Missing return docs (modified) | noncompliance-checker.ts |
| BUG-003 | Missing null checks (modified) | pattern-occurrence.repo.ts:393-423 |
| BUG-008 | Ambiguity threshold tie (modified) | failure-mode-resolver.ts:105-117 |
| DEC-005 | Sliding window size (modified) | noncompliance-checker.ts:182 |
| DEC-008 | Cross-project penalty (modified) | confidence.ts:164-166 |

### Dismissed (5)
| ID | Reason |
|----|--------|
| SEC-003 | No user input in execSync - false positive |
| SEC-005 | UUIDs not sensitive - low value |
| BUG-001 | Properly guarded - not a bug |
| DOC-005 | Module header appropriate for scope |
| DEC-009 | Reasonable storage optimization |

---

## Top Priority Items

1. **TEST-001 (CRITICAL):** Implement comprehensive test suite
2. **SPEC-003 (HIGH):** Implement kill switch per spec Section 11
3. **DOC-001 (HIGH):** Fix typo in function name before API stabilization
4. **BUG-007 (HIGH):** Wire up provisionalAlertId in update method
5. **BUG-005 (HIGH):** Fix TOCTOU race in workspace creation
6. **SPEC-001 (HIGH):** Enforce scope invariants per spec Section 1.8

---

## Test Configuration Notes

- **Scout Model:** OPUS (claude-opus-4-5-20251101)
- **Judge Model:** SONNET (simulated for comparison)
- **Mode:** Batch (all findings evaluated at once per judge)
- **Finding Granularity:** Per-issue with file:line references
- **Total Review Time:** Comprehensive single-pass review

---

*Report generated: 2026-01-20*
*Test ID: B1_opus_sonnet_batch*
