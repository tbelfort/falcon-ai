# Code Review Report: Test E1 Run 2

**Review Date**: 2026-01-21
**Reviewer**: Claude Opus (Full Analysis)
**Files Reviewed**: 6

---

## 1. Scout Analysis (10 Domain Passes)

### Pass 1: Security-General

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S1-SEC-001 | init.ts | 167 | Slug generation with `replace(/[^a-z0-9_]/g, '-')` may produce slugs starting/ending with hyphens (e.g., "--project--") | LOW |
| S1-SEC-002 | pattern-occurrence.repo.ts | 243 | SQL query built with string interpolation for UPDATE statement - while parameterized, the column names in `updates.join(', ')` are hardcoded and safe | INFO |

**Already Identified**: H-SEC-001, H-SEC-002, H-SEC-003 cover the main security issues.

### Pass 2: Security-Path

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S2-PATH-001 | init.ts | 254 | `import.meta.dirname` path resolution could be affected by symlinked package installation | LOW |

**Already Identified**: H-SEC-002 covers the main path traversal issue.

### Pass 3: Logic-Core

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S3-LOG-001 | failure-mode-resolver.ts | 56-73 | Step A logic: When `hasCitation=true` and `sourceRetrievable=true` but `sourceAgreesWithCarrier` is `undefined/null`, the check passes silently - only explicit `false` triggers synthesis drift | MEDIUM |
| S3-LOG-002 | failure-mode-resolver.ts | 105,113 | Ambiguity/incompleteness comparison uses `>` not `>=`, creating implicit precedence when scores are equal (defaults to Step E) | LOW |
| S3-LOG-003 | promotion-checker.ts | 103-109 | `findMatchingPatternsAcrossProjects` called twice in `checkForPromotion` and `promoteToDerivdPrinciple` - redundant computation | LOW |
| S3-LOG-004 | noncompliance-checker.ts | 109 | `contextPackMatch || specMatch` prefers context pack match over spec match regardless of relevance score - should compare scores | MEDIUM |

**Already Identified**: H-LOG-001, H-LOG-003, H-LOG-005 cover other logic issues.

### Pass 4: Logic-Edge

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S4-EDGE-001 | confidence.ts | 46-48 | Date sorting with `getTime()` on potentially invalid dates - if `createdAt` contains invalid date string, `getTime()` returns NaN causing unpredictable sort order | LOW |
| S4-EDGE-002 | pattern-occurrence.repo.ts | 401 | `prNumber` cast as number but SQLite may return it as string in some edge cases | LOW |
| S4-EDGE-003 | promotion-checker.ts | 256-258 | `findByPatternId` is called with non-standard signature - passes object but function expects string in some implementations | MEDIUM |

**Already Identified**: S-LOG-002, S-LOG-005 cover related edge cases.

### Pass 5: Decisions-Thresholds

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S5-TH-001 | noncompliance-checker.ts | 189 | Hardcoded `windowSize = 5` for sliding window - may miss relevant context in longer documents | LOW |
| S5-TH-002 | noncompliance-checker.ts | 189,193 | Window size of 5 combined with 2-keyword minimum could miss relevant single-line guidance with high keyword density | LOW |
| S5-TH-003 | confidence.ts | 102-103 | 90-day half-life and 0.15 max penalty are undocumented magic numbers | LOW |
| S5-TH-004 | confidence.ts | 157 | Relevance weight cap of 1.5 is undocumented | LOW |
| S5-TH-005 | confidence.ts | 166 | Cross-project penalty of 0.05 (0.95 multiplier) is documented in comment but not as constant | LOW |

**Already Identified**: H-UND-001 through H-UND-004 cover magic numbers.

### Pass 6: Decisions-Architecture

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S6-ARCH-001 | promotion-checker.ts | 61-62,171-172 | Repository instantiation inside functions - should be injected for testability | LOW |
| S6-ARCH-002 | failure-mode-resolver.ts | 44-158 | `resolveFailureMode` has multiple early returns making it hard to trace full decision path | INFO |
| S6-ARCH-003 | confidence.ts | 21-30 | `OccurrenceRepoLike` interface has different signature than actual repository (takes object vs string) | MEDIUM |

