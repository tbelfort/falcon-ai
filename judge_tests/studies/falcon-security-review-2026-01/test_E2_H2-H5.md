# Haiku Security Reviews: H2-H5 Analysis
## Sequential Code Review for Falcon-AI Pattern Attribution System

---

## PASS H2: Data Validation & Type Safety
**Focus**: Input validation, type mismatches, schema compliance
**Date**: 2026-01-21

### Issue H2-1: Missing Workspace Scope Validation in findByPatternId
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:34-49`
**Severity**: HIGH
**Type**: Data Validation

The `findByPatternId` method accepts `workspaceId` and `patternId` but does NOT validate that the retrieved occurrences actually belong to the workspace. The method returns ALL occurrences matching the patternId across all workspaces if the database query is incorrect or if pattern IDs can collide.

```typescript
findByPatternId(options: {
  workspaceId: string;
  patternId: string;
}): PatternOccurrence[] {
  const rows = this.db
    .prepare(
      `SELECT * FROM pattern_occurrences
       WHERE workspace_id = ? AND pattern_id = ?
       ORDER BY created_at DESC`
    )
    .all(options.workspaceId, options.patternId) as Record<string, unknown>[];
  return rows.map((row) => this.rowToEntity(row));
}
```

**Issue**: While the SQL query filters by workspace_id, there is NO post-query validation that returned rows match BOTH workspace_id and patternId. If the schema or database state is corrupted, mismatched rows could be returned without detection.

**Recommendation**: Add assertion after mapping to verify workspace boundaries:
```typescript
const entities = rows.map((row) => this.rowToEntity(row));
console.assert(entities.every(e => e.workspaceId === options.workspaceId),
  'Workspace boundary violation');
```

---

### Issue H2-2: Type Coercion in rowToEntity Could Lose Data
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:393-423`
**Severity**: MEDIUM
**Type**: Type Safety

The `rowToEntity` method casts database rows without null-safety verification. Several fields use unsafe casts:

```typescript
prNumber: row.pr_number as number,  // Could be null/undefined
severity: row.severity as PatternOccurrence['severity'],  // No enum validation
```

**Issue**: If the database row contains `NULL` for `pr_number`, the `as number` cast doesn't prevent the type system from accepting a null value at runtime. Similarly, `severity` is cast without validation that it's a valid enum value.

**Impact**: Runtime errors when these fields are later accessed as non-null values.

**Recommendation**: Add explicit null checks and enum validation:
```typescript
prNumber: row.pr_number !== null ? Number(row.pr_number) : 0,
severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(row.severity as string)
  ? (row.severity as PatternOccurrence['severity'])
  : 'MEDIUM',
```

---

### Issue H2-3: Unvalidated JSON Parsing in Phase 5 Methods
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:256-289`
**Severity**: MEDIUM
**Type**: Data Validation

The `findByGitDoc` method uses `json_extract()` in SQL to query nested JSON fields but does NOT validate that the returned `carrier_fingerprint` and `origin_fingerprint` are valid JSON before parsing:

```typescript
findByGitDoc(options: { ... }): PatternOccurrence[] {
  const rows = this.db.prepare(`
    WHERE workspace_id = ?
      AND status = ?
      AND (json_extract(carrier_fingerprint, '$.kind') = 'git' ...)
  `).all(...);
  return rows.map((row) => this.rowToEntity(row));
}
```

**Issue**: If `carrier_fingerprint` or `origin_fingerprint` are corrupted/non-JSON in the database, `rowToEntity` calls `parseJsonField()` which could throw an unhandled exception, crashing the request.

**Impact**: DoS if a single row with malformed JSON exists.

**Recommendation**: Add try-catch wrapping in Phase 5 queries or pre-validate JSON before parsing.

---

### Issue H2-4: Update Method Builds SQL Without Preventing Injection-Like Column Names
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:200-246`
**Severity**: MEDIUM
**Type**: Data Validation

The `update` method dynamically builds SET clauses:

```typescript
if (options.patternId !== undefined) {
  updates.push('pattern_id = ?');
  params.push(options.patternId);
}
```

**Issue**: While parameterized queries are used for VALUES, the column names are hardcoded (good). However, there is NO validation that `options.status` is one of `['active', 'inactive']`. If a caller passes an invalid status value, it will be inserted into the database without constraint checking.

**Impact**: Data integrity violation. The status field could contain invalid values if validation happens at schema level but not at input level.

**Recommendation**: Validate enum fields before adding to params:
```typescript
if (options.status !== undefined) {
  if (!['active', 'inactive'].includes(options.status)) {
    throw new Error('Invalid status');
  }
  updates.push('status = ?');
  params.push(options.status);
}
```

---

