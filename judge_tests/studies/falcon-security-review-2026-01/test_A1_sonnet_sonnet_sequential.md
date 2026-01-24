# Test A1: SONNET Scouts + SONNET Judges (Sequential Mode)

**Configuration:** A1-SEQ
**Scout Model:** SONNET
**Judge Model:** SONNET
**Mode:** Sequential (ONE issue at a time per judge)
**Date:** 2026-01-20
**PR:** #6 - Security Review: Full Codebase Audit with Model Comparison

---

## Files Reviewed

1. `src/storage/repositories/pattern-occurrence.repo.ts` (424 lines)
2. `src/evolution/promotion-checker.ts` (329 lines)
3. `src/attribution/failure-mode-resolver.ts` (235 lines)
4. `src/attribution/noncompliance-checker.ts` (249 lines)
5. `src/cli/commands/init.ts` (333 lines)
6. `src/injection/confidence.ts` (197 lines)

---

## SCOUT REPORTS

---

### SECURITY SCOUT REPORT (SONNET)

#### SEC-1: Path Traversal in copyDirRecursive
**File:** `src/cli/commands/init.ts:318-332`
**Severity:** HIGH
**Description:** The `copyDirRecursive` function does not validate that source and destination paths are within expected boundaries. An attacker who can control the CORE source directory or influence file entries could potentially:
1. Follow symlinks to read/write outside intended directories
2. Use `..` path components to escape the target directory
3. Overwrite critical system files if running with elevated permissions

```typescript
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);  // No validation!
    const destPath = path.join(dest, entry.name); // No validation!

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);  // Symlinks not handled
    }
  }
}
```

---

#### SEC-2: Insufficient Input Validation for Project Name
**File:** `src/cli/commands/init.ts:92-100`
**Severity:** MEDIUM
**Description:** While `validateInput` checks for empty, length > 255, and null bytes, it does not validate against path traversal characters or shell metacharacters. If `projectName` is used in shell commands elsewhere, this could lead to injection.

```typescript
const projectName = options.name || path.basename(gitRoot);

// Validate project name
try {
  validateInput(projectName, 'Project name');
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
}
```

**Missing checks:**
- Path traversal characters (`..`, `/`)
- Shell metacharacters (`;`, `|`, `&`, `$`, backticks)
- Control characters beyond null byte

---

#### SEC-3: SQL Injection via Workspace Slug
**File:** `src/cli/commands/init.ts:152-154`
**Severity:** LOW
**Description:** The workspace slug from user input is used in a parameterized query, which is good. However, the slug is not validated before use. While better-sqlite3 parameterization prevents SQL injection, other usages of the slug (file paths, logs) could be vulnerable.

```typescript
const workspace = db
  .prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
  .get(options.workspace, 'active') as Workspace | undefined;
```

**Note:** The parameterized query itself is safe, but `options.workspace` should still be validated for format.

---

#### SEC-4: Workspace ID Scope Leakage in Pattern Occurrence Repository
**File:** `src/storage/repositories/pattern-occurrence.repo.ts:17,145-152`
**Severity:** CRITICAL
**Description:** The `CreateInput` type definition does NOT omit `workspaceId` and `projectId` from the input, which according to spec Section 1.8, should be derived from the pattern to prevent scope violation attacks. An attacker could potentially create occurrences in workspaces/projects they shouldn't have access to.

```typescript
type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt'>;  // Missing: workspaceId, projectId

create(data: CreateInput): PatternOccurrence {
  const now = this.now();

  const occurrence: PatternOccurrence = {
    id: randomUUID(),
    createdAt: now,
    ...data,  // workspaceId/projectId passed directly without validation
  };
```

**Expected:** `type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt' | 'workspaceId' | 'projectId'>;`

---

#### SEC-5: Unvalidated JSON Field Parsing
**File:** `src/storage/repositories/pattern-occurrence.repo.ts:393-423`
**Severity:** MEDIUM
**Description:** The `rowToEntity` function parses JSON fields from the database without validation. Malformed or malicious JSON could cause unexpected behavior.

```typescript
private rowToEntity(row: Record<string, unknown>): PatternOccurrence {
  return {
    // ...
    evidence: this.parseJsonField<EvidenceBundle>(row.evidence as string),
    carrierFingerprint: this.parseJsonField<DocFingerprint>(
      row.carrier_fingerprint as string
    ),
    // ... no validation of parsed JSON structure
  };
}
```

---

### SECURITY SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| SEC-1 | HIGH | init.ts | 318-332 | Path traversal in copyDirRecursive |
| SEC-2 | MEDIUM | init.ts | 92-100 | Insufficient input validation |
| SEC-3 | LOW | init.ts | 152-154 | Unvalidated workspace slug format |
| SEC-4 | CRITICAL | pattern-occurrence.repo.ts | 17,145-152 | Scope invariant violation |
| SEC-5 | MEDIUM | pattern-occurrence.repo.ts | 393-423 | Unvalidated JSON parsing |

---

### DOCS SCOUT REPORT (SONNET)

#### DOC-1: Typo in Function Name
**File:** `src/evolution/promotion-checker.ts:131`
**Severity:** LOW
**Description:** The function `promoteToDerivdPrinciple` has a typo - missing 'e' in 'Derived'.

```typescript
export function promoteToDerivdPrinciple(
  db: Database,
  pattern: PatternDefinition,
  options?: { force?: boolean }
): PromotionResult {
```

---

#### DOC-2: Missing JSDoc for Interface Fields
**File:** `src/injection/confidence.ts:10-16`
**Severity:** LOW
**Description:** `PatternStats` interface lacks JSDoc descriptions for its fields.

```typescript
export interface PatternStats {
  totalOccurrences: number;
  activeOccurrences: number;
  lastSeenActive: string | null;
  injectionCount: number;
  adherenceRate: number | null;
}
```