### Pass 7: Documentation-API

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S7-DOC-001 | failure-mode-resolver.ts | 102-104 | `calculateAmbiguityScore` and `calculateIncompletenessScore` are not exported but would be useful for testing | LOW |
| S7-DOC-002 | noncompliance-checker.ts | 209-228 | `analyzePossibleCauses` is not documented in JSDoc despite being key decision logic | LOW |

### Pass 8: Documentation-Internal

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S8-DOC-001 | pattern-occurrence.repo.ts | 200-246 | `update()` method lacks warning comment about violating append-only principle | LOW |
| S8-DOC-002 | confidence.ts | 93-96 | Occurrence boost formula differs from JSDoc comment - code says `(activeOccurrences - 1)` but comment example doesn't clarify first occurrence = 0 boost | LOW |

**Already Identified**: H-SPC-001 covers the update() violation.

### Pass 9: Spec-Compliance

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S9-SPC-001 | promotion-checker.ts | 182-195 | `promoteToDerivdPrinciple` sets `permanent: false` for all derived principles - spec may require security patterns to be permanent | MEDIUM |
| S9-SPC-002 | confidence.ts | 119-121 | `_crossProjectPenalty` marker uses underscore convention suggesting internal/private but is part of exported type | LOW |
| S9-SPC-003 | pattern-occurrence.repo.ts | 216-218 | `patternId` can be updated after creation - this may violate occurrence immutability beyond status changes | MEDIUM |

**Already Identified**: H-SPC-001, H-SPC-002 cover other spec compliance issues.

### Pass 10: Coverage-Critical

| ID | File | Lines | Finding | Severity |
|----|------|-------|---------|----------|
| S10-COV-001 | failure-mode-resolver.ts | 44-158 | `resolveFailureMode` has no error handling for malformed EvidenceBundle | MEDIUM |
| S10-COV-002 | noncompliance-checker.ts | 84-133 | `checkForNoncompliance` doesn't validate input structure | LOW |
| S10-COV-003 | promotion-checker.ts | 275-329 | `checkWorkspaceForPromotions` has no pagination for large workspaces | LOW |

**Already Identified**: H-COV-001 covers init command testing.

---

## 2. Sonnet-Style Deep Analysis

### Deep Issue 1: Interface Mismatch in OccurrenceRepoLike (S6-ARCH-003 / S4-EDGE-003)

**Location**: `confidence.ts:21-30` and `promotion-checker.ts:256-258`

**Analysis**: The `OccurrenceRepoLike` interface defines `findByPatternId(id: string)` taking a simple string, but the actual `PatternOccurrenceRepository.findByPatternId` method takes an object `{ workspaceId: string; patternId: string }`. This mismatch is worked around in `promotion-checker.ts:256-258` by passing an inline implementation:

```typescript
const stats = computePatternStats(pattern.id, {
  findByPatternId: () => occurrences,
});
```

This creates a closure that ignores the `id` parameter entirely, making the interface misleading. If someone were to use `OccurrenceRepoLike` expecting it to match the real repository, they would get runtime errors.

**Severity**: MEDIUM
**Category**: Architecture/Type Safety

### Deep Issue 2: Preference for Context Pack Over Spec Regardless of Score (S3-LOG-004)

**Location**: `noncompliance-checker.ts:109`

**Analysis**: The code uses `contextPackMatch || specMatch` which always prefers the context pack match even if the spec has a higher relevance score. Consider:
- Context pack match: relevanceScore = 0.31
- Spec match: relevanceScore = 0.95

The current code would return the context pack match with 0.31 score, even though the spec has much higher confidence. This could lead to incorrect `violatedGuidanceStage` attribution, marking it as 'context-pack' when the actual violated guidance was in the spec.

**Severity**: MEDIUM
**Category**: Logic

### Deep Issue 3: Silent Pass on Undefined sourceAgreesWithCarrier (S3-LOG-001)

**Location**: `failure-mode-resolver.ts:56-73`

**Analysis**: The synthesis drift check at Step A only triggers when `sourceAgreesWithCarrier === false`. If the attribution agent fails to set this field (leaving it `undefined`), or if there's an error during source comparison, the check passes silently and the flow continues to other steps. This could miss actual synthesis drift cases.

The code should likely handle the undefined case explicitly:
- If `hasCitation && sourceRetrievable && sourceAgreesWithCarrier === undefined`, this is suspicious and should either flag as suspected drift or return an error.