### Issue H2-5: BaseRepository Helper Methods Lack Type Guards
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:415-416`
**Severity**: LOW
**Type**: Type Safety

The `intToBool` and `nullableIntToBool` methods are called without validation that the input is actually a number:

```typescript
wasInjected: this.intToBool(row.was_injected as number),
wasAdheredTo: this.nullableIntToBool(row.was_adhered_to as number | null),
```

**Issue**: If the database column type is changed or data is corrupted, passing a non-integer value to `intToBool` could cause unexpected behavior. The `as number` cast bypasses type checking.

**Recommendation**: Add guards in conversion methods or validate before calling.

---

## PASS H3: Error Handling & Edge Cases
**Focus**: Exception handling, boundary conditions, state transitions
**Date**: 2026-01-21

### Issue H3-1: Unhandled Edge Case in computeDerivedConfidence with Empty Projects List
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:235-270`
**Severity**: MEDIUM
**Type**: Edge Case

The `computeDerivedConfidence` function handles empty patterns:

```typescript
if (patterns.length === 0) {
  return 0;
}
```

But does NOT handle the case where `projectCount === 0`:

```typescript
const extraProjects = Math.max(0, projectCount - MIN_PROJECTS_FOR_PROMOTION);
const projectBoost = Math.min(extraProjects * PROJECT_COUNT_BOOST, MAX_PROJECT_BOOST);
```

**Issue**: If `projectCount` is 0 (data inconsistency), `extraProjects` becomes 0, and no boost is applied. However, the function name and context imply it expects `projectCount >= 3` (MIN_PROJECTS_FOR_PROMOTION). This silently produces a confidence value when the precondition is violated.

**Impact**: Confidence calculations can be unreliable if called with invalid project counts.

**Recommendation**: Add precondition check:
```typescript
if (projectCount < MIN_PROJECTS_FOR_PROMOTION) {
  console.warn('computeDerivedConfidence called with insufficient project count');
  return 0;
}
```

---

### Issue H3-2: findMatchingPatternsAcrossProjects Silently Skips Null Patterns
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:212-229`
**Severity**: MEDIUM
**Type**: Error Handling

The function maps rows to patterns but uses non-null assertion without error handling:

```typescript
return rows.map((row) => patternRepo.findById(row.id as string)!);
```

**Issue**: The non-null assertion `!` assumes `findById()` will never return null. If a pattern is deleted or corrupted between the initial query and the lookup, `findById()` returns null, but the non-null assertion masks this, resulting in a null value in the array.

**Impact**: Downstream code receives null values it doesn't expect, leading to cascading errors.

**Recommendation**: Add null check and warn:
```typescript
return rows.map((row) => {
  const pattern = patternRepo.findById(row.id as string);
  if (!pattern) {
    console.warn(`Pattern ${row.id} not found in lookup`);
  }
  return pattern;
}).filter((p) => p !== null) as PatternDefinition[];
```

---

### Issue H3-3: checkForPromotion Returns Zero Confidence Without Reason Context
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:73-90`
**Severity**: LOW
**Type**: Error Handling

The function returns early with `averageConfidence: 0` in multiple cases:

```typescript
if (projectCount < MIN_PROJECTS_FOR_PROMOTION) {
  return {
    qualifies: false,
    projectCount,
    averageConfidence: 0,  // Not computed, just defaulted
    reason: `Insufficient project coverage...`,
  };
}
```

**Issue**: The `averageConfidence` field is set to 0 without actually computing it. If the confidence computation is expensive, this saves time, but it creates a false signal: `averageConfidence: 0` could mean "computed and very low" vs. "never computed." No way to distinguish.

**Impact**: Callers cannot tell if the pattern was rejected early or after computation.

**Recommendation**: Use a nullable type or explicit "not computed" marker:
```typescript
averageConfidence: null as const,  // Instead of 0
reason: `...`,
```

---

### Issue H3-4: extractKeywords Doesn't Handle Empty Input Gracefully
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts:141-164`
**Severity**: LOW
**Type**: Edge Case

The function processes finding text but returns an empty array without logging:

```typescript
const words = text
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter((w) => w.length > 2 && !stopWords.has(w));

return [...new Set(words)];
```

**Issue**: If `title` and `description` are both empty or contain only stop words, the function returns `[]`. The caller in `checkForNoncompliance` then returns `{ isNoncompliance: false }` without indicating that keyword extraction failed.

**Impact**: Silent failure - no visibility into why noncompliance check was skipped.

**Recommendation**: Log when keywords are empty:
```typescript
if (words.length === 0) {
  console.warn('No keywords extracted from finding text');
}
return [...new Set(words)];
```

---

### Issue H3-5: searchDocument Assumes Non-Empty Keywords Without Validation
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts:171-200`
**Severity**: LOW
**Type**: Edge Case