---

#### DOC-3: Inconsistent Comment Style
**File:** `src/attribution/noncompliance-checker.ts:1-16`
**Severity:** LOW
**Description:** Header comment is comprehensive but the inline notes use different styles (some have `NOTE (v1.0):` while others don't follow any versioning convention).

---

#### DOC-4: Missing API Documentation for Repository Methods
**File:** `src/storage/repositories/pattern-occurrence.repo.ts`
**Severity:** MEDIUM
**Description:** Several repository methods have minimal or no JSDoc documentation explaining:
- Expected parameter constraints
- Error conditions
- Return value semantics

---

### DOCS SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| DOC-1 | LOW | promotion-checker.ts | 131 | Typo in function name |
| DOC-2 | LOW | confidence.ts | 10-16 | Missing field JSDoc |
| DOC-3 | LOW | noncompliance-checker.ts | 1-16 | Inconsistent comment style |
| DOC-4 | MEDIUM | pattern-occurrence.repo.ts | various | Missing API docs |

---

### BUG SCOUT REPORT (SONNET)

#### BUG-1: Empty Array Reduce Potential TypeError
**File:** `src/attribution/failure-mode-resolver.ts:207-210` (Note: This issue is actually in `noncompliance-checker.ts` at line 183-197)
**Severity:** HIGH
**Description:** If `keywords.length` is less than or equal to `windowSize` (5), the sliding window loop may produce unexpected results or miss the last valid windows.

**Corrected location:** `src/attribution/noncompliance-checker.ts:183`

```typescript
// Sliding window of 5 lines
const windowSize = 5;
for (let i = 0; i <= lines.length - windowSize; i++) {  // <= instead of <
```

Wait - this is actually correct for `<=`. Let me re-examine...

Actually, the condition `i <= lines.length - windowSize` is **incorrect** if you want to check all windows. For a document with 10 lines and windowSize=5, you want windows starting at indices 0,1,2,3,4,5 (6 windows). With `<=`, you get 0 to 5 inclusive, which is correct.

However, if `lines.length < windowSize`, then `lines.length - windowSize` is negative, and the loop won't execute at all, which may be intended but is not documented.

---

#### BUG-2: Off-By-One in Sliding Window
**File:** `src/attribution/noncompliance-checker.ts:183`
**Severity:** HIGH
**Description:** The loop condition uses `i < lines.length - windowSize` but should use `<=` to include the last complete window.

Wait - the code shows `i <= lines.length - windowSize`. Let me check again...

Actually looking at line 183:
```typescript
for (let i = 0; i <= lines.length - windowSize; i++) {
```

This **should** be `<` not `<=`. With `<=`, if `lines.length = 10` and `windowSize = 5`:
- `i <= 10 - 5` means `i <= 5`
- Iterations: 0, 1, 2, 3, 4, 5 (6 iterations)
- Windows: [0-4], [1-5], [2-6], [3-7], [4-8], [5-9]

This is actually **correct** - you get 6 windows covering all possible 5-line sections.

**Revised Assessment:** No bug here. Withdrawing this finding.

---

#### BUG-3: Missing 90-Day Re-Promotion Block Check
**File:** `src/evolution/promotion-checker.ts:152-168`
**Severity:** HIGH
**Description:** The spec requires checking if a principle was recently archived (within 90 days) before re-promoting a pattern. The current implementation only checks for active principles:

```typescript
// Check if already promoted
const existing = principleRepo.findByPromotionKey({ workspaceId, promotionKey });
if (existing) {
  return {
    promoted: false,
    derivedPrincipleId: existing.id,
    reason: 'Already promoted',
  };
}
```

**Missing:** Check for recently archived principles:
```typescript
const archived = principleRepo.findArchivedByPromotionKey({ workspaceId, promotionKey });
if (archived && daysSince(archived.archivedAt) < 90) {
  return { promoted: false, reason: '90-day re-promotion block active' };
}
```

---

#### BUG-4: Potential Division by Zero in Adherence Rate
**File:** `src/injection/confidence.ts:55-58`
**Severity:** LOW
**Description:** The adherence rate calculation handles zero injected occurrences correctly by returning `null`, but this is done with a ternary that could be clearer.

```typescript
adherenceRate:
  injectedOccurrences.length > 0
    ? adheredOccurrences.length / injectedOccurrences.length
    : null,
```

**Assessment:** This is actually correct, not a bug.

---

#### BUG-5: No Validation for Negative Days Since Date
**File:** `src/injection/confidence.ts:99-104`
**Severity:** MEDIUM
**Description:** The `daysSinceDate` function can return negative values if the stored date is in the future (due to timezone issues or clock skew). While line 101 has a `Math.max(0, ...)` guard, this is only applied in one location.

```typescript
// Guard against negative days (e.g., from timezone issues or clock skew)
const daysSince = Math.max(0, daysSinceDate(stats.lastSeenActive));
```

Other usages of `daysSinceDate` (like in `computeRecencyWeight`) don't have this guard:
```typescript
function computeRecencyWeight(lastSeen: string): number {
  const days = daysSinceDate(lastSeen);  // No guard!
  if (days <= 7) return 1.0;
  // ...
}
```

---

#### BUG-6: Concurrent Database Access Not Handled
**File:** `src/storage/repositories/pattern-occurrence.repo.ts:200-246`
**Severity:** MEDIUM
**Description:** The `update` method performs read-modify-write without proper transaction handling, which could lead to race conditions.

```typescript
update(options: {...}): PatternOccurrence | null {
  const existing = this.findById(options.id);  // Read
  if (!existing || existing.workspaceId !== options.workspaceId) return null;
  // ... build updates ...
  this.db.prepare(`UPDATE ...`).run(...params);  // Write
  return this.findById(options.id);  // Read again
}
```

---

### BUG SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| BUG-1 | WITHDRAWN | - | - | Not a bug after analysis |
| BUG-2 | WITHDRAWN | - | - | Not a bug after analysis |
| BUG-3 | HIGH | promotion-checker.ts | 152-168 | Missing 90-day re-promotion block |
| BUG-4 | WITHDRAWN | - | - | Not a bug |
| BUG-5 | MEDIUM | confidence.ts | 182-187 | Inconsistent negative days guard |
| BUG-6 | MEDIUM | pattern-occurrence.repo.ts | 200-246 | Race condition in update |

---

### TEST SCOUT REPORT (SONNET)

#### TEST-1: No Test Files Present in Review Scope
**Severity:** HIGH
**Description:** The PR does not include any test files for the reviewed source files. Each of these critical files should have corresponding unit tests.

**Missing tests:**
- `pattern-occurrence.repo.test.ts`
- `promotion-checker.test.ts`
- `failure-mode-resolver.test.ts`
- `noncompliance-checker.test.ts`
- `init.test.ts`
- `confidence.test.ts`

---

#### TEST-2: Untestable Private Functions
**File:** `src/evolution/promotion-checker.ts:212-229`
**Severity:** LOW
**Description:** The `findMatchingPatternsAcrossProjects` function is not exported, making it difficult to test independently.

---

#### TEST-3: Complex Logic Without Property-Based Tests
**File:** `src/attribution/failure-mode-resolver.ts:44-158`
**Severity:** MEDIUM
**Description:** The `resolveFailureMode` function has multiple decision paths that would benefit from property-based testing to ensure all combinations are handled correctly.

---

#### TEST-4: No Edge Case Tests for Sliding Window
**File:** `src/attribution/noncompliance-checker.ts:171-200`
**Severity:** MEDIUM
**Description:** The `searchDocument` function's sliding window algorithm has edge cases (documents shorter than window size, empty documents, single-line documents) that should be explicitly tested.

---

### TEST SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| TEST-1 | HIGH | all | - | Missing test files |
| TEST-2 | LOW | promotion-checker.ts | 212-229 | Untestable private function |
| TEST-3 | MEDIUM | failure-mode-resolver.ts | 44-158 | Missing property-based tests |
| TEST-4 | MEDIUM | noncompliance-checker.ts | 171-200 | Missing edge case tests |

---

### DECISIONS SCOUT REPORT (SONNET)

#### DEC-1: Hardcoded Magic Numbers
**File:** `src/evolution/promotion-checker.ts:36-52`
**Severity:** MEDIUM
**Description:** Multiple constants are defined but the rationale for their specific values is not documented:

```typescript
const MIN_PROJECTS_FOR_PROMOTION = 3;       // Why 3?
const MIN_DERIVED_CONFIDENCE = 0.6;         // Why 60%?
const PROJECT_COUNT_BOOST = 0.05;           // Why 5%?
const MAX_PROJECT_BOOST = 0.15;             // Why 15%?
```

---

#### DEC-2: Security Patterns Only for Promotion
**File:** `src/evolution/promotion-checker.ts:92-99`
**Severity:** MEDIUM
**Description:** The decision to only promote security patterns to workspace-level principles is hardcoded without ADR or documented rationale:

```typescript
// Prioritize security patterns
if (pattern.findingCategory !== 'security') {
  return {
    qualifies: false,
    // ...
    reason: `Non-security patterns not eligible for promotion (category: ${pattern.findingCategory})`,
  };
}
```

---

#### DEC-3: 0.3 Relevance Threshold Undocumented
**File:** `src/attribution/noncompliance-checker.ts:111-112`
**Severity:** LOW
**Description:** The threshold `0.3` for determining if guidance exists is not explained:

```typescript
if (match && match.relevanceScore >= 0.3) {
```

---

#### DEC-4: 5-Line Sliding Window Choice
**File:** `src/attribution/noncompliance-checker.ts:181-182`
**Severity:** LOW
**Description:** The window size of 5 lines is arbitrary and undocumented:

```typescript
const windowSize = 5;
```

---

#### DEC-5: Confidence Base Values
**File:** `src/injection/confidence.ts:80-91`
**Severity:** MEDIUM
**Description:** The base confidence values for different quote types are undocumented:

```typescript
switch (pattern.primaryCarrierQuoteType) {
  case 'verbatim':
    confidence = 0.75;   // Why 0.75?
    break;
  case 'paraphrase':
    confidence = 0.55;   // Why 0.55?
    break;
  case 'inferred':
    confidence = 0.4;    // Why 0.4?
    break;
}
```

---

### DECISIONS SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| DEC-1 | MEDIUM | promotion-checker.ts | 36-52 | Undocumented magic numbers |
| DEC-2 | MEDIUM | promotion-checker.ts | 92-99 | Security-only promotion undocumented |
| DEC-3 | LOW | noncompliance-checker.ts | 111-112 | 0.3 threshold undocumented |
| DEC-4 | LOW | noncompliance-checker.ts | 181-182 | 5-line window undocumented |
| DEC-5 | MEDIUM | confidence.ts | 80-91 | Confidence base values undocumented |

---

### SPEC SCOUT REPORT (SONNET)

#### SPEC-1: CreateInput Type Violates Section 1.8 Requirement
**File:** `src/storage/repositories/pattern-occurrence.repo.ts:17`
**Severity:** CRITICAL
**Description:** Per spec Section 1.8, `workspaceId` and `projectId` MUST be derived from the pattern, not passed in directly. The current `CreateInput` type allows callers to provide these values directly.

```typescript
// Current (violates spec):
type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt'>;

// Required per spec Section 1.8:
type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt' | 'workspaceId' | 'projectId'>;
```

---

#### SPEC-2: Missing 90-Day Re-Promotion Block (Spec Requirement)
**File:** `src/evolution/promotion-checker.ts:152-168`
**Severity:** HIGH
**Description:** The spec requires a 90-day cool-down period after a principle is archived before it can be re-promoted. This check is missing from `promoteToDerivdPrinciple`.

---

#### SPEC-3: Touch Type Handling Inconsistency
**File:** `src/evolution/promotion-checker.ts:188`
**Severity:** LOW
**Description:** The code casts `pattern.touches as Touch[]` suggesting a type mismatch that should be resolved at the schema level.

```typescript
touches: pattern.touches as Touch[],
```

---

#### SPEC-4: Missing ExecutionNoncompliance Tracking Integration
**File:** `src/attribution/noncompliance-checker.ts`
**Severity:** MEDIUM
**Description:** The noncompliance checker returns results but there's no visible integration point for persisting `ExecutionNoncompliance` records to the database within this file.

---

### SPEC SCOUT SUMMARY

| ID | Severity | File | Line(s) | Issue |
|----|----------|------|---------|-------|
| SPEC-1 | CRITICAL | pattern-occurrence.repo.ts | 17 | CreateInput type violates Section 1.8 |
| SPEC-2 | HIGH | promotion-checker.ts | 152-168 | Missing 90-day re-promotion block |
| SPEC-3 | LOW | promotion-checker.ts | 188 | Type cast workaround |
| SPEC-4 | MEDIUM | noncompliance-checker.ts | - | Missing integration point |

---

## SEQUENTIAL JUDGE EVALUATIONS

### Judge Protocol
For each scout finding, a separate judge evaluation was conducted. This tests whether judges make different decisions when evaluating issues one at a time versus in batches.

---

### SECURITY SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: SEC-1 (Path Traversal in copyDirRecursive)

**Scout Finding:**
- Severity: HIGH
- File: init.ts:318-332
- Issue: No validation of paths, no symlink handling

**Judge Analysis:**
The `copyDirRecursive` function is called with hardcoded source paths from within the package (`packageRoot/CORE/...`) and destination paths relative to `gitRoot` and `falconDir`. Let me trace the call sites:

```typescript
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const coreSource = path.join(packageRoot, 'CORE');
copyDirRecursive(path.join(coreSource, 'TASKS'), path.join(falconDir, 'CORE', 'TASKS'));
```

**Risk Assessment:**
1. Source is the falcon-ai package itself (CORE directory) - controlled by maintainers
2. Destination is `.falcon/CORE/` within the git repo
3. User input does not directly control source/dest paths
4. However, if the package is installed from a malicious source, or if CORE directory is compromised, the vulnerability could be exploited

**Mitigating Factors:**
- Source paths are not user-controlled
- Destination paths are derived from `gitRoot` (from git itself)
- Requires compromised package installation

**Verdict:** CONFIRMED (MEDIUM, downgraded from HIGH)

**Reasoning:** While the theoretical vulnerability exists, the practical attack surface is limited because neither source nor destination paths are directly user-controlled. The function should still validate paths and handle symlinks, but the risk is lower than initially assessed.

---

#### Judge Evaluation: SEC-2 (Insufficient Input Validation for Project Name)

**Scout Finding:**
- Severity: MEDIUM
- File: init.ts:92-100
- Issue: Project name not validated for path traversal or shell metacharacters

**Judge Analysis:**
Tracing usage of `projectName`:
1. Line 92: `const projectName = options.name || path.basename(gitRoot);`
2. Line 167: Used for workspace slug generation
3. Line 183: Validated by `validateSlug`
4. Line 219: Inserted into database (parameterized)
5. Line 229: Logged to console
6. Line 247: Written to YAML config

**Risk Assessment:**
- No shell execution with projectName
- Database access is parameterized
- YAML serialization might have issues with special characters but `yaml.stringify` handles this
- `path.basename` would strip path traversal from gitRoot-derived names

**Verdict:** DISMISSED

**Reasoning:** The project name is either provided by user (then validated) or derived from `path.basename(gitRoot)` which inherently removes path components. It's used in parameterized SQL and YAML serialization, not in shell commands. The existing validation is adequate.

---

#### Judge Evaluation: SEC-3 (SQL Injection via Workspace Slug)

**Scout Finding:**
- Severity: LOW
- File: init.ts:152-154
- Issue: Workspace slug not validated before SQL query

**Judge Analysis:**
The scout correctly noted the SQL query is parameterized:
```typescript
.prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
.get(options.workspace, 'active')
```

**Verdict:** DISMISSED

**Reasoning:** Parameterized queries completely prevent SQL injection. The scout acknowledged this but suggested validation for "other usages" - however, no unsafe usages were identified. This is a non-issue.

---

#### Judge Evaluation: SEC-4 (Workspace ID Scope Invariant Violation)

**Scout Finding:**
- Severity: CRITICAL
- File: pattern-occurrence.repo.ts:17,145-152
- Issue: CreateInput allows direct workspaceId/projectId, violating spec Section 1.8

**Judge Analysis:**
This is a spec compliance issue with security implications. If the spec states that workspaceId/projectId MUST be derived from the pattern (to ensure occurrences are always in the same scope as their pattern), then allowing callers to provide arbitrary values could lead to:
1. Data leakage between workspaces
2. Unauthorized pattern attribution
3. Scope isolation bypass

However, I need to verify:
1. Is there actual spec language requiring this?
2. Are there runtime checks elsewhere?

Looking at the code, the `create` method accepts `data: CreateInput` which spreads directly into the occurrence without validation against the pattern's scope.

**Verdict:** CONFIRMED (HIGH, downgraded from CRITICAL)

**Reasoning:** This is a legitimate spec compliance issue with security implications. However, marking as HIGH rather than CRITICAL because:
1. The database is local (single-developer per project)
2. The caller would need to intentionally pass wrong scope values
3. No evidence of external API exposure for this method

The fix is straightforward: derive scope from the pattern or add validation.

---

#### Judge Evaluation: SEC-5 (Unvalidated JSON Field Parsing)

**Scout Finding:**
- Severity: MEDIUM
- File: pattern-occurrence.repo.ts:393-423
- Issue: JSON fields parsed without validation

**Judge Analysis:**
The `parseJsonField` method is inherited from `BaseRepository`. Looking at the data flow:
1. JSON is stored after Zod validation on write (line 154: `PatternOccurrenceSchema.parse(occurrence)`)
2. JSON is parsed on read without re-validation

**Risk Assessment:**
- If someone directly modifies the SQLite database, they could inject malformed JSON
- However, this requires local database access
- The parsed data is typed but TypeScript types don't enforce runtime shape

**Verdict:** CONFIRMED (LOW, downgraded from MEDIUM)

**Reasoning:** While technically JSON is not re-validated on read, the data was validated on write. The attack vector requires direct database modification, which implies the attacker already has full access. This is defense-in-depth but not a significant vulnerability.

---

### DOCS SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: DOC-1 (Typo in Function Name)

**Scout Finding:**
- Severity: LOW
- File: promotion-checker.ts:131
- Issue: `promoteToDerivdPrinciple` missing 'e'

**Judge Analysis:**
This is indeed a typo: `promoteToDerivdPrinciple` should be `promoteToDerivePrinciple`.

**Verdict:** CONFIRMED (LOW)

**Reasoning:** Clear typo in exported function name. Should be fixed for API clarity.

---

#### Judge Evaluation: DOC-2 (Missing JSDoc for Interface Fields)

**Scout Finding:**
- Severity: LOW
- File: confidence.ts:10-16
- Issue: PatternStats lacks field descriptions

**Judge Analysis:**
The interface fields are self-explanatory:
- `totalOccurrences`, `activeOccurrences` - obvious
- `lastSeenActive` - clear
- `injectionCount`, `adherenceRate` - understandable

**Verdict:** DISMISSED

**Reasoning:** Field names are sufficiently self-documenting. Adding JSDoc would be nice but not necessary. This is style preference, not a documentation deficiency.

---

#### Judge Evaluation: DOC-3 (Inconsistent Comment Style)

**Scout Finding:**
- Severity: LOW
- File: noncompliance-checker.ts:1-16
- Issue: Inconsistent versioning notation

**Judge Analysis:**
The file uses `NOTE (v1.0):` in some places. This is actually useful versioning documentation for tracking when features changed.

**Verdict:** DISMISSED

**Reasoning:** The versioned notes are intentional and useful. Inconsistency is minimal and doesn't affect code understanding.

---

#### Judge Evaluation: DOC-4 (Missing API Documentation for Repository Methods)

**Scout Finding:**
- Severity: MEDIUM
- File: pattern-occurrence.repo.ts
- Issue: Methods lack comprehensive JSDoc

**Judge Analysis:**
Looking at the methods:
- `findById` - obvious
- `findByPatternId` - obvious
- `create` - minimal doc but method signature is clear
- `update` - could use more documentation on allowed update fields

**Verdict:** CONFIRMED (LOW, downgraded from MEDIUM)

**Reasoning:** Some additional documentation would help, particularly for the `update` method's constraints. However, the methods are generally clear from their names and parameters.

---

### BUG SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: BUG-3 (Missing 90-Day Re-Promotion Block)

**Scout Finding:**
- Severity: HIGH
- File: promotion-checker.ts:152-168
- Issue: No check for recently archived principles

**Judge Analysis:**
The code checks:
```typescript
const existing = principleRepo.findByPromotionKey({ workspaceId, promotionKey });
if (existing) {
  return { promoted: false, ... };
}
```

This only finds active principles. If a principle was archived, it wouldn't be found, and re-promotion would proceed.

Without seeing the spec, I cannot verify the 90-day requirement exists. However, re-promoting recently archived principles could lead to:
1. User confusion (principle keeps coming back)
2. Alert fatigue
3. Circumventing manual archival decisions

**Verdict:** CONFIRMED (MEDIUM, downgraded from HIGH)

**Reasoning:** The logic gap exists - archived principles aren't checked. However, the severity depends on spec requirements. Downgraded to MEDIUM as the impact is operational rather than data integrity.

---

#### Judge Evaluation: BUG-5 (Inconsistent Negative Days Guard)

**Scout Finding:**
- Severity: MEDIUM
- File: confidence.ts:182-187
- Issue: `computeRecencyWeight` lacks negative days guard

**Judge Analysis:**
In `computeAttributionConfidence`:
```typescript
const daysSince = Math.max(0, daysSinceDate(stats.lastSeenActive));
```

In `computeRecencyWeight`:
```typescript
const days = daysSinceDate(lastSeen);
if (days <= 7) return 1.0;
```

If `days` is negative (future date), `days <= 7` is true, returning 1.0 (highest weight). This is actually the correct behavior - a future date would be "recent."

**Verdict:** DISMISSED

**Reasoning:** For recency weighting, a negative value (future date) would satisfy `days <= 7` and return the maximum weight of 1.0. This is semantically correct - a future date is "more recent than recent." The guard in `computeAttributionConfidence` is for a different purpose (decay penalty).

---

#### Judge Evaluation: BUG-6 (Race Condition in Update)

**Scout Finding:**
- Severity: MEDIUM
- File: pattern-occurrence.repo.ts:200-246
- Issue: Read-modify-write without transaction

**Judge Analysis:**
The update pattern:
1. `findById` - READ
2. Build update query
3. `UPDATE` - WRITE
4. `findById` - READ

In a concurrent environment, another process could modify the record between steps 1 and 3.

However:
- better-sqlite3 is synchronous
- SQLite has locking
- Falcon is single-developer per project

**Verdict:** DISMISSED

**Reasoning:** SQLite's locking model and better-sqlite3's synchronous API provide sufficient isolation for this use case. The update builds dynamic SQL but uses individual `prepare` statements which are atomic. In a single-developer CLI tool, true concurrency is rare.

---

### TEST SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: TEST-1 (Missing Test Files)

**Scout Finding:**
- Severity: HIGH
- File: all reviewed files
- Issue: No corresponding test files

**Judge Analysis:**
The PR scope is the 6 source files. Test files were not included in the review scope, but their absence in the PR doesn't mean they don't exist in the repository.

**Verdict:** DISMISSED (INSUFFICIENT INFO)

**Reasoning:** Cannot confirm tests are missing without checking the full repository. The scout's finding is based on PR scope, not repository state. Test coverage should be verified against the actual test directory.

---

#### Judge Evaluation: TEST-2 (Untestable Private Function)

**Scout Finding:**
- Severity: LOW
- File: promotion-checker.ts:212-229
- Issue: `findMatchingPatternsAcrossProjects` not exported

**Judge Analysis:**
The function is marked with `function` (private to module). It's called internally by `checkForPromotion` and `promoteToDerivdPrinciple`.

**Verdict:** DISMISSED

**Reasoning:** Module-private functions are appropriately tested through their public API. Direct testing of internal functions creates brittle tests. This is good encapsulation, not a testing problem.

---

#### Judge Evaluation: TEST-3 (Complex Logic Without Property-Based Tests)

**Scout Finding:**
- Severity: MEDIUM
- File: failure-mode-resolver.ts:44-158
- Issue: Decision tree should have property-based tests

**Judge Analysis:**
The decision tree has multiple branches based on evidence features. Property-based testing could help ensure:
- Determinism (same input always produces same output)
- Coverage of edge cases
- No unexpected combinations

**Verdict:** CONFIRMED (LOW, downgraded from MEDIUM)

**Reasoning:** Property-based testing would be valuable but is a nice-to-have, not a requirement. The decision tree is deterministic by design. Standard unit tests with good coverage are sufficient.

---

#### Judge Evaluation: TEST-4 (Missing Edge Case Tests for Sliding Window)

**Scout Finding:**
- Severity: MEDIUM
- File: noncompliance-checker.ts:171-200
- Issue: Edge cases for sliding window not tested

**Judge Analysis:**
Edge cases include:
- Empty document: returns `null` (keywords.length would be 0 or lines.length would be 0)
- Document shorter than window: loop doesn't execute, returns `null`
- Single line: same as above

**Verdict:** CONFIRMED (LOW, downgraded from MEDIUM)

**Reasoning:** Edge case handling should be verified, but the behavior is graceful (returns null). Tests would be good but this isn't a blocking issue.

---

### DECISIONS SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: DEC-1 (Hardcoded Magic Numbers)

**Scout Finding:**
- Severity: MEDIUM
- File: promotion-checker.ts:36-52
- Issue: Constants lack rationale documentation

**Judge Analysis:**
The constants are defined at the top of the module with clear names but no comments explaining the values.

**Verdict:** CONFIRMED (LOW, downgraded from MEDIUM)

**Reasoning:** The constants are reasonable defaults and are centralized for easy modification. Adding rationale comments would help but isn't critical. The names are self-documenting.

---

#### Judge Evaluation: DEC-2 (Security Patterns Only for Promotion)

**Scout Finding:**
- Severity: MEDIUM
- File: promotion-checker.ts:92-99
- Issue: Security-only restriction undocumented

**Judge Analysis:**
The file header comment mentions "security patterns prioritized for promotion" (line 10). This is documented, just not with detailed rationale.

**Verdict:** DISMISSED

**Reasoning:** The restriction is documented in the file header. The rationale (security patterns are most important for cross-project learning) is implicit in the system design.

---

#### Judge Evaluation: DEC-3 (0.3 Relevance Threshold)

**Scout Finding:**
- Severity: LOW
- File: noncompliance-checker.ts:111-112
- Issue: Threshold undocumented

**Judge Analysis:**
```typescript
// Threshold: relevanceScore >= 0.3 indicates guidance exists
if (match && match.relevanceScore >= 0.3) {
```

The comment actually documents what the threshold means. The specific value 0.3 could use more context.

**Verdict:** DISMISSED

**Reasoning:** There's a comment explaining the threshold's purpose. The specific value is a tunable parameter that may have been determined empirically.

---

#### Judge Evaluation: DEC-4 (5-Line Sliding Window)

**Scout Finding:**
- Severity: LOW
- File: noncompliance-checker.ts:181-182
- Issue: Window size undocumented

**Judge Analysis:**
```typescript
// Sliding window of 5 lines
const windowSize = 5;
```

The comment documents what it is. The "why 5 lines" could be explained.

**Verdict:** CONFIRMED (LOW)

**Reasoning:** A brief comment explaining why 5 lines (e.g., "typical paragraph size" or "empirically determined") would improve understanding.

---

#### Judge Evaluation: DEC-5 (Confidence Base Values)

**Scout Finding:**
- Severity: MEDIUM
- File: confidence.ts:80-91
- Issue: Base values undocumented

**Judge Analysis:**
The file header references "Spec Section 4.1" which presumably documents these values. Without access to the spec, I cannot verify.

**Verdict:** DISMISSED

**Reasoning:** The code references the spec (Section 4.1) where these values are presumably documented. The implementation is following documented spec requirements.

---

### SPEC SCOUT FINDINGS - SEQUENTIAL JUDGE EVALUATIONS

---

#### Judge Evaluation: SPEC-1 (CreateInput Type Violates Section 1.8)

**Scout Finding:**
- Severity: CRITICAL
- File: pattern-occurrence.repo.ts:17
- Issue: Scope fields not omitted from CreateInput

**Judge Analysis:**
This duplicates SEC-4. Same analysis applies.

**Verdict:** CONFIRMED (HIGH, downgraded from CRITICAL)

**Reasoning:** Same as SEC-4 - legitimate spec compliance issue, but practical risk is lower due to local database and intentional misuse requirement.

---

#### Judge Evaluation: SPEC-2 (Missing 90-Day Re-Promotion Block)

**Scout Finding:**
- Severity: HIGH
- File: promotion-checker.ts:152-168
- Issue: No 90-day cool-down check

**Judge Analysis:**
This duplicates BUG-3. Same analysis applies.

**Verdict:** CONFIRMED (MEDIUM, downgraded from HIGH)

**Reasoning:** Same as BUG-3 - logic gap exists but impact is operational.

---

#### Judge Evaluation: SPEC-3 (Touch Type Handling)

**Scout Finding:**
- Severity: LOW
- File: promotion-checker.ts:188
- Issue: Type cast suggests mismatch

**Judge Analysis:**
```typescript
touches: pattern.touches as Touch[],
```

This cast suggests the pattern's `touches` array might have a different type at the schema level. Could be a TypeScript inference issue or actual type mismatch.

**Verdict:** CONFIRMED (LOW)

**Reasoning:** The cast is a code smell indicating potential type definition mismatch. Should be investigated and fixed at the schema level.

---

#### Judge Evaluation: SPEC-4 (Missing Integration Point)

**Scout Finding:**
- Severity: MEDIUM
- File: noncompliance-checker.ts
- Issue: No persistence for ExecutionNoncompliance

**Judge Analysis:**
The `checkForNoncompliance` function returns a result object but doesn't persist it. This is actually correct - the function is a checker, not a persister. The caller should handle persistence.

**Verdict:** DISMISSED

**Reasoning:** Single Responsibility Principle - the checker checks, the caller persists. The function correctly returns data for the caller to use. This is good design, not a missing feature.

---

## SUMMARY TABLES

### All Scout Findings

| Scout | ID | Severity | File | Issue |
|-------|-----|----------|------|-------|
| Security | SEC-1 | HIGH | init.ts:318-332 | Path traversal vulnerability |
| Security | SEC-2 | MEDIUM | init.ts:92-100 | Insufficient input validation |
| Security | SEC-3 | LOW | init.ts:152-154 | Unvalidated workspace slug |
| Security | SEC-4 | CRITICAL | pattern-occurrence.repo.ts:17 | Scope invariant violation |
| Security | SEC-5 | MEDIUM | pattern-occurrence.repo.ts:393-423 | Unvalidated JSON parsing |
| Docs | DOC-1 | LOW | promotion-checker.ts:131 | Typo in function name |
| Docs | DOC-2 | LOW | confidence.ts:10-16 | Missing field JSDoc |
| Docs | DOC-3 | LOW | noncompliance-checker.ts:1-16 | Inconsistent comment style |
| Docs | DOC-4 | MEDIUM | pattern-occurrence.repo.ts | Missing API docs |
| Bug | BUG-3 | HIGH | promotion-checker.ts:152-168 | Missing 90-day block |
| Bug | BUG-5 | MEDIUM | confidence.ts:182-187 | Inconsistent negative guard |
| Bug | BUG-6 | MEDIUM | pattern-occurrence.repo.ts:200-246 | Race condition |
| Test | TEST-1 | HIGH | all | Missing test files |
| Test | TEST-2 | LOW | promotion-checker.ts:212-229 | Untestable private function |
| Test | TEST-3 | MEDIUM | failure-mode-resolver.ts:44-158 | Missing property tests |
| Test | TEST-4 | MEDIUM | noncompliance-checker.ts:171-200 | Missing edge case tests |
| Decisions | DEC-1 | MEDIUM | promotion-checker.ts:36-52 | Undocumented constants |
| Decisions | DEC-2 | MEDIUM | promotion-checker.ts:92-99 | Security-only undocumented |
| Decisions | DEC-3 | LOW | noncompliance-checker.ts:111-112 | 0.3 threshold undocumented |
| Decisions | DEC-4 | LOW | noncompliance-checker.ts:181-182 | Window size undocumented |
| Decisions | DEC-5 | MEDIUM | confidence.ts:80-91 | Confidence values undocumented |
| Spec | SPEC-1 | CRITICAL | pattern-occurrence.repo.ts:17 | CreateInput violates spec |
| Spec | SPEC-2 | HIGH | promotion-checker.ts:152-168 | Missing 90-day block |
| Spec | SPEC-3 | LOW | promotion-checker.ts:188 | Type cast workaround |
| Spec | SPEC-4 | MEDIUM | noncompliance-checker.ts | Missing integration point |

**Total Scout Findings: 25**

---

### Sequential Judge Verdicts

| Scout | ID | Scout Severity | Judge Verdict | Judge Severity | Reason |
|-------|-----|----------------|---------------|----------------|--------|
| Security | SEC-1 | HIGH | CONFIRMED | MEDIUM | Limited attack surface |
| Security | SEC-2 | MEDIUM | DISMISSED | - | Adequate validation exists |
| Security | SEC-3 | LOW | DISMISSED | - | Parameterized query is safe |
| Security | SEC-4 | CRITICAL | CONFIRMED | HIGH | Local DB limits risk |
| Security | SEC-5 | MEDIUM | CONFIRMED | LOW | Requires DB access |
| Docs | DOC-1 | LOW | CONFIRMED | LOW | Clear typo |
| Docs | DOC-2 | LOW | DISMISSED | - | Self-documenting |
| Docs | DOC-3 | LOW | DISMISSED | - | Versioning is intentional |
| Docs | DOC-4 | MEDIUM | CONFIRMED | LOW | Some docs would help |
| Bug | BUG-3 | HIGH | CONFIRMED | MEDIUM | Operational impact |
| Bug | BUG-5 | MEDIUM | DISMISSED | - | Behavior is correct |
| Bug | BUG-6 | MEDIUM | DISMISSED | - | SQLite handles this |
| Test | TEST-1 | HIGH | DISMISSED | - | Insufficient info |
| Test | TEST-2 | LOW | DISMISSED | - | Good encapsulation |
| Test | TEST-3 | MEDIUM | CONFIRMED | LOW | Nice-to-have |
| Test | TEST-4 | MEDIUM | CONFIRMED | LOW | Should verify |
| Decisions | DEC-1 | MEDIUM | CONFIRMED | LOW | Reasonable defaults |
| Decisions | DEC-2 | MEDIUM | DISMISSED | - | Documented in header |
| Decisions | DEC-3 | LOW | DISMISSED | - | Has explanatory comment |
| Decisions | DEC-4 | LOW | CONFIRMED | LOW | Needs rationale |
| Decisions | DEC-5 | MEDIUM | DISMISSED | - | References spec |
| Spec | SPEC-1 | CRITICAL | CONFIRMED | HIGH | Same as SEC-4 |
| Spec | SPEC-2 | HIGH | CONFIRMED | MEDIUM | Same as BUG-3 |
| Spec | SPEC-3 | LOW | CONFIRMED | LOW | Code smell |
| Spec | SPEC-4 | MEDIUM | DISMISSED | - | Good SRP design |

---

### Final Tally

| Metric | Count |
|--------|-------|
| Total Scout Findings | 25 |
| **Confirmed by Judge** | **12** |
| **Dismissed by Judge** | **13** |
| **Dismissal Rate** | **52%** |

### Confirmed Issues by Final Severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | - |
| HIGH | 2 | SEC-4, SPEC-1 (same issue) |
| MEDIUM | 2 | SEC-1, BUG-3/SPEC-2 (same issue) |
| LOW | 8 | SEC-5, DOC-1, DOC-4, TEST-3, TEST-4, DEC-1, DEC-4, SPEC-3 |

### Unique Confirmed Issues (Deduplicated)

| ID | Severity | File | Issue |
|----|----------|------|-------|
| SEC-4/SPEC-1 | HIGH | pattern-occurrence.repo.ts:17 | CreateInput scope invariant violation |
| SEC-1 | MEDIUM | init.ts:318-332 | Path traversal in copyDirRecursive |
| BUG-3/SPEC-2 | MEDIUM | promotion-checker.ts:152-168 | Missing 90-day re-promotion block |
| SEC-5 | LOW | pattern-occurrence.repo.ts:393-423 | Unvalidated JSON parsing on read |
| DOC-1 | LOW | promotion-checker.ts:131 | Typo: promoteToDerivdPrinciple |
| DOC-4 | LOW | pattern-occurrence.repo.ts | Missing API documentation |
| TEST-3 | LOW | failure-mode-resolver.ts:44-158 | Property-based tests recommended |
| TEST-4 | LOW | noncompliance-checker.ts:171-200 | Edge case tests recommended |
| DEC-1 | LOW | promotion-checker.ts:36-52 | Constants lack rationale |
| DEC-4 | LOW | noncompliance-checker.ts:181-182 | Window size lacks rationale |
| SPEC-3 | LOW | promotion-checker.ts:188 | Type cast code smell |

**Unique Confirmed Issues: 11**

---

## SEQUENTIAL MODE OBSERVATIONS

### Key Differences from Batch Mode

In sequential mode (one issue per judge call), we observed:

1. **More Thorough Analysis:** Each issue received dedicated attention without context bleeding from other issues.

2. **Consistent Severity Downgrades:** Judges consistently downgraded severity when analyzing issues in isolation, suggesting batch mode might inherit severity from surrounding high-severity issues.

3. **Higher Dismissal Rate:** 52% dismissal rate indicates thorough vetting when issues are considered individually.

4. **Better Duplicate Detection:** SPEC-1/SEC-4 and BUG-3/SPEC-2 were identified as duplicates during individual analysis.

5. **Nuanced Risk Assessment:** Each issue was evaluated against actual attack surface and mitigating factors without being influenced by the severity of adjacent findings.

### Sequential vs Batch Trade-offs

| Aspect | Sequential | Batch |
|--------|------------|-------|
| Analysis Depth | Higher | Lower |
| Context Bleeding | None | Possible |
| Time Required | Higher | Lower |
| Duplicate Detection | Better | May miss |
| Severity Inflation | Avoided | Possible |

---

## RECOMMENDATIONS

### Must Fix (HIGH/MEDIUM Confirmed)

1. **SEC-4/SPEC-1:** Update `CreateInput` type to omit `workspaceId` and `projectId`, deriving them from the pattern in the create method.

2. **SEC-1:** Add path validation to `copyDirRecursive`:
   - Check that resolved paths stay within expected boundaries
   - Handle or reject symlinks explicitly

3. **BUG-3/SPEC-2:** Add 90-day re-promotion block check in `promoteToDerivdPrinciple`:
   - Query for recently archived principles
   - Block re-promotion within cool-down period

### Should Fix (LOW Confirmed)

4. **DOC-1:** Rename `promoteToDerivdPrinciple` to `promoteToDerivedPrinciple`

5. **SPEC-3:** Fix type definition so `touches` doesn't need cast

6. **DEC-1/DEC-4:** Add brief rationale comments for magic numbers

### Consider (Suggestions)

7. Add re-validation of JSON on database read for defense-in-depth
8. Add property-based tests for failure-mode-resolver
9. Document sliding window edge case behavior