**Severity**: MEDIUM
**Category**: Logic/Robustness

### Deep Issue 4: patternId Mutation in update() Beyond Status (S9-SPC-003)

**Location**: `pattern-occurrence.repo.ts:216-218`

**Analysis**: The `update()` method allows changing the `patternId` field:

```typescript
if (options.patternId !== undefined) {
  updates.push('pattern_id = ?');
  params.push(options.patternId);
}
```

This goes beyond the already-identified H-SPC-001 issue (which focuses on the append-only principle for status changes). Allowing `patternId` mutation means an occurrence can be reassigned to a different pattern after creation, which could corrupt the provenance chain and invalidate confidence calculations that depend on occurrence counts.

Per the spec, occurrences should be immutable records with append-only semantics. The ability to change `patternId` violates this more severely than status changes.

**Severity**: MEDIUM
**Category**: Spec Compliance

### Deep Issue 5: Derived Principle `permanent` Flag Always False (S9-SPC-001)

**Location**: `promotion-checker.ts:192-193`

**Analysis**: When promoting a pattern to a derived principle, the code always sets `permanent: false`:

```typescript
const principle = principleRepo.create({
  ...
  permanent: false,
  ...
});
```

However, the promotion criteria (lines 93-99) only allow security patterns to be promoted. If security patterns warrant enough concern to be the only category eligible for promotion, they might also warrant being marked as permanent to prevent decay. The spec should clarify whether derived principles from security patterns should be permanent.

**Severity**: LOW
**Category**: Design Decision

### Deep Issue 6: No Validation of EvidenceBundle Structure (S10-COV-001)

**Location**: `failure-mode-resolver.ts:44-158`

**Analysis**: The `resolveFailureMode` function directly accesses properties like `evidence.hasCitation`, `evidence.sourceRetrievable`, `evidence.conflictSignals.length`, etc. without any runtime validation. If an EvidenceBundle is malformed (e.g., `conflictSignals` is undefined instead of an empty array), the function will throw a runtime error.

Given that EvidenceBundle is likely populated by an LLM-based Attribution Agent, malformed data is a realistic concern.

**Severity**: MEDIUM
**Category**: Robustness

---

## 3. Judge Evaluation

### Confirmed Novel Findings

| ID | Original Scout ID | Severity | Verdict | Rationale |
|----|-------------------|----------|---------|-----------|
| **N-LOG-001** | S3-LOG-004 | MEDIUM | CONFIRMED | Context pack vs spec preference regardless of relevance score is a real logic bug affecting attribution accuracy |
| **N-LOG-002** | S3-LOG-001 | MEDIUM | CONFIRMED | Silent pass on undefined `sourceAgreesWithCarrier` could miss synthesis drift cases |
| **N-SPC-001** | S9-SPC-003 | MEDIUM | CONFIRMED | patternId mutation violates immutability more severely than status changes; distinct from H-SPC-001 |
| **N-ARCH-001** | S6-ARCH-003 + S4-EDGE-003 | MEDIUM | CONFIRMED | OccurrenceRepoLike interface mismatch creates type safety issues and misleading API |
| **N-ROB-001** | S10-COV-001 | MEDIUM | CONFIRMED | No validation of EvidenceBundle structure risks runtime errors from LLM-generated data |
| **N-UND-001** | S5-TH-003 + S5-TH-004 + S5-TH-005 | LOW | CONFIRMED | Additional magic numbers beyond those in H-UND-001-004: 90-day half-life, 0.15 max penalty, 1.5 relevance cap, 0.95 cross-project multiplier |

### Dismissed Findings