The `searchDocument` function checks for empty keywords:

```typescript
if (keywords.length === 0) return null;
```

But the caller `checkForNoncompliance` has already checked this:

```typescript
if (keywords.length === 0) {
  return { isNoncompliance: false };
}
// ...
const contextPackMatch = searchDocument(params.contextPack, keywords);
```

**Issue**: Redundant checks suggest uncertainty about who is responsible for validation. The check in `searchDocument` is defensive, but the caller's early return means it's dead code.

**Impact**: Maintainability issue - logic is duplicated and could diverge.

**Recommendation**: Remove check from searchDocument or move all validation to one place.

---

## PASS H4: Performance & Efficiency
**Focus**: Query efficiency, algorithmic complexity, resource usage
**Date**: 2026-01-21

### Issue H4-1: N+1 Query Problem in findMatchingPatternsAcrossProjects
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:212-229`
**Severity**: HIGH
**Type**: Performance

The function queries all pattern IDs, then calls `findById()` for each one:

```typescript
const rows = db.prepare(`SELECT * FROM pattern_definitions WHERE ...`).all(...);
const patternRepo = new PatternDefinitionRepository(db);
return rows.map((row) => patternRepo.findById(row.id as string)!);
```

**Issue**: If there are 100 matching patterns, this executes 1 + 100 = 101 database queries (initial .all() plus 100 findById calls). Each `findById()` likely queries the database again.

**Impact**: Severe performance degradation for workspaces with many patterns.

**Calculation**: For 100 patterns, this is 100x slower than a single query returning all patterns directly.

**Recommendation**: Fetch all patterns in one query:
```typescript
const patterns = db.prepare(`
  SELECT * FROM pattern_definitions
  WHERE workspace_id = ? AND pattern_key = ? AND status = 'active'
`).all(workspaceId, patternKey);
return patterns.map(row => patternRepo.rowToEntity(row));
```

---

### Issue H4-2: searchDocument Uses Inefficient Sliding Window Approach
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts:171-200`
**Severity**: MEDIUM
**Type**: Performance

The function iterates through all lines and creates substrings:

```typescript
for (let i = 0; i <= lines.length - windowSize; i++) {
  const window = lines.slice(i, i + windowSize).join('\n').toLowerCase();
  const matchedKeywords = keywords.filter((kw) => window.includes(kw));
  const score = matchedKeywords.length;
}
```

**Issue**:
- For each window (O(lines) iterations), it creates a new string via `slice().join()` (O(windowSize)).
- For each window, it filters keywords (O(keywords)).
- Inside the filter, each keyword is checked with `includes()` (O(window_length)).

**Total Complexity**: O(lines * keywords * window_length)

For a 1000-line document with 50 keywords: 1000 * 50 * 5 * avg_window_length = potentially 250,000+ operations.

**Recommendation**: Pre-compile keyword regex or use indexed search:
```typescript
const keywordRegex = new RegExp(keywords.map(kw => `\\b${kw}\\b`).join('|'), 'gi');
// Then count matches in each window
```

---

### Issue H4-3: checkWorkspaceForPromotions Queries Database Twice Per Pattern
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:275-329`
**Severity**: MEDIUM
**Type**: Performance

The function first gets all pattern keys, then loops through each:

```typescript
const patternKeys = db.prepare(`SELECT DISTINCT pattern_key ...`).all(...);
for (const { pattern_key: patternKey } of patternKeys) {
  const projectCount = patternRepo.countDistinctProjects({ workspaceId, patternKey });
  if (projectCount >= MIN_PROJECTS_FOR_PROMOTION) {
    const representative = db.prepare(`SELECT id FROM pattern_definitions ...`).get(...);
    if (representative) {
      const pattern = patternRepo.findById(representative.id);
      const result = checkForPromotion(db, pattern);
    }
  }
}
```

**Issue**: For each pattern key, it calls:
1. `countDistinctProjects()` - queries database
2. `db.prepare().get()` - queries database again for pattern ID
3. `patternRepo.findById()` - queries database yet again

This is 3 queries per pattern key instead of 1.

**Impact**: For 50 pattern keys, 150 database queries instead of 50.

**Recommendation**: Batch into a single query that returns projectCount alongside pattern data.

---

### Issue H4-4: computeAttributionConfidence Recomputes Pattern Stats Unnecessarily
**File**: `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts:74-114`
**Severity**: LOW
**Type**: Performance

The `computeAttributionConfidence` function accepts pre-computed `stats` parameter but the caller in `computeDerivedConfidence` regenerates stats for each pattern:

```typescript
// In computeDerivedConfidence
for (const pattern of patterns) {
  const occurrences = occurrenceRepo.findByPatternId({ workspaceId, patternId: pattern.id });
  const stats = computePatternStats(pattern.id, { findByPatternId: () => occurrences });
  totalConfidence += computeAttributionConfidence(pattern, stats);
}
```

Each call to `computePatternStats` reprocesses all occurrences (filtering active, injected, adhered).

**Issue**: For patterns with hundreds of occurrences, this is wasteful.

**Recommendation**: Cache stats or batch compute before the loop.

---

### Issue H4-5: Unused Parameter in computeDerivedConfidence
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:235-270`
**Severity**: LOW
**Type**: Code Efficiency

