# PR Review Model Comparison Test B2

**Configuration:** Scouts: OPUS, Judges: OPUS (Batch mode - all findings at once)
**Branch:** `security-review/full-codebase-audit-2026-01-20`
**PR:** #6
**Date:** 2026-01-20
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

## 1. SECURITY SCOUT REPORT

### Finding SEC-001
**Severity:** HIGH
**File:** `src/cli/commands/init.ts`
**Line:** 298
**Title:** Command Injection via execSync without Input Sanitization

**Description:**
The `findGitRoot()` function at line 298 uses `execSync('git rev-parse --show-toplevel')` which is called without any input from the user, but the pattern establishes a precedent. More critically, the `getGitRemoteOrigin()` function at line 306 returns user-controllable data (remote URL) that flows into database operations without parameterized query validation on the URL format beyond canonicalization.

**Evidence:**
```typescript
function getGitRemoteOrigin(): string | null {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}
```

**Recommendation:** While the execSync calls themselves are safe (no user input), audit that all downstream uses of returned values are properly sanitized.

---

### Finding SEC-002
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** 122-132
**Title:** SQL Query with String Interpolation Pattern Risk

**Description:**
The SQL query at lines 122-132 uses parameterized queries correctly, but the pattern `(p.repo_subdir IS NULL AND ? IS NULL)` with a nullable parameter could behave unexpectedly in edge cases.

**Evidence:**
```typescript
const existingProject = db
  .prepare(
    `
  SELECT p.*, w.slug as workspace_slug, w.name as workspace_name
  FROM projects p
  JOIN workspaces w ON p.workspace_id = w.id
  WHERE p.repo_origin_url = ? AND (p.repo_subdir = ? OR (p.repo_subdir IS NULL AND ? IS NULL))
`
  )
  .get(canonicalUrl, repoSubdir, repoSubdir) as ExistingProject | undefined;
```

**Recommendation:** This is correctly parameterized. The pattern is safe but complex - consider simplifying with COALESCE or IS NOT DISTINCT FROM if SQLite supports it.

---

### Finding SEC-003
**Severity:** HIGH
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 243
**Title:** Dynamic SQL Construction with String Interpolation

**Description:**
The `update()` method at line 243 constructs SQL dynamically using template literals with `updates.join(', ')`. While the column names are hardcoded (not user input), this pattern is fragile and could become vulnerable if extended carelessly.

**Evidence:**
```typescript
this.db.prepare(`UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?`).run(...params);
```

**Recommendation:** The current implementation is safe since `updates` array contains only hardcoded strings. However, add a code comment explicitly noting this assumption to prevent future vulnerabilities.

---

### Finding SEC-004
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** 318-331
**Title:** Path Traversal Risk in copyDirRecursive

**Description:**
The `copyDirRecursive()` function at lines 318-331 copies files without validating that the destination stays within expected boundaries. If `entry.name` contains path traversal sequences (e.g., `../`), it could write files outside the intended directory.

**Evidence:**
```typescript
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    // No validation that destPath is within dest
```

**Recommendation:** Add validation that `destPath` resolves within `dest` using `path.resolve()` and checking that it starts with the resolved dest path.

---

### Finding SEC-005
**Severity:** LOW
**File:** `src/cli/commands/init.ts`
**Lines:** 40-49
**Title:** Input Validation is Present but Incomplete

**Description:**
The `validateInput()` function validates against empty values, length, and null bytes, which is good. However, it does not validate against other control characters or Unicode normalization issues that could cause problems in file paths or database queries.

**Evidence:**
```typescript
function validateInput(value: string, fieldName: string): void {
  if (!value || value.trim() === '') {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (value.length > 255) {
    throw new Error(`${fieldName} must be 255 characters or fewer`);
  }
  if (value.includes('\0')) {
    throw new Error(`${fieldName} cannot contain null bytes`);
  }
}
```

**Recommendation:** Consider adding validation for other control characters (0x01-0x1F, 0x7F) and potentially normalizing Unicode (NFC/NFD).

---

### Finding SEC-006
**Severity:** MEDIUM
**File:** `src/attribution/noncompliance-checker.ts`
**Lines:** 141-164
**Title:** Regex-based Text Processing Could Be Exploited via ReDoS

**Description:**
The `extractKeywords()` function at lines 141-164 uses simple regex patterns that appear safe, but the overall pattern of processing arbitrary user text (finding title and description) without length limits could lead to performance issues.

**Evidence:**
```typescript
export function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  // ... regex processing
  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
```

**Recommendation:** Add length limits on input strings before processing to prevent resource exhaustion.

---

### Finding SEC-007
**Severity:** CRITICAL
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 263-287
**Title:** JSON Extraction in SQL Queries Without Schema Validation

**Description:**
Multiple queries use `json_extract()` on stored JSON fields (lines 263-287, 295-321, etc.). If an attacker could inject malformed JSON into `carrier_fingerprint` or `origin_fingerprint`, it could cause query failures or unexpected behavior. There is no validation that the JSON structure matches expected schema before storage.