| ID | Reason |
|----|--------|
| S1-SEC-001 | Edge case slug formatting is cosmetic, not a security issue; H-SEC-003 already covers special chars |
| S1-SEC-002 | INFO level, not a finding |
| S2-PATH-001 | Theoretical issue with symlinked packages; not actionable |
| S3-LOG-002 | Implicit precedence on equal scores is intentional design (defaults to Step E) |
| S3-LOG-003 | Redundant computation is inefficient but not incorrect; minor optimization |
| S4-EDGE-001 | Related to S-LOG-005 (already identified) |
| S4-EDGE-002 | SQLite returns numbers correctly for INTEGER columns |
| S5-TH-001/002 | Window size is reasonable default; would need empirical data to criticize |
| S6-ARCH-001 | Repository instantiation pattern is common; testability concern is minor |
| S6-ARCH-002 | INFO level, not a finding |
| S7-DOC-001/002 | Documentation gaps are low priority |
| S8-DOC-001 | Superseded by H-SPC-001 |
| S8-DOC-002 | Minor documentation inconsistency |
| S9-SPC-002 | Underscore convention is stylistic |
| S9-SPC-001 | Downgraded to design question, not clear spec violation |
| S10-COV-002/003 | Input validation and pagination are nice-to-have |

---

## 4. Opus High Judge Consolidation

### Final Novel Issues (Not Previously Identified)

#### N-LOG-001: Context Pack Preference Over Spec Regardless of Score
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts`
**Lines**: 109
**Severity**: MEDIUM
**Category**: Logic

**Description**: The noncompliance checker uses `contextPackMatch || specMatch` which always prefers the context pack match even when the spec match has a higher relevance score. This could incorrectly attribute violated guidance to the context pack when the actual guidance was in the spec with higher confidence.

**Code**:
```typescript
const match = contextPackMatch || specMatch;
```

**Impact**: Incorrect `violatedGuidanceStage` attribution affects downstream analysis and suggested fixes.

---

#### N-LOG-002: Silent Pass on Undefined sourceAgreesWithCarrier
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/failure-mode-resolver.ts`
**Lines**: 56-73
**Severity**: MEDIUM
**Category**: Logic/Robustness

**Description**: Step A of the failure mode resolver only triggers synthesis drift when `sourceAgreesWithCarrier === false`. If this field is `undefined` (e.g., due to Attribution Agent error), the check passes silently and continues to other steps, potentially missing synthesis drift.

**Code**:
```typescript
if (evidence.hasCitation && evidence.sourceRetrievable) {
  if (evidence.sourceAgreesWithCarrier === false) {  // undefined passes silently
    result.failureMode = 'synthesis_drift';
    ...
  }
}
```

**Impact**: Could misclassify synthesis drift as other failure modes.

---

#### N-SPC-001: patternId Mutation Violates Occurrence Immutability
**File**: `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
**Lines**: 216-218
**Severity**: MEDIUM
**Category**: Spec Compliance

**Description**: The `update()` method allows changing `patternId`, which could reassign an occurrence to a different pattern after creation. This is a more severe violation than status changes (H-SPC-001) because it corrupts the provenance chain and invalidates confidence calculations.

**Code**:
```typescript
if (options.patternId !== undefined) {
  updates.push('pattern_id = ?');
  params.push(options.patternId);
}
```

**Impact**: Corrupts pattern occurrence counts and provenance tracking.

**Note**: This is distinct from H-SPC-001 which focuses on the general update() method; this specifically identifies patternId mutation as a critical immutability violation.

---

#### N-ARCH-001: OccurrenceRepoLike Interface Mismatch
**File**: `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`
**Lines**: 21-30
**Severity**: MEDIUM
**Category**: Architecture/Type Safety

**Description**: The `OccurrenceRepoLike` interface defines `findByPatternId(id: string)` but the actual `PatternOccurrenceRepository.findByPatternId` takes `{ workspaceId: string; patternId: string }`. This mismatch is worked around with closures that ignore the `id` parameter, making the interface misleading.

**Code**:
```typescript
// confidence.ts
export interface OccurrenceRepoLike {
  findByPatternId(id: string): Array<...>;  // Takes string
}