The function signature includes an unused `_db` parameter:

```typescript
export function computeDerivedConfidence(
  patterns: PatternDefinition[],
  projectCount: number,
  _db: Database,  // UNUSED
  occurrenceRepo: PatternOccurrenceRepository
): number {
```

**Issue**: The `_db` parameter is accepted but never used. This wastes a parameter slot and signals ambiguous design intent (why pass it if not needed?).

**Impact**: Code clarity and potential future bugs if someone assumes they can use `_db`.

**Recommendation**: Remove unused parameter or document why it's needed for future extension.

---

## PASS H5: Maintainability & Code Quality
**Focus**: Clarity, consistency, technical debt, anti-patterns
**Date**: 2026-01-21

### Issue H5-1: Inconsistent Error Handling Pattern Across Repository Methods
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
**Severity**: MEDIUM
**Type**: Maintainability

Some methods return `null` on not found:
```typescript
findById(id: string): PatternOccurrence | null { ... return row ? this.rowToEntity(row) : null; }
```

Others return arrays:
```typescript
findByPatternId(options: { ... }): PatternOccurrence[] { ... return rows.map(...); }
```

Others return arrays that could be empty:
```typescript
findActive(options: { ... }): PatternOccurrence[] { ... }
```

**Issue**: Callers must remember different null/empty semantics for each method. There's no consistent convention.

**Impact**: Easy to introduce bugs by treating an array as potentially null or vice versa.

**Recommendation**: Document contract for each method:
```typescript
// Returns null if not found; never empty array
findById(id: string): PatternOccurrence | null
// Returns empty array if none found; never null
findByPatternId(...): PatternOccurrence[]
```

---