**Evidence:**
```typescript
`
SELECT * FROM pattern_occurrences
WHERE workspace_id = ?
  AND status = ?
  AND (
    (json_extract(carrier_fingerprint, '$.kind') = 'git'
     AND json_extract(carrier_fingerprint, '$.repo') = ?
     AND json_extract(carrier_fingerprint, '$.path') = ?)
```

**Recommendation:** Ensure Zod schema validation occurs before any JSON is stored (currently relies on PatternOccurrenceSchema.parse() which should include nested validation). Verify the schema validates all nested JSON fields.

---

## 2. DOCS SCOUT REPORT

### Finding DOC-001
**Severity:** LOW
**File:** `src/evolution/promotion-checker.ts`
**Line:** 131
**Title:** Typo in Function Name: promoteToDerivdPrinciple

**Description:**
The function `promoteToDerivdPrinciple` at line 131 has a typo - it should be `promoteToDerivEdPrinciple` (missing 'e').

**Evidence:**
```typescript
export function promoteToDerivdPrinciple(
  db: Database,
  pattern: PatternDefinition,
  options?: { force?: boolean }
): PromotionResult {
```

**Recommendation:** Rename to `promoteToDerivEdPrinciple` for correctness and searchability.

---

### Finding DOC-002
**Severity:** LOW
**File:** `src/injection/confidence.ts`
**Lines:** 64-72
**Title:** Formula Documentation References Missing Spec Version

**Description:**
The comment at lines 64-72 references "Spec Section 4.1" but does not specify which spec version. This could become ambiguous as specs evolve.

**Evidence:**
```typescript
/**
 * Compute attribution confidence for a pattern.
 * See Spec Section 4.1.
```

**Recommendation:** Include the spec version and/or a link to the spec document (e.g., "See spec-pattern-attribution-v1.1.md Section 4.1").

---

### Finding DOC-003
**Severity:** MEDIUM
**File:** `src/attribution/failure-mode-resolver.ts`
**Lines:** 1-14
**Title:** Decision Tree Documentation Should Include Mermaid Diagram

**Description:**
The file header describes a decision tree with steps A-E, but the documentation would benefit from a visual representation (Mermaid diagram) to aid understanding.

**Evidence:**
```typescript
/**
 * Decision Tree Steps:
 * A: Check for synthesis drift (source disagrees with carrier)
 * B: Check for missing mandatory document reference
 * C: Check for unresolved conflicts between documents
 * D: Ambiguity vs Incompleteness scoring
 * E: Default based on carrierInstructionKind
 */
```

**Recommendation:** Add a Mermaid flowchart in the JSDoc or link to external documentation.

---

### Finding DOC-004
**Severity:** LOW
**File:** `src/cli/commands/init.ts`
**Lines:** 1-6
**Title:** Missing Example Usage in Module Documentation

**Description:**
The module documentation does not include example usage or CLI invocation patterns.

**Evidence:**
```typescript
/**
 * falcon init command.
 *
 * Initializes a project in the current directory.
 * Creates .falcon/config.yaml with workspace and project IDs.
 */
```

**Recommendation:** Add example usage: `falcon init`, `falcon init -w existing-workspace`, `falcon init -n "Custom Name"`.

---

### Finding DOC-005
**Severity:** MEDIUM
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 248-251
**Title:** Phase 5 Methods Lack Implementation Status Documentation

**Description:**
The Phase 5 document change detection methods (lines 248-388) are documented as part of Phase 5 but there is no indication of implementation status or whether they are tested/production-ready.

**Evidence:**
```typescript
// ============================================
// PHASE 5: Document change detection methods
// ============================================
```

**Recommendation:** Add status annotations (e.g., `@status implemented`, `@status tested`) to indicate readiness.

---

## 3. BUG SCOUT REPORT

### Finding BUG-001
**Severity:** HIGH
**File:** `src/evolution/promotion-checker.ts`
**Lines:** 227-229
**Title:** N+1 Query Problem in findMatchingPatternsAcrossProjects

**Description:**
The function at lines 212-229 first fetches all rows, then calls `patternRepo.findById()` for each row. This is an N+1 query pattern that will cause performance issues at scale.

**Evidence:**
```typescript
function findMatchingPatternsAcrossProjects(
  db: Database,
  workspaceId: string,
  patternKey: string
): PatternDefinition[] {
  const rows = db
    .prepare(...)
    .all(workspaceId, patternKey) as Array<Record<string, unknown>>;

  // N+1: for each row, makes another query
  const patternRepo = new PatternDefinitionRepository(db);
  return rows.map((row) => patternRepo.findById(row.id as string)!);
}
```

**Recommendation:** Either select all needed fields in the initial query and map directly, or use a batch findByIds method.

---

### Finding BUG-002
**Severity:** MEDIUM
**File:** `src/evolution/promotion-checker.ts`
**Line:** 228
**Title:** Non-null Assertion on Potentially Null Result

**Description:**
Line 228 uses non-null assertion (`!`) on `findById()` result which could return null if the pattern was deleted between queries.

**Evidence:**
```typescript
return rows.map((row) => patternRepo.findById(row.id as string)!);
```

**Recommendation:** Filter out null results or throw an explicit error for the race condition.

---

### Finding BUG-003
**Severity:** MEDIUM
**File:** `src/attribution/noncompliance-checker.ts`
**Lines:** 183-197
**Title:** Off-by-One Edge Case in Sliding Window Search

**Description:**
The sliding window at lines 183-197 only searches if `lines.length >= windowSize`. Documents with fewer than 5 lines will never be searched, even if they contain relevant keywords.

**Evidence:**
```typescript
const windowSize = 5;
for (let i = 0; i <= lines.length - windowSize; i++) {
  // Documents with < 5 lines are never searched
```

**Recommendation:** Handle short documents by adjusting window size dynamically: `const effectiveWindowSize = Math.min(windowSize, lines.length)`.

---

### Finding BUG-004
**Severity:** LOW
**File:** `src/injection/confidence.ts`
**Lines:** 192-197
**Title:** daysSinceDate Returns Negative Values for Future Dates

**Description:**
The `daysSinceDate()` function at lines 192-197 can return negative values if `isoDate` is in the future (e.g., due to clock skew or timezone issues). This is partially mitigated at line 101 with `Math.max(0, ...)` but only in one call site.

**Evidence:**
```typescript
export function daysSinceDate(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
```

**Recommendation:** Either clamp to 0 within the function itself, or ensure all callers handle negative values.

---

### Finding BUG-005
**Severity:** HIGH
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 200-246
**Title:** Update Method Does Not Handle provisionalAlertId in Updates Array

**Description:**
The `update()` method accepts `provisionalAlertId` in options (line 204) but never adds it to the updates array or params. This field silently gets ignored.

**Evidence:**
```typescript
update(options: {
  workspaceId: string;
  id: string;
  patternId?: string;
  provisionalAlertId?: string | null;  // Accepted but never used
  wasInjected?: boolean;
  // ...
}): PatternOccurrence | null {
  // ... provisionalAlertId is never handled
```

**Recommendation:** Either add handling for `provisionalAlertId` or remove it from the options interface to avoid confusion.

---

### Finding BUG-006
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** 167-169
**Title:** Workspace Slug Generation Can Produce Empty Slugs

**Description:**
If `projectName` contains only non-alphanumeric characters (e.g., all special characters), the slug generation at line 167 will produce an empty string or only hyphens.

**Evidence:**
```typescript
const defaultSlug = projectName.toLowerCase().replace(/[^a-z0-9_]/g, '-');
workspaceSlug = defaultSlug;
```

**Recommendation:** Add validation after slug generation to ensure it's not empty and contains at least one alphanumeric character. The `validateSlug` function exists but is only called after this point.

---

### Finding BUG-007
**Severity:** LOW
**File:** `src/attribution/failure-mode-resolver.ts`
**Lines:** 167-184
**Title:** Ambiguity Score Threshold May Miss Edge Cases

**Description:**
The `calculateAmbiguityScore()` function uses thresholds of 1, 2, 3+ vagueness signals, but the comparison at line 105 requires `ambiguityScore >= 2`. This means a single vagueness signal plus no testable criteria (score=2) will trigger ambiguous, but edge cases may be inconsistent.

**Evidence:**
```typescript
if (evidence.vaguenessSignals.length >= 3) {
  score += 3;
} else if (evidence.vaguenessSignals.length >= 2) {
  score += 2;
} else if (evidence.vaguenessSignals.length === 1) {
  score += 1;
}

if (!evidence.hasTestableAcceptanceCriteria) {
  score += 1;
}
```

**Recommendation:** Document the scoring thresholds and their rationale. Consider if 0 vagueness signals + no testable criteria (score=1) should be handled differently.

---

## 4. TEST SCOUT REPORT

### Finding TEST-001
**Severity:** HIGH
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** All
**Title:** No Unit Tests Found for Repository Methods

**Description:**
The pattern-occurrence.repo.ts file contains 10+ methods including complex JSON queries and update logic, but no corresponding test file was found in the standard locations.

**Evidence:** No test file at `src/storage/repositories/__tests__/pattern-occurrence.repo.test.ts` or similar.

**Recommendation:** Create comprehensive unit tests covering:
- CRUD operations
- JSON extraction queries (findByGitDoc, findByLinearDocId, etc.)
- Edge cases (null handling, empty results)
- Update method with partial fields

---

### Finding TEST-002
**Severity:** HIGH
**File:** `src/evolution/promotion-checker.ts`
**Lines:** All
**Title:** No Integration Tests for Promotion Workflow

**Description:**
The promotion checker involves complex business logic (checking project count, severity, category, confidence) but no integration tests verify the complete workflow.

**Evidence:** No test file found for promotion-checker.ts.

**Recommendation:** Create integration tests that:
- Set up patterns across multiple projects
- Verify promotion criteria are correctly evaluated
- Test edge cases (exactly 3 projects, boundary confidence values)

---

### Finding TEST-003
**Severity:** MEDIUM
**File:** `src/attribution/failure-mode-resolver.ts`
**Lines:** All
**Title:** Decision Tree Paths Need Exhaustive Test Coverage

**Description:**
The failure mode resolver has 5+ decision paths (A-E) but test coverage for all paths is not verified.

**Evidence:** Decision tree has branches for: synthesis_drift, missing_reference, conflict_unresolved, ambiguous, incomplete, and various carrierInstructionKind values.

**Recommendation:** Create a test matrix covering all decision tree paths with representative EvidenceBundle fixtures.

---

### Finding TEST-004
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** All
**Title:** CLI Command Integration Tests Missing

**Description:**
The init command has complex logic (git detection, database operations, file copying) but no integration tests verify the full flow.

**Evidence:** No CLI test harness found.

**Recommendation:** Create integration tests that:
- Mock git commands
- Use temporary directories
- Verify database state after init
- Test error paths (not in git repo, already initialized)

---

### Finding TEST-005
**Severity:** LOW
**File:** `src/injection/confidence.ts`
**Lines:** 192-197
**Title:** daysSinceDate Not Tested for Edge Cases

**Description:**
The `daysSinceDate()` function is not tested for edge cases: timezone boundaries, DST transitions, invalid date strings.

**Evidence:**
```typescript
export function daysSinceDate(isoDate: string): number {
  const then = new Date(isoDate);
  // No validation of isoDate format
```

**Recommendation:** Add unit tests for: valid ISO dates, invalid formats (returns NaN?), timezone edge cases.

---

### Finding TEST-006
**Severity:** MEDIUM
**File:** `src/attribution/noncompliance-checker.ts`
**Lines:** 141-164
**Title:** extractKeywords Needs Boundary Testing

**Description:**
The `extractKeywords()` function filters by word length (>2) and uses a stopword list, but boundary cases need testing.

**Evidence:** No tests found for: empty input, very long input, Unicode text, numbers only.

**Recommendation:** Add tests for edge cases and document expected behavior.

---

## 5. DECISIONS SCOUT REPORT

### Finding DEC-001
**Severity:** MEDIUM
**File:** `src/evolution/promotion-checker.ts`
**Lines:** 36-52
**Title:** Magic Numbers for Promotion Thresholds Not Documented

**Description:**
The constants `MIN_PROJECTS_FOR_PROMOTION = 3`, `MIN_DERIVED_CONFIDENCE = 0.6`, `PROJECT_COUNT_BOOST = 0.05`, and `MAX_PROJECT_BOOST = 0.15` are defined without explaining why these specific values were chosen.

**Evidence:**
```typescript
const MIN_PROJECTS_FOR_PROMOTION = 3;
const MIN_DERIVED_CONFIDENCE = 0.6;
const PROJECT_COUNT_BOOST = 0.05;
const MAX_PROJECT_BOOST = 0.15;
```

**Recommendation:** Add ADR (Architecture Decision Record) or inline documentation explaining the rationale for these thresholds.

---

### Finding DEC-002
**Severity:** MEDIUM
**File:** `src/injection/confidence.ts`
**Lines:** 79-91
**Title:** Evidence Quality Base Values Undocumented

**Description:**
The confidence base values (verbatim=0.75, paraphrase=0.55, inferred=0.4) are used without documenting why these specific values were chosen.

**Evidence:**
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

**Recommendation:** Document the rationale (e.g., based on empirical testing, industry standards, etc.).

---

### Finding DEC-003
**Severity:** LOW
**File:** `src/attribution/noncompliance-checker.ts`
**Lines:** 111-112
**Title:** Relevance Threshold 0.3 is Arbitrary

**Description:**
The relevance threshold of 0.3 for determining noncompliance is used without documentation of why this value was chosen.

**Evidence:**
```typescript
if (match && match.relevanceScore >= 0.3) {
  // Guidance exists! This is execution noncompliance.
```

**Recommendation:** Document the threshold rationale and consider making it configurable.

---

### Finding DEC-004
**Severity:** HIGH
**File:** `src/evolution/promotion-checker.ts`
**Lines:** 92-100
**Title:** Only Security Patterns Eligible for Promotion - Policy Decision Undocumented

**Description:**
The code explicitly restricts promotion to security patterns only, but this significant policy decision is not documented in any ADR or design document.

**Evidence:**
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

**Recommendation:** Create an ADR documenting why only security patterns can be promoted and what the future roadmap is.

---

### Finding DEC-005
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** 273-274
**Title:** Gitignore Suggestions Policy Not Documented

**Description:**
The decision to suggest adding `.falcon/`, `.claude/commands/`, and `.claude/agents/` to `.gitignore` is not documented. It's unclear if these should be tracked or not.

**Evidence:**
```typescript
const gitignoreEntries = ['.falcon/', '.claude/commands/', '.claude/agents/'];
```

**Recommendation:** Document the rationale - are these generated files? Should they be shared across team members?

---

### Finding DEC-006
**Severity:** LOW
**File:** `src/attribution/failure-mode-resolver.ts`
**Lines:** 102-117
**Title:** Ambiguity vs Incompleteness Scoring Logic Undocumented

**Description:**
The decision to use score-based comparison (>=2 threshold) for ambiguity vs incompleteness is implemented but the rationale is not documented.

**Evidence:**
```typescript
if (ambiguityScore > incompletenessScore && ambiguityScore >= 2) {
  result.failureMode = 'ambiguous';
```

**Recommendation:** Add inline documentation or ADR explaining the scoring methodology.

---

## 6. SPEC SCOUT REPORT

### Finding SPEC-001
**Severity:** MEDIUM
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Lines:** 1-6
**Title:** Append-Only Claim Not Enforced

**Description:**
The module documentation claims "append-only" but the `update()` method at line 200 allows modifying existing records, which contradicts the append-only design principle.

**Evidence:**
```typescript
/**
 * Pattern Occurrence repository.
 *
 * Manages specific instances of pattern attribution (append-only).
```
vs.
```typescript
update(options: {
  // ... allows modifications
```

**Recommendation:** Either enforce append-only by removing update capability (create new records instead), or update the documentation to clarify which fields can be modified and why.

---

### Finding SPEC-002
**Severity:** HIGH
**File:** `src/injection/confidence.ts`
**Lines:** 123-176
**Title:** Spec Section 4.2 Formula Implementation May Diverge

**Description:**
The spec claims formula is `attributionConfidence * severityWeight * relevanceWeight * recencyWeight` but implementation adds `crossProjectMultiplier`. This should be documented in the spec.

**Evidence:**
```typescript
/**
 * Compute injection priority for a pattern.
 * See Spec Section 4.2.
 *
 * injectionPriority =
 *   attributionConfidence
 *   * severityWeight
 *   * relevanceWeight
 *   * recencyWeight
 */
// But implementation adds:
const crossProjectMultiplier = pattern._crossProjectPenalty ? 0.95 : 1.0;
```

**Recommendation:** Update the JSDoc comment to include crossProjectMultiplier, and ensure spec document is updated.

---

### Finding SPEC-003
**Severity:** MEDIUM
**File:** `src/evolution/promotion-checker.ts`
**Lines:** 1-11
**Title:** Promotion Criteria Differs from Module Documentation

**Description:**
The module header states "Severity is HIGH or CRITICAL" and "Category is security" as criteria, but also mentions project count (3+) and confidence threshold (0.6). The full criteria should be consistently documented.

**Evidence:**
```typescript
/**
 * Promotion criteria:
 * - Pattern appears in 3+ projects within workspace
 * - Severity is HIGH or CRITICAL
 * - Category is security (security patterns prioritized for promotion)
 */
```

**Recommendation:** Update header to include all criteria: project count, severity, category, AND confidence threshold.

---

### Finding SPEC-004
**Severity:** LOW
**File:** `src/attribution/noncompliance-checker.ts`
**Lines:** 1-16
**Title:** NOTE v1.0 Comment Should Reference Spec Version

**Description:**
The NOTE at lines 10-15 references "v1.0" ambiguity removal but doesn't link to the spec or ADR that made this decision.

**Evidence:**
```typescript
/**
 * NOTE (v1.0): 'ambiguity' was removed from NoncomplianceCause.
```

**Recommendation:** Add reference to the spec version or ADR that documents this decision.

---

### Finding SPEC-005
**Severity:** MEDIUM
**File:** `src/cli/commands/init.ts`
**Lines:** All
**Title:** Init Command Behavior Not Fully Specified

**Description:**
The init command has many behaviors (workspace creation, project registration, CORE file installation) but there is no specification document describing expected behavior, error handling, and edge cases.

**Evidence:** No corresponding spec file found for CLI commands.

**Recommendation:** Create a CLI specification document or add comprehensive JSDoc describing all behaviors.

---

### Finding SPEC-006
**Severity:** HIGH
**File:** `src/attribution/failure-mode-resolver.ts`
**Lines:** 55-73
**Title:** STEP A Logic May Not Match Spec Intent

**Description:**
Step A checks `sourceAgreesWithCarrier === false` but the comment says "source disagrees with carrier". If `sourceAgreesWithCarrier` is `undefined` or `null`, this check passes (no drift detected), but this may not be the intended behavior.

**Evidence:**
```typescript
if (evidence.hasCitation && evidence.sourceRetrievable) {
  if (evidence.sourceAgreesWithCarrier === false) {
    // Source disagrees with carrier - synthesis drift PROVEN
```

**Recommendation:** Clarify spec: should undefined/null sourceAgreesWithCarrier be treated as "unknown" (different from "agrees")?

---

---

# JUDGE EVALUATIONS

---

## 1. SECURITY JUDGE EVALUATION

### SEC-001: Command Injection via execSync
**Verdict:** DISMISSED
**Reasoning:** The execSync calls use hardcoded commands without any user input concatenation. The remote URL that flows from getGitRemoteOrigin() is used as data (stored in DB via parameterized queries), not as part of a command. This is a false positive.

### SEC-002: SQL Query Pattern Risk
**Verdict:** DISMISSED
**Reasoning:** The query is correctly parameterized. The `(p.repo_subdir IS NULL AND ? IS NULL)` pattern is standard SQL for handling nullable column comparisons. No vulnerability exists.

### SEC-003: Dynamic SQL Construction
**Verdict:** CONFIRMED (downgrade to LOW)
**Reasoning:** While currently safe, this pattern is a maintenance hazard. The recommendation to add a comment is valid but the severity should be LOW since no actual vulnerability exists.

### SEC-004: Path Traversal in copyDirRecursive
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. While the source files are from the package itself (controlled), `fs.readdirSync` returns `entry.name` which is a basename (not a full path), so `path.join(dest, entry.name)` cannot traverse outside. However, if source files contained symlinks pointing outside, that could be an issue. Confirming as MEDIUM for defense-in-depth.

### SEC-005: Input Validation Incomplete
**Verdict:** MODIFIED (downgrade to INFO)
**Reasoning:** The current validation is adequate for the use case. Adding control character validation is a nice-to-have but not a security vulnerability since the values go into a local SQLite database with parameterized queries.

### SEC-006: ReDoS via extractKeywords
**Verdict:** DISMISSED
**Reasoning:** The regex patterns used (`/[^a-z0-9\s]/g` and `/\s+/`) are simple and not vulnerable to ReDoS. The text length concern is theoretical - finding descriptions are bounded by the system generating them.

### SEC-007: JSON Extraction Without Schema Validation
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. The `PatternOccurrenceSchema.parse()` at line 154 should validate nested JSON structures. Need to verify that Zod schema includes proper validation for `carrierFingerprint` and `originFingerprint` nested objects. If not, malformed JSON could cause issues.

**Summary:**
- CONFIRMED: 3 (SEC-003, SEC-004, SEC-007)
- DISMISSED: 4 (SEC-001, SEC-002, SEC-005, SEC-006)
- MODIFIED: 1 (SEC-005 -> INFO)

---

## 2. DOCS JUDGE EVALUATION

### DOC-001: Typo promoteToDerivdPrinciple
**Verdict:** CONFIRMED
**Reasoning:** Clear typo. "DerivdPrinciple" should be "DerivedPrinciple". This affects searchability and code maintenance.

### DOC-002: Missing Spec Version Reference
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. As the system evolves, "Section 4.1" becomes ambiguous. Adding version reference improves traceability.

### DOC-003: Missing Mermaid Diagram
**Verdict:** MODIFIED (downgrade to INFO)
**Reasoning:** Nice-to-have but not a documentation deficiency. The textual description is adequate. Lowering to informational suggestion.

### DOC-004: Missing Example Usage
**Verdict:** CONFIRMED
**Reasoning:** Valid. CLI commands should include usage examples in their documentation for developer experience.

### DOC-005: Phase 5 Implementation Status
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. Phase-based development should clearly indicate implementation status to avoid confusion about production readiness.

**Summary:**
- CONFIRMED: 4 (DOC-001, DOC-002, DOC-004, DOC-005)
- DISMISSED: 0
- MODIFIED: 1 (DOC-003 -> INFO)

---

## 3. BUG JUDGE EVALUATION

### BUG-001: N+1 Query Problem
**Verdict:** CONFIRMED
**Reasoning:** Clear N+1 query anti-pattern. For N patterns, makes N+1 database queries. This will cause performance issues at scale. Valid HIGH severity.

### BUG-002: Non-null Assertion
**Verdict:** CONFIRMED
**Reasoning:** Race condition is possible. Using `!` without null check can cause runtime errors. Should filter nulls or handle the error case.

### BUG-003: Sliding Window Edge Case
**Verdict:** CONFIRMED
**Reasoning:** Valid bug. Documents with fewer than 5 lines are never searched, which could miss relevant guidance in short spec sections or context pack snippets.

### BUG-004: daysSinceDate Negative Values
**Verdict:** MODIFIED (upgrade to MEDIUM)
**Reasoning:** While one call site has `Math.max(0, ...)`, other call sites (e.g., `computeRecencyWeight`) do not guard against negative values. A future date would return negative days, potentially causing incorrect recency weights.

### BUG-005: provisionalAlertId Ignored
**Verdict:** CONFIRMED
**Reasoning:** Clear bug. The option is accepted but never processed. Either dead code that should be removed, or missing implementation.

### BUG-006: Empty Slug Generation
**Verdict:** CONFIRMED
**Reasoning:** Valid edge case. Project name "\*\*\*" would produce "---" as slug, which passes the regex but is nonsensical. The validateSlug check happens but only after the value is set.

### BUG-007: Ambiguity Score Threshold
**Verdict:** DISMISSED
**Reasoning:** The thresholds appear intentional. 0 vagueness signals + no testable criteria = score 1, which is below the threshold of 2, meaning it won't trigger "ambiguous". This seems like intended behavior to require at least some vagueness.

**Summary:**
- CONFIRMED: 5 (BUG-001, BUG-002, BUG-003, BUG-005, BUG-006)
- DISMISSED: 1 (BUG-007)
- MODIFIED: 1 (BUG-004 -> MEDIUM)

---

## 4. TEST JUDGE EVALUATION

### TEST-001: No Unit Tests for Repository
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. Repositories are critical infrastructure and should have comprehensive unit tests. HIGH severity appropriate.

### TEST-002: No Integration Tests for Promotion
**Verdict:** CONFIRMED
**Reasoning:** Valid. The promotion logic is business-critical and involves multiple components. Integration tests are essential.

### TEST-003: Decision Tree Test Coverage
**Verdict:** CONFIRMED
**Reasoning:** Valid. The failure mode resolver has 5+ distinct paths that each need test coverage to prevent regressions.

### TEST-004: CLI Integration Tests Missing
**Verdict:** CONFIRMED
**Reasoning:** Valid. CLI commands that modify filesystem and database state need integration tests.

### TEST-005: daysSinceDate Edge Cases
**Verdict:** CONFIRMED
**Reasoning:** Valid. Date handling functions are notorious for edge case bugs (timezones, DST, invalid input).

### TEST-006: extractKeywords Boundary Testing
**Verdict:** CONFIRMED
**Reasoning:** Valid. Text processing functions need boundary testing for empty input, very long input, and special characters.

**Summary:**
- CONFIRMED: 6 (all findings)
- DISMISSED: 0
- MODIFIED: 0

---

## 5. DECISIONS JUDGE EVALUATION

### DEC-001: Magic Numbers Undocumented
**Verdict:** CONFIRMED
**Reasoning:** Valid. Configuration constants that affect system behavior should have documented rationale, especially thresholds that determine pattern promotion.

### DEC-002: Evidence Quality Base Values
**Verdict:** CONFIRMED
**Reasoning:** Valid. The confidence values directly affect injection priority and should have documented justification.

### DEC-003: Relevance Threshold 0.3
**Verdict:** CONFIRMED
**Reasoning:** Valid. Arbitrary-seeming threshold needs documentation. Consider making configurable.

### DEC-004: Security-Only Promotion Policy
**Verdict:** CONFIRMED
**Reasoning:** This is a significant policy decision that should be documented in an ADR. HIGH severity appropriate as it affects system behavior significantly.

### DEC-005: Gitignore Suggestions Policy
**Verdict:** CONFIRMED
**Reasoning:** Valid. The decision about what to track/ignore has implications for team collaboration and should be documented.

### DEC-006: Ambiguity vs Incompleteness Scoring
**Verdict:** MODIFIED (downgrade to INFO)
**Reasoning:** While documentation would be nice, the code is reasonably self-explanatory. The scoring logic is visible in the code. Lower priority than other items.

**Summary:**
- CONFIRMED: 5 (DEC-001 through DEC-005)
- DISMISSED: 0
- MODIFIED: 1 (DEC-006 -> INFO)

---

## 6. SPEC JUDGE EVALUATION

### SPEC-001: Append-Only Claim Not Enforced
**Verdict:** CONFIRMED
**Reasoning:** Valid contradiction between documentation and implementation. The spec principle of append-only is violated by having an update method. Either the documentation or implementation needs to change.

### SPEC-002: Formula Implementation Diverges
**Verdict:** CONFIRMED
**Reasoning:** Valid spec compliance issue. The crossProjectMultiplier is not in the documented formula. Documentation should match implementation.

### SPEC-003: Incomplete Promotion Criteria Documentation
**Verdict:** CONFIRMED
**Reasoning:** Valid. The header omits the confidence threshold (0.6) which is an important criterion.

### SPEC-004: NOTE v1.0 Reference
**Verdict:** CONFIRMED
**Reasoning:** Valid. Version notes should link to the authoritative source for traceability.

### SPEC-005: Init Command Unspecified
**Verdict:** CONFIRMED
**Reasoning:** Valid. Complex CLI commands benefit from formal specification, especially for error handling and edge cases.

### SPEC-006: STEP A Logic Ambiguity
**Verdict:** CONFIRMED
**Reasoning:** Valid concern. The behavior when `sourceAgreesWithCarrier` is undefined vs false vs true should be explicitly specified. The current strict equality check (`=== false`) treats undefined as "not disagreeing" which may not match spec intent.

**Summary:**
- CONFIRMED: 6 (all findings)
- DISMISSED: 0
- MODIFIED: 0

---

# SUMMARY TABLE

| Scout Type | Total Findings | Confirmed | Dismissed | Modified |
|------------|----------------|-----------|-----------|----------|
| Security   | 7              | 3         | 4         | 0        |
| Docs       | 5              | 4         | 0         | 1        |
| Bug        | 7              | 5         | 1         | 1        |
| Test       | 6              | 6         | 0         | 0        |
| Decisions  | 6              | 5         | 0         | 1        |
| Spec       | 6              | 6         | 0         | 0        |
| **TOTAL**  | **37**         | **29**    | **5**     | **3**    |

---

# FINAL CONFIRMED ISSUES LIST

## CRITICAL (0)
None

## HIGH (8)
1. **BUG-001** - N+1 Query Problem in findMatchingPatternsAcrossProjects (`src/evolution/promotion-checker.ts:227-229`)
2. **BUG-005** - provisionalAlertId Ignored in Update Method (`src/storage/repositories/pattern-occurrence.repo.ts:200-246`)
3. **TEST-001** - No Unit Tests for Repository (`src/storage/repositories/pattern-occurrence.repo.ts`)
4. **TEST-002** - No Integration Tests for Promotion Workflow (`src/evolution/promotion-checker.ts`)
5. **DEC-004** - Security-Only Promotion Policy Undocumented (`src/evolution/promotion-checker.ts:92-100`)
6. **SPEC-001** - Append-Only Claim Not Enforced (`src/storage/repositories/pattern-occurrence.repo.ts`)
7. **SPEC-002** - Formula Implementation Diverges from Spec (`src/injection/confidence.ts:123-176`)
8. **SPEC-006** - STEP A Logic May Not Match Spec Intent (`src/attribution/failure-mode-resolver.ts:55-73`)

## MEDIUM (14)
1. **SEC-004** - Path Traversal Risk in copyDirRecursive (`src/cli/commands/init.ts:318-331`)
2. **SEC-007** - JSON Extraction Without Schema Validation (`src/storage/repositories/pattern-occurrence.repo.ts:263-287`)
3. **DOC-005** - Phase 5 Methods Lack Implementation Status (`src/storage/repositories/pattern-occurrence.repo.ts:248-251`)
4. **BUG-002** - Non-null Assertion on Potentially Null Result (`src/evolution/promotion-checker.ts:228`)
5. **BUG-003** - Off-by-One Edge Case in Sliding Window (`src/attribution/noncompliance-checker.ts:183-197`)
6. **BUG-004** - daysSinceDate Returns Negative for Future Dates (`src/injection/confidence.ts:192-197`)
7. **BUG-006** - Workspace Slug Generation Can Produce Empty Slugs (`src/cli/commands/init.ts:167-169`)
8. **TEST-003** - Decision Tree Paths Need Test Coverage (`src/attribution/failure-mode-resolver.ts`)
9. **TEST-004** - CLI Command Integration Tests Missing (`src/cli/commands/init.ts`)
10. **TEST-006** - extractKeywords Needs Boundary Testing (`src/attribution/noncompliance-checker.ts:141-164`)
11. **DEC-001** - Magic Numbers for Promotion Thresholds (`src/evolution/promotion-checker.ts:36-52`)
12. **DEC-002** - Evidence Quality Base Values Undocumented (`src/injection/confidence.ts:79-91`)
13. **DEC-005** - Gitignore Suggestions Policy Not Documented (`src/cli/commands/init.ts:273-274`)
14. **SPEC-003** - Incomplete Promotion Criteria Documentation (`src/evolution/promotion-checker.ts:1-11`)

## LOW (7)
1. **SEC-003** - Dynamic SQL Construction Pattern (safe but fragile) (`src/storage/repositories/pattern-occurrence.repo.ts:243`)
2. **DOC-001** - Typo: promoteToDerivdPrinciple (`src/evolution/promotion-checker.ts:131`)
3. **DOC-002** - Missing Spec Version Reference (`src/injection/confidence.ts:64-72`)
4. **DOC-004** - Missing Example Usage in Module Doc (`src/cli/commands/init.ts:1-6`)
5. **TEST-005** - daysSinceDate Not Tested for Edge Cases (`src/injection/confidence.ts:192-197`)
6. **DEC-003** - Relevance Threshold 0.3 is Arbitrary (`src/attribution/noncompliance-checker.ts:111-112`)
7. **SPEC-004** - NOTE v1.0 Should Reference Spec Version (`src/attribution/noncompliance-checker.ts:1-16`)

## INFO (Modified/Downgraded) (3)
1. **SEC-005** - Input Validation Incomplete (was LOW)
2. **DOC-003** - Missing Mermaid Diagram (was LOW)
3. **DEC-006** - Ambiguity vs Incompleteness Scoring Logic (was LOW)

---

# TEST CONFIGURATION NOTES

- **Test ID:** B2
- **Scout Model:** OPUS (claude-opus-4-5-20251101)
- **Judge Model:** OPUS (claude-opus-4-5-20251101)
- **Mode:** Batch (all findings evaluated at once per judge)
- **Total Scout Findings:** 37
- **Confirmed After Judge Review:** 29 (78.4%)
- **Dismissed:** 5 (13.5%)
- **Modified:** 3 (8.1%)

---

*Report generated by PR Review Model Comparison Test Suite*