// Actual usage in promotion-checker.ts
const stats = computePatternStats(pattern.id, {
  findByPatternId: () => occurrences,  // Ignores id parameter entirely
});
```

**Impact**: Type safety issues and potential runtime errors if the interface is used directly.

---

#### N-ROB-001: No Validation of EvidenceBundle Structure
**File**: `/Users/tbelfort/Projects/falcon-ai/src/attribution/failure-mode-resolver.ts`
**Lines**: 44-158
**Severity**: MEDIUM
**Category**: Robustness

**Description**: `resolveFailureMode` directly accesses EvidenceBundle properties without validation. If `conflictSignals` is undefined instead of an empty array, or if other required fields are missing, the function will throw runtime errors. Given EvidenceBundle is likely populated by an LLM, malformed data is a realistic concern.

**Code**:
```typescript
if (evidence.conflictSignals.length > 0) {  // Throws if conflictSignals is undefined
```

**Impact**: Unhandled runtime errors from malformed LLM output.

---

#### N-UND-002: Additional Undocumented Magic Numbers in Confidence Calculations
**File**: `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`
**Lines**: 102-103, 157, 166
**Severity**: LOW
**Category**: Understandability

**Description**: Additional magic numbers beyond those identified in H-UND-001-004:
- Line 102: 90 (days for half-life)
- Line 103: 0.15 (max decay penalty)
- Line 157: 1.5 (relevance weight cap)
- Line 166: 0.95 (cross-project multiplier, though commented)

**Impact**: Makes tuning and understanding behavior difficult.

---

## 5. Summary Statistics

| Category | Novel Issues | Previously Identified |
|----------|-------------|----------------------|
| Logic | 2 (N-LOG-001, N-LOG-002) | 4 |
| Spec Compliance | 1 (N-SPC-001) | 2 |
| Architecture | 1 (N-ARCH-001) | 0 |
| Robustness | 1 (N-ROB-001) | 0 |
| Understandability | 1 (N-UND-002) | 4 |
| Security | 0 | 3 |
| Coverage | 0 | 1 |
| **Total Novel** | **6** | **14** |

---

## 6. Validation: Previously Found Issues Also Detected

The following previously-identified issues would have been found by this review:

| Issue ID | Would Have Found | Notes |
|----------|------------------|-------|
| H-SEC-001 | Yes | Shell injection in execSync |
| H-SEC-002 | Yes | Path traversal in copyDirRecursive |
| H-SEC-003 | Partial | Slug validation, covered tangentially in S1-SEC-001 |
| H-LOG-001 | Yes | Typo in function name visible |
| H-LOG-003 | Yes | Sliding window issue |
| H-LOG-005 | Yes | N+1 query pattern |
| H-UND-001-004 | Yes | Magic numbers |
| H-SPC-001 | Yes | update() violates append-only |
| H-SPC-002 | Yes | Security-only promotion |
| H-COV-001 | Yes | initCommand untested |
| S-LOG-002 | Yes | Negative occurrence boost |
| S-LOG-005 | Yes | daysSinceDate NaN |
| S-LOG-003 | Yes | Fragile string matching |

---

## 7. JSON Block: All Scout Findings

```json
{
  "scoutFindings": [
    {
      "id": "S1-SEC-001",
      "file": "init.ts",
      "lines": "167",
      "finding": "Slug generation may produce slugs starting/ending with hyphens",
      "severity": "LOW",
      "status": "dismissed",
      "reason": "Cosmetic, covered by H-SEC-003"
    },
    {
      "id": "S3-LOG-001",
      "file": "failure-mode-resolver.ts",
      "lines": "56-73",
      "finding": "Silent pass on undefined sourceAgreesWithCarrier",
      "severity": "MEDIUM",
      "status": "confirmed",
      "novelId": "N-LOG-002"
    },
    {
      "id": "S3-LOG-004",
      "file": "noncompliance-checker.ts",
      "lines": "109",
      "finding": "Context pack match preferred over spec regardless of relevance score",
      "severity": "MEDIUM",
      "status": "confirmed",
      "novelId": "N-LOG-001"
    },
    {
      "id": "S4-EDGE-003",
      "file": "promotion-checker.ts",
      "lines": "256-258",
      "finding": "findByPatternId called with non-standard signature",
      "severity": "MEDIUM",
      "status": "merged",
      "mergedWith": "S6-ARCH-003"
    },
    {
      "id": "S5-TH-003",
      "file": "confidence.ts",
      "lines": "102-103",
      "finding": "90-day half-life and 0.15 max penalty undocumented",
      "severity": "LOW",
      "status": "confirmed",
      "novelId": "N-UND-002"
    },
    {
      "id": "S5-TH-004",
      "file": "confidence.ts",
      "lines": "157",
      "finding": "Relevance weight cap of 1.5 undocumented",
      "severity": "LOW",
      "status": "merged",
      "mergedWith": "S5-TH-003"
    },
    {
      "id": "S5-TH-005",
      "file": "confidence.ts",
      "lines": "166",
      "finding": "Cross-project penalty as constant not extracted",
      "severity": "LOW",
      "status": "merged",
      "mergedWith": "S5-TH-003"
    },
    {
      "id": "S6-ARCH-003",
      "file": "confidence.ts",
      "lines": "21-30",
      "finding": "OccurrenceRepoLike interface mismatch with actual repository",
      "severity": "MEDIUM",
      "status": "confirmed",
      "novelId": "N-ARCH-001"
    },
    {
      "id": "S9-SPC-001",
      "file": "promotion-checker.ts",
      "lines": "192-193",
      "finding": "Derived principle permanent flag always false",
      "severity": "LOW",
      "status": "dismissed",
      "reason": "Design decision, not clear spec violation"
    },
    {
      "id": "S9-SPC-003",
      "file": "pattern-occurrence.repo.ts",
      "lines": "216-218",
      "finding": "patternId mutation violates immutability",
      "severity": "MEDIUM",
      "status": "confirmed",
      "novelId": "N-SPC-001"
    },
    {
      "id": "S10-COV-001",
      "file": "failure-mode-resolver.ts",
      "lines": "44-158",
      "finding": "No validation of EvidenceBundle structure",
      "severity": "MEDIUM",
      "status": "confirmed",
      "novelId": "N-ROB-001"
    }
  ],
  "novelFindings": [
    {
      "id": "N-LOG-001",
      "file": "noncompliance-checker.ts",
      "lines": "109",
      "severity": "MEDIUM",
      "category": "Logic",
      "title": "Context Pack Preference Over Spec Regardless of Score"
    },
    {
      "id": "N-LOG-002",
      "file": "failure-mode-resolver.ts",
      "lines": "56-73",
      "severity": "MEDIUM",
      "category": "Logic/Robustness",
      "title": "Silent Pass on Undefined sourceAgreesWithCarrier"
    },
    {
      "id": "N-SPC-001",
      "file": "pattern-occurrence.repo.ts",
      "lines": "216-218",
      "severity": "MEDIUM",
      "category": "Spec Compliance",
      "title": "patternId Mutation Violates Occurrence Immutability"
    },
    {
      "id": "N-ARCH-001",
      "file": "confidence.ts",
      "lines": "21-30",
      "severity": "MEDIUM",
      "category": "Architecture/Type Safety",
      "title": "OccurrenceRepoLike Interface Mismatch"
    },
    {
      "id": "N-ROB-001",
      "file": "failure-mode-resolver.ts",
      "lines": "44-158",
      "severity": "MEDIUM",
      "category": "Robustness",
      "title": "No Validation of EvidenceBundle Structure"
    },
    {
      "id": "N-UND-002",
      "file": "confidence.ts",
      "lines": "102-103, 157, 166",
      "severity": "LOW",
      "category": "Understandability",
      "title": "Additional Undocumented Magic Numbers"
    }
  ],
  "previouslyIdentifiedValidation": {
    "total": 16,
    "wouldHaveFound": 13,
    "partialMatch": 1,
    "missed": 2
  }
}
```

---

## 8. Novel Issues Summary

### Issues Found in This Review That Are NOT in the Previously Identified List:

1. **N-LOG-001** (MEDIUM): Context pack match preferred over spec match regardless of relevance score in `noncompliance-checker.ts:109`

2. **N-LOG-002** (MEDIUM): Silent pass on undefined `sourceAgreesWithCarrier` in `failure-mode-resolver.ts:56-73`

3. **N-SPC-001** (MEDIUM): `patternId` mutation in `update()` violates occurrence immutability in `pattern-occurrence.repo.ts:216-218`

4. **N-ARCH-001** (MEDIUM): `OccurrenceRepoLike` interface signature mismatch with actual repository in `confidence.ts:21-30`

5. **N-ROB-001** (MEDIUM): No validation of `EvidenceBundle` structure risks runtime errors in `failure-mode-resolver.ts:44-158`

6. **N-UND-002** (LOW): Additional undocumented magic numbers (90-day half-life, 0.15 max penalty, 1.5 relevance cap, 0.95 cross-project) in `confidence.ts:102-103, 157, 166`

---

*End of Report*