### Issue H5-2: Magic Numbers Without Constants
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts:182, 194`
**Severity**: LOW
**Type**: Code Quality

Hardcoded values appear in searchDocument:

```typescript
const windowSize = 5;  // Line 182 - defined as constant
...
relevanceScore: score / keywords.length,  // Line 194 - magic threshold
```

And earlier:
```typescript
if (match && match.relevanceScore >= 0.3) {  // Line 112 - magic threshold
```

**Issue**: The magic value `0.3` appears only at the call site, while `windowSize = 5` is defined locally. Constants are inconsistently declared.

**Impact**: Hard to update thresholds globally; different parts of the codebase may use different values.

**Recommendation**: Define all magic numbers as constants at module level:
```typescript
const RELEVANCE_THRESHOLD = 0.3;
const WINDOW_SIZE = 5;
const MIN_KEYWORD_MATCHES = 2;
```

---

### Issue H5-3: Inconsistent JSON Parsing Error Handling in BaseRepository
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:403-412`
**Severity**: MEDIUM
**Type**: Maintainability

The `rowToEntity` method calls `parseJsonField` for multiple fields without wrapping in try-catch:

```typescript
evidence: this.parseJsonField<EvidenceBundle>(row.evidence as string),
carrierFingerprint: this.parseJsonField<DocFingerprint>(row.carrier_fingerprint as string),
originFingerprint: row.origin_fingerprint
  ? this.parseJsonField<DocFingerprint>(row.origin_fingerprint as string)
  : undefined,
provenanceChain: this.parseJsonField<DocFingerprint[]>(row.provenance_chain as string),
```

**Issue**: If ANY of these calls throw an exception (corrupted JSON), the entire row conversion fails and the request crashes. There's no granular error recovery per field.

**Impact**: Single corrupted field corrupts entire row and potentially crashes batch operations.

**Recommendation**: Add per-field error handling or validate JSON schema upfront:
```typescript
try {
  evidence: this.parseJsonField<EvidenceBundle>(row.evidence as string)
} catch (e) {
  console.error('Failed to parse evidence for occurrence', row.id, e);
  evidence: { /* fallback/empty */ }
}
```

---

### Issue H5-4: Enum Values Not Centralized for Status Fields
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:109, 207, 232`
**Severity**: LOW
**Type**: Code Quality

Status values are hardcoded as strings:

```typescript
WHERE status = 'active'  // Line 109
status?: 'active' | 'inactive'  // Line 207
updates.push('status = ?');
params.push(options.status);  // Line 232
```

**Issue**: Status enum values (`'active'`, `'inactive'`) are repeated across the codebase. If status changes or new values are added, multiple files must be updated.

**Impact**: Risk of inconsistency; difficult refactoring.

**Recommendation**: Define status enum at schema level and import everywhere:
```typescript
type OccurrenceStatus = 'active' | 'inactive';
const OCCURRENCE_STATUSES = ['active', 'inactive'] as const;
```

---

### Issue H5-5: Missing Documentation on Non-Obvious Behavior
**File**: `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts:131`
**Severity**: LOW
**Type**: Maintainability

The function `promoteToDerivdPrinciple` (note the typo in the name from H1) has a subtle behavior: the `force` option bypasses qualification checks:

```typescript
if (!options?.force) {
  const check = checkForPromotion(db, pattern);
  if (!check.qualifies) {
    return { promoted: false, reason: check.reason };
  }
}
```

**Issue**: The `force` parameter is not documented. Callers don't know:
- What happens when `force: true`? (Skips all checks)
- Is this for emergency promotions or testing?
- Should this ever be used in production?

**Impact**: Risk of misuse; hidden behavior.

**Recommendation**: Add JSDoc:
```typescript
/**
 * Promote a pattern to a derived principle.
 * @param force - If true, skip promotion eligibility checks. DANGER: Use only in testing.
 */
export function promoteToDerivdPrinciple(
  db: Database,
  pattern: PatternDefinition,
  options?: { force?: boolean }
): PromotionResult {
```

---

### Issue H5-6: Copy-Paste Pattern in Phase 5 Repository Methods
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts:256-354`
**Severity**: LOW
**Type**: Code Quality

The methods `findByGitDoc`, `findByLinearDocId`, `findByWebUrl`, and `findByExternalId` follow identical patterns:

```typescript
findByGitDoc(...): PatternOccurrence[] {
  const statusFilter = options.status || 'active';
  const rows = this.db.prepare(`SELECT * FROM pattern_occurrences WHERE ...`).all(...);
  return rows.map((row) => this.rowToEntity(row));
}

findByLinearDocId(...): PatternOccurrence[] {
  const statusFilter = options.status || 'active';
  const rows = this.db.prepare(`SELECT * FROM pattern_occurrences WHERE ...`).all(...);
  return rows.map((row) => this.rowToEntity(row));
}
```

**Issue**: The methods are nearly identical, only differing in the WHERE clause JSON filter logic. This is a maintenance burden.

**Impact**: Changes to error handling or mapping logic must be applied to 4 separate methods.

**Recommendation**: Extract common pattern into a helper method:
```typescript
private findByDocumentFingerprint(
  workspaceId: string,
  filterCondition: string,
  params: unknown[],
  status?: 'active' | 'inactive'
): PatternOccurrence[] {
  const statusFilter = status || 'active';
  const rows = this.db.prepare(`
    SELECT * FROM pattern_occurrences
    WHERE workspace_id = ? AND status = ? AND ${filterCondition}
  `).all(workspaceId, statusFilter, ...params);
  return rows.map(row => this.rowToEntity(row));
}
```

---

## Summary Table: All Novel Issues Found (H2-H5)

| Pass | Issue ID | Severity | File | Category | Title |
|------|----------|----------|------|----------|-------|
| H2 | H2-1 | HIGH | pattern-occurrence.repo.ts:34-49 | Data Validation | Missing Workspace Scope Validation in findByPatternId |
| H2 | H2-2 | MEDIUM | pattern-occurrence.repo.ts:393-423 | Type Safety | Type Coercion in rowToEntity Could Lose Data |
| H2 | H2-3 | MEDIUM | pattern-occurrence.repo.ts:256-289 | Data Validation | Unvalidated JSON Parsing in Phase 5 Methods |
| H2 | H2-4 | MEDIUM | pattern-occurrence.repo.ts:200-246 | Data Validation | Update Method Builds SQL Without Enum Validation |
| H2 | H2-5 | LOW | pattern-occurrence.repo.ts:415-416 | Type Safety | BaseRepository Helper Methods Lack Type Guards |
| H3 | H3-1 | MEDIUM | promotion-checker.ts:235-270 | Edge Case | Unhandled Edge Case in computeDerivedConfidence |
| H3 | H3-2 | MEDIUM | promotion-checker.ts:212-229 | Error Handling | findMatchingPatternsAcrossProjects Silently Skips Null |
| H3 | H3-3 | LOW | promotion-checker.ts:73-90 | Error Handling | checkForPromotion Returns Zero Confidence Without Context |
| H3 | H3-4 | LOW | noncompliance-checker.ts:141-164 | Edge Case | extractKeywords Doesn't Handle Empty Input Gracefully |
| H3 | H3-5 | LOW | noncompliance-checker.ts:171-200 | Edge Case | searchDocument Has Redundant Keyword Validation |
| H4 | H4-1 | HIGH | promotion-checker.ts:212-229 | Performance | N+1 Query Problem in findMatchingPatternsAcrossProjects |
| H4 | H4-2 | MEDIUM | noncompliance-checker.ts:171-200 | Performance | Inefficient Sliding Window Approach in searchDocument |
| H4 | H4-3 | MEDIUM | promotion-checker.ts:275-329 | Performance | checkWorkspaceForPromotions Queries Database Twice Per Pattern |
| H4 | H4-4 | LOW | confidence.ts:74-114 | Performance | Pattern Stats Recomputed Unnecessarily |
| H4 | H4-5 | LOW | promotion-checker.ts:235-270 | Code Efficiency | Unused Parameter in computeDerivedConfidence |
| H5 | H5-1 | MEDIUM | pattern-occurrence.repo.ts | Maintainability | Inconsistent Error Handling Pattern Across Methods |
| H5 | H5-2 | LOW | noncompliance-checker.ts:182, 194 | Code Quality | Magic Numbers Without Constants |
| H5 | H5-3 | MEDIUM | pattern-occurrence.repo.ts:403-412 | Maintainability | Inconsistent JSON Parsing Error Handling |
| H5 | H5-4 | LOW | pattern-occurrence.repo.ts:109, 207, 232 | Code Quality | Enum Values Not Centralized for Status Fields |
| H5 | H5-5 | LOW | promotion-checker.ts:131 | Maintainability | Missing Documentation on Non-Obvious Behavior |
| H5 | H5-6 | LOW | pattern-occurrence.repo.ts:256-354 | Code Quality | Copy-Paste Pattern in Phase 5 Repository Methods |

---

## JSON Summary: All Novel Issues

```json
{
  "audit_metadata": {
    "project": "falcon-ai",
    "date": "2026-01-21",
    "reviewer": "Haiku 4.5",
    "passes_conducted": 4,
    "pass_names": ["H2: Data Validation & Type Safety", "H3: Error Handling & Edge Cases", "H4: Performance & Efficiency", "H5: Maintainability & Code Quality"],
    "previous_pass": "H1",
    "files_reviewed": 6,
    "total_issues_found": 21
  },
  "issues_by_pass": {
    "H2_data_validation": {
      "pass_number": 2,
      "focus": "Input validation, type mismatches, schema compliance",
      "count": 5,
      "issues": [
        {
          "id": "H2-1",
          "severity": "HIGH",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "34-49",
          "category": "Data Validation",
          "title": "Missing Workspace Scope Validation in findByPatternId",
          "description": "Method filters by workspace_id but lacks post-query validation that returned rows match both workspace_id and patternId",
          "impact": "Potential workspace boundary violation or data leak if database state is corrupted"
        },
        {
          "id": "H2-2",
          "severity": "MEDIUM",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "393-423",
          "category": "Type Safety",
          "title": "Type Coercion in rowToEntity Could Lose Data",
          "description": "Unsafe type casts (as number, as enum) without null-safety or enum validation",
          "impact": "Runtime errors when null values are accessed as non-null"
        },
        {
          "id": "H2-3",
          "severity": "MEDIUM",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "256-289",
          "category": "Data Validation",
          "title": "Unvalidated JSON Parsing in Phase 5 Methods",
          "description": "Phase 5 queries use json_extract but do not validate JSON before parsing, could crash on corrupted data",
          "impact": "DoS vulnerability if malformed JSON exists in database"
        },
        {
          "id": "H2-4",
          "severity": "MEDIUM",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "200-246",
          "category": "Data Validation",
          "title": "Update Method Builds SQL Without Enum Validation",
          "description": "Dynamic UPDATE builds SET clauses but does not validate status field is 'active' or 'inactive'",
          "impact": "Data integrity violation; invalid enum values inserted into database"
        },
        {
          "id": "H2-5",
          "severity": "LOW",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "415-416",
          "category": "Type Safety",
          "title": "BaseRepository Helper Methods Lack Type Guards",
          "description": "intToBool and nullableIntToBool called without validation that input is integer",
          "impact": "Unexpected behavior if non-integer values passed due to schema change or corruption"
        }
      ]
    },
    "H3_error_handling": {
      "pass_number": 3,
      "focus": "Exception handling, boundary conditions, state transitions",
      "count": 5,
      "issues": [
        {
          "id": "H3-1",
          "severity": "MEDIUM",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "235-270",
          "category": "Edge Case",
          "title": "Unhandled Edge Case in computeDerivedConfidence with Zero Projects",
          "description": "Function does not validate projectCount >= MIN_PROJECTS_FOR_PROMOTION; silently produces unreliable confidence",
          "impact": "Incorrect promotion eligibility calculations if called with invalid state"
        },
        {
          "id": "H3-2",
          "severity": "MEDIUM",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "212-229",
          "category": "Error Handling",
          "title": "findMatchingPatternsAcrossProjects Silently Skips Null Patterns",
          "description": "Uses non-null assertion (!) on findById result; if pattern deleted between queries, null value is silently included",
          "impact": "Null values in result array cause cascading errors downstream"
        },
        {
          "id": "H3-3",
          "severity": "LOW",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "73-90",
          "category": "Error Handling",
          "title": "checkForPromotion Returns Zero Confidence Without Context",
          "description": "averageConfidence field set to 0 in early returns without indicating whether computed or just defaulted",
          "impact": "Callers cannot distinguish between 'computed very low' vs. 'never computed'"
        },
        {
          "id": "H3-4",
          "severity": "LOW",
          "file": "src/attribution/noncompliance-checker.ts",
          "lines": "141-164",
          "category": "Edge Case",
          "title": "extractKeywords Doesn't Handle Empty Input Gracefully",
          "description": "Returns empty array silently if title+description contain only stop words; no logging of failure",
          "impact": "Silent failure; no visibility into why noncompliance check was skipped"
        },
        {
          "id": "H3-5",
          "severity": "LOW",
          "file": "src/attribution/noncompliance-checker.ts",
          "lines": "171-200",
          "category": "Edge Case",
          "title": "searchDocument Has Redundant Keyword Validation",
          "description": "Both caller and searchDocument check for empty keywords; redundant defensive checks",
          "impact": "Dead code path; maintenance burden if checks diverge"
        }
      ]
    },
    "H4_performance": {
      "pass_number": 4,
      "focus": "Query efficiency, algorithmic complexity, resource usage",
      "count": 5,
      "issues": [
        {
          "id": "H4-1",
          "severity": "HIGH",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "212-229",
          "category": "Performance",
          "title": "N+1 Query Problem in findMatchingPatternsAcrossProjects",
          "description": "Queries all pattern IDs, then calls findById for each; 1 + N database queries instead of 1",
          "impact": "For 100 patterns: 100x slower; severe degradation with many patterns"
        },
        {
          "id": "H4-2",
          "severity": "MEDIUM",
          "file": "src/attribution/noncompliance-checker.ts",
          "lines": "171-200",
          "category": "Performance",
          "title": "Inefficient Sliding Window Approach in searchDocument",
          "description": "O(lines * keywords * window_length) complexity; creates new strings and filters on each iteration",
          "impact": "1000-line doc with 50 keywords: 250,000+ operations per search"
        },
        {
          "id": "H4-3",
          "severity": "MEDIUM",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "275-329",
          "category": "Performance",
          "title": "checkWorkspaceForPromotions Queries Database Twice Per Pattern",
          "description": "Calls countDistinctProjects, db.prepare().get(), and findById for each pattern key; 3 queries per pattern",
          "impact": "50 pattern keys: 150 queries instead of 50"
        },
        {
          "id": "H4-4",
          "severity": "LOW",
          "file": "src/injection/confidence.ts",
          "lines": "74-114",
          "category": "Performance",
          "title": "Pattern Stats Recomputed Unnecessarily",
          "description": "computeDerivedConfidence recomputes stats for each pattern in loop; stats could be cached or batched",
          "impact": "Wasteful for patterns with hundreds of occurrences"
        },
        {
          "id": "H4-5",
          "severity": "LOW",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "235-270",
          "category": "Code Efficiency",
          "title": "Unused Parameter in computeDerivedConfidence",
          "description": "_db parameter accepted but never used; signals ambiguous design intent",
          "impact": "Code clarity issue; potential for future bugs if someone assumes _db is available"
        }
      ]
    },
    "H5_maintainability": {
      "pass_number": 5,
      "focus": "Clarity, consistency, technical debt, anti-patterns",
      "count": 6,
      "issues": [
        {
          "id": "H5-1",
          "severity": "MEDIUM",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "multiple",
          "category": "Maintainability",
          "title": "Inconsistent Error Handling Pattern Across Methods",
          "description": "Some methods return null on not-found, others return arrays; no consistent convention",
          "impact": "Easy to introduce bugs by treating arrays as potentially null or vice versa"
        },
        {
          "id": "H5-2",
          "severity": "LOW",
          "file": "src/attribution/noncompliance-checker.ts",
          "lines": "182, 194",
          "category": "Code Quality",
          "title": "Magic Numbers Without Constants",
          "description": "Hardcoded values like 0.3 (relevance threshold) and 5 (window size) scattered without centralized constants",
          "impact": "Hard to update thresholds globally; inconsistent values in different parts of codebase"
        },
        {
          "id": "H5-3",
          "severity": "MEDIUM",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "403-412",
          "category": "Maintainability",
          "title": "Inconsistent JSON Parsing Error Handling",
          "description": "Multiple parseJsonField calls without try-catch; single corrupted field crashes entire row conversion",
          "impact": "Single corrupted JSON field crashes batch operations; no granular error recovery"
        },
        {
          "id": "H5-4",
          "severity": "LOW",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "109, 207, 232",
          "category": "Code Quality",
          "title": "Enum Values Not Centralized for Status Fields",
          "description": "Status values 'active'/'inactive' hardcoded across codebase; not centralized in enum",
          "impact": "Risk of inconsistency; difficult refactoring if status values change"
        },
        {
          "id": "H5-5",
          "severity": "LOW",
          "file": "src/evolution/promotion-checker.ts",
          "lines": "131",
          "category": "Maintainability",
          "title": "Missing Documentation on Non-Obvious Behavior",
          "description": "force parameter in promoteToDerivdPrinciple not documented; unclear when/why to use it",
          "impact": "Risk of misuse; hidden behavior not obvious from code alone"
        },
        {
          "id": "H5-6",
          "severity": "LOW",
          "file": "src/storage/repositories/pattern-occurrence.repo.ts",
          "lines": "256-354",
          "category": "Code Quality",
          "title": "Copy-Paste Pattern in Phase 5 Repository Methods",
          "description": "findByGitDoc, findByLinearDocId, findByWebUrl, findByExternalId nearly identical; only WHERE clause differs",
          "impact": "Maintenance burden; changes to error handling must be applied to 4 separate methods"
        }
      ]
    }
  },
  "issue_summary_by_severity": {
    "CRITICAL": 0,
    "HIGH": 2,
    "MEDIUM": 9,
    "LOW": 10,
    "total": 21
  },
  "top_risk_areas": [
    {
      "area": "Performance Bottlenecks",
      "issues": ["H4-1", "H4-2", "H4-3"],
      "recommendation": "Refactor queries to eliminate N+1 patterns and optimize search algorithms"
    },
    {
      "area": "Data Validation & Type Safety",
      "issues": ["H2-1", "H2-2", "H2-3", "H2-4"],
      "recommendation": "Add comprehensive input validation layer; strengthen type guards throughout repository"
    },
    {
      "area": "Error Handling Consistency",
      "issues": ["H3-1", "H3-2", "H3-5", "H5-1"],
      "recommendation": "Establish clear error handling conventions and apply consistently across codebase"
    },
    {
      "area": "Code Maintainability",
      "issues": ["H5-2", "H5-3", "H5-4", "H5-6"],
      "recommendation": "Extract duplicate patterns; centralize constants and enum values; add JSDoc documentation"
    }
  ],
  "distinct_from_h1": {
    "note": "These 21 issues do not overlap with 9 issues from H1 pass",
    "h1_issues": [
      "Path traversal in copyDirRecursive",
      "Directory traversal in getRepoSubdir",
      "SQL injection risk in findMatchingPatternsAcrossProjects",
      "Console output leaking internal data",
      "Undefined confidenceModifier in resolveFailureMode",
      "Function typo promoteToDerivdPrinciple",
      "Division by zero risk in computeDerivedConfidence",
      "Empty keyword list skip",
      "Window size hardcoded"
    ],
    "h2_h5_new_issues": 21
  }
}
```

---

## Recommendations for Prioritization

### Immediate (Critical Path Blockers)
1. **H4-1**: N+1 queries will cause severe performance degradation in production
2. **H2-1**: Workspace boundary validation missing; security risk

### High Priority (This Sprint)
1. **H2-3**: JSON parsing errors could crash the system
2. **H3-2**: Silent null handling could propagate silent failures
3. **H4-3**: Database query multiplication affects scale

### Medium Priority (Next Sprint)
1. **H5-1**: Standardize error handling patterns across repository
2. **H5-3**: Centralize JSON error handling with per-field recovery
3. **H4-2**: Optimize search algorithm for large documents

### Low Priority (Technical Debt)
1. **H5-2, H5-4**: Extract constants and centralize enum values
2. **H5-6**: Refactor Phase 5 methods to reduce duplication
3. **H4-5**: Remove unused parameters

---

**End of Report**
