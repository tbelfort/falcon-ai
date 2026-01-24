# PR Review Model Comparison Test A2

**Configuration:** Scouts: SONNET, Judges: OPUS (Batch mode - all findings at once)
**Branch:** `security-review/full-codebase-audit-2026-01-20`
**PR:** #6
**Date:** 2026-01-20

## Files Reviewed

1. `/Users/tbelfort/Projects/falcon-ai/src/storage/repositories/pattern-occurrence.repo.ts`
2. `/Users/tbelfort/Projects/falcon-ai/src/evolution/promotion-checker.ts`
3. `/Users/tbelfort/Projects/falcon-ai/src/attribution/failure-mode-resolver.ts`
4. `/Users/tbelfort/Projects/falcon-ai/src/attribution/noncompliance-checker.ts`
5. `/Users/tbelfort/Projects/falcon-ai/src/cli/commands/init.ts`
6. `/Users/tbelfort/Projects/falcon-ai/src/injection/confidence.ts`

---

# SCOUT REPORTS (SONNET Model)

## Scout 1: Security Scout

### Finding S1: SQL Injection Risk in Dynamic Query Building
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Line:** 243
- **Severity:** HIGH
- **Description:** The `update()` method builds SQL dynamically using string concatenation with `updates.join(', ')`. While parameters are bound, the column names themselves are constructed from trusted source (code), but the pattern of building queries this way is fragile and could become vulnerable if field names ever come from user input.
- **Evidence:**
  ```typescript
  this.db.prepare(`UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  ```

### Finding S2: No Input Sanitization on Evidence JSON Fields
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 176-181
- **Severity:** MEDIUM
- **Description:** JSON fields (`evidence`, `carrierFingerprint`, `originFingerprint`, `provenanceChain`) are stringified and stored without validation of their content. Malicious JSON payloads could contain extremely large values causing DoS, or special characters that might affect downstream processing.
- **Evidence:** `this.stringifyJsonField(occurrence.evidence)` - no size or content validation before storage.

### Finding S3: Shell Command Injection via execSync
- **File:** `src/cli/commands/init.ts`
- **Lines:** 298, 306
- **Severity:** LOW
- **Description:** The `findGitRoot()` and `getGitRemoteOrigin()` functions use `execSync` with hardcoded commands, which is safe. However, there's no shell escaping context, and if these patterns were extended to include user input, they would be vulnerable.
- **Evidence:** `execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' })` - Currently safe, but pattern is risky.

### Finding S4: Path Traversal in copyDirRecursive
- **File:** `src/cli/commands/init.ts`
- **Lines:** 318-331
- **Severity:** HIGH
- **Description:** The `copyDirRecursive` function does not validate that destination paths stay within expected boundaries. If source files contain symlinks or if `entry.name` contains path traversal characters (e.g., `../`), files could be written outside the intended directory.
- **Evidence:**
  ```typescript
  const destPath = path.join(dest, entry.name);
  // No validation that destPath is within dest directory
  fs.copyFileSync(srcPath, destPath);
  ```

### Finding S5: Missing Rate Limiting on Database Operations
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 145-194
- **Severity:** MEDIUM
- **Description:** The `create()` method has no rate limiting or throttling. A malicious or buggy client could flood the database with pattern occurrences, causing disk space exhaustion or performance degradation.
- **Evidence:** No rate limiting checks before `INSERT INTO pattern_occurrences`.

### Finding S6: Sensitive Data in Console Logs
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 197-200
- **Severity:** LOW
- **Description:** Pattern IDs and derived principle IDs are logged to console. While not directly sensitive, this could leak internal identifiers in production logs that might be useful for attackers mapping the system.
- **Evidence:** `console.log(\`[PromotionChecker] Promoted pattern ${pattern.id} to derived principle ${principle.id}\`...)`

---

## Scout 2: Docs Scout

### Finding D1: Typo in Function Name
- **File:** `src/evolution/promotion-checker.ts`
- **Line:** 131
- **Severity:** LOW
- **Description:** Function is named `promoteToDerivdPrinciple` with a typo - missing 'e' in 'Derived'. This affects code discoverability and documentation.
- **Evidence:** `export function promoteToDerivdPrinciple(`

### Finding D2: Missing JSDoc for Private Functions
- **File:** `src/cli/commands/init.ts`
- **Lines:** 296-331
- **Severity:** LOW
- **Description:** Private helper functions (`findGitRoot`, `getGitRemoteOrigin`, `getRepoSubdir`, `copyDirRecursive`) lack JSDoc documentation explaining their purpose, parameters, and return values.
- **Evidence:** Functions have no documentation comments.

### Finding D3: Incomplete Interface Documentation
- **File:** `src/injection/confidence.ts`
- **Lines:** 10-16
- **Severity:** LOW
- **Description:** The `PatternStats` interface lacks documentation for individual fields explaining what each statistic represents and how it's calculated.
- **Evidence:** No `@param` or field-level documentation on `PatternStats` interface.

### Finding D4: Version Reference Without Changelog Link
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 10-16
- **Severity:** LOW
- **Description:** The NOTE references "v1.0" changes regarding ambiguity removal, but there's no link to a changelog or spec document explaining the full rationale.
- **Evidence:** `NOTE (v1.0): 'ambiguity' was removed from NoncomplianceCause.`

---

## Scout 3: Bug Scout

### Finding B1: Potential Division by Zero in Adherence Rate
- **File:** `src/injection/confidence.ts`
- **Lines:** 55-58
- **Severity:** MEDIUM
- **Description:** While there's a check for `injectedOccurrences.length > 0`, the pattern assumes `injectedOccurrences` won't be mutated between check and use. In a concurrent environment, this could theoretically lead to division issues.
- **Evidence:**
  ```typescript
  adherenceRate:
    injectedOccurrences.length > 0
      ? adheredOccurrences.length / injectedOccurrences.length
      : null,
  ```

### Finding B2: Off-by-One in Sliding Window Search
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 182-197
- **Severity:** MEDIUM
- **Description:** The sliding window search has an off-by-one issue when document has fewer than `windowSize` lines. Loop condition `i <= lines.length - windowSize` would skip documents shorter than 5 lines entirely.
- **Evidence:**
  ```typescript
  for (let i = 0; i <= lines.length - windowSize; i++) {
  ```
  If `lines.length = 4` and `windowSize = 5`, loop never executes.

### Finding B3: Null Handling Inconsistency in Evidence Fields
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 407-409
- **Severity:** MEDIUM
- **Description:** The `originFingerprint` field uses conditional parsing with `undefined` fallback, but `originExcerptHash` uses `|| undefined` which would convert empty strings to undefined incorrectly.
- **Evidence:**
  ```typescript
  originExcerptHash: (row.origin_excerpt_hash as string) || undefined,
  ```
  Empty string `''` would become `undefined`, potentially hiding data corruption.

### Finding B4: Missing Null Check in Evidence Location Comparison
- **File:** `src/attribution/noncompliance-checker.ts`
- **Line:** 216
- **Severity:** MEDIUM
- **Description:** The code assumes `evidence.carrierLocation` is always a string, but if it's undefined or null, calling `.includes()` would throw a TypeError.
- **Evidence:**
  ```typescript
  if (!evidence.carrierLocation.includes(match.location)) {
  ```

### Finding B5: Potential Infinite Loop with Invalid Date
- **File:** `src/injection/confidence.ts`
- **Lines:** 192-197
- **Severity:** LOW
- **Description:** The `daysSinceDate` function doesn't validate the input ISO date string. An invalid date would result in `NaN` being returned, which could cause unexpected behavior in callers.
- **Evidence:**
  ```typescript
  const then = new Date(isoDate);
  // No validation that `then` is a valid date
  ```

### Finding B6: Race Condition in Workspace Slug Generation
- **File:** `src/cli/commands/init.ts`
- **Lines:** 172-179
- **Severity:** HIGH
- **Description:** Between checking for slug uniqueness and creating the workspace, another process could create a workspace with the same slug, causing a database constraint violation.
- **Evidence:**
  ```typescript
  const existingWorkspace = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(workspaceSlug);
  if (existingWorkspace) {
    workspaceSlug = `${defaultSlug}-${randomUUID().slice(0, 8)}`;
  }
  // ... later ...
  db.prepare(`INSERT INTO workspaces ...`).run(...);  // No transaction!
  ```

### Finding B7: Incorrect Type Assertion in rowToEntity
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 401-402
- **Severity:** MEDIUM
- **Description:** The `prNumber` field is cast as `number` but SQLite stores integers which may be returned as bigint in some configurations, leading to type mismatches.
- **Evidence:** `prNumber: row.pr_number as number,`

---

## Scout 4: Test Scout

### Finding T1: No Unit Tests for Failure Mode Resolver
- **File:** `src/attribution/failure-mode-resolver.ts`
- **Lines:** All
- **Severity:** HIGH
- **Description:** The `resolveFailureMode` function implements a complex decision tree with multiple branches, but no test file exists to verify the logic paths. This is critical as it's the deterministic core of the attribution system.
- **Evidence:** No corresponding test file found for `failure-mode-resolver.ts`.

### Finding T2: Missing Edge Case Tests for Confidence Calculation
- **File:** `src/injection/confidence.ts`
- **Lines:** 74-114
- **Severity:** MEDIUM
- **Description:** The `computeAttributionConfidence` function has boundary conditions (0.0, 1.0 clamping) and multiple modifiers that should have explicit edge case tests verifying behavior at limits.
- **Evidence:** No tests for confidence values at boundaries or with extreme inputs.

### Finding T3: No Integration Tests for Init Command
- **File:** `src/cli/commands/init.ts`
- **Lines:** All
- **Severity:** MEDIUM
- **Description:** The init command modifies filesystem and database state but has no integration tests verifying the complete workflow, error handling, or rollback behavior.
- **Evidence:** Command performs multiple side effects without integration test coverage.

### Finding T4: Missing Promotion Checker Tests
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** All
- **Severity:** HIGH
- **Description:** Pattern promotion is a critical business logic operation that affects workspace-level behavior. No tests exist to verify promotion criteria, confidence calculations, or idempotency.
- **Evidence:** No test file for promotion-checker.ts.

### Finding T5: Noncompliance Checker Lacks Boundary Tests
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 171-200
- **Severity:** MEDIUM
- **Description:** The `searchDocument` function has specific thresholds (windowSize=5, score>=2, relevanceScore>=0.3) that lack boundary tests verifying behavior at and around these thresholds.
- **Evidence:** Threshold values are hardcoded without test verification.

---

## Scout 5: Decisions Scout

### Finding DC1: Undocumented 90-Day Half-Life Choice
- **File:** `src/injection/confidence.ts`
- **Lines:** 102-104
- **Severity:** MEDIUM
- **Description:** The decay penalty uses a 90-day half-life with max penalty of 0.15, but there's no documentation explaining why these specific values were chosen.
- **Evidence:**
  ```typescript
  // 90-day half-life, max penalty = 0.15
  const decayPenalty = Math.min(daysSince / 90, 1.0) * 0.15;
  ```

### Finding DC2: Hardcoded Promotion Thresholds
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 36-52
- **Severity:** MEDIUM
- **Description:** Promotion requires 3+ projects, 0.6 confidence, with 0.05 boost per project up to 0.15 max. These magic numbers lack ADR (Architecture Decision Record) documentation explaining the rationale.
- **Evidence:**
  ```typescript
  const MIN_PROJECTS_FOR_PROMOTION = 3;
  const MIN_DERIVED_CONFIDENCE = 0.6;
  const PROJECT_COUNT_BOOST = 0.05;
  const MAX_PROJECT_BOOST = 0.15;
  ```

### Finding DC3: Security-Only Promotion Policy
- **File:** `src/evolution/promotion-checker.ts`
- **Lines:** 93-100
- **Severity:** HIGH
- **Description:** Only security patterns are eligible for promotion to derived principles. This is a significant policy decision that's not documented in any ADR or architecture document - it's only visible in code comments.
- **Evidence:**
  ```typescript
  if (pattern.findingCategory !== 'security') {
    return {
      qualifies: false,
      ...
      reason: `Non-security patterns not eligible for promotion`,
    };
  }
  ```

### Finding DC4: Undocumented Cross-Project Penalty
- **File:** `src/injection/confidence.ts`
- **Lines:** 164-166
- **Severity:** LOW
- **Description:** A 5% penalty (0.95 multiplier) is applied for cross-project patterns. While there's a comment referencing "Main spec Section 5.1", this decision should be more prominently documented.
- **Evidence:** `const crossProjectMultiplier = pattern._crossProjectPenalty ? 0.95 : 1.0;`

### Finding DC5: Relevance Weight Coefficients
- **File:** `src/injection/confidence.ts`
- **Lines:** 151-157
- **Severity:** MEDIUM
- **Description:** Touch overlaps weighted at 0.15 and tech overlaps at 0.05 with max 1.5x multiplier. These coefficients represent important tuning decisions without documented rationale.
- **Evidence:**
  ```typescript
  const relevanceWeight = Math.min(1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps, 1.5);
  ```

---

## Scout 6: Spec Scout

### Finding SP1: Missing MUST Keyword Enforcement
- **File:** `src/attribution/failure-mode-resolver.ts`
- **Lines:** 37-42
- **Severity:** MEDIUM
- **Description:** The file header states this is "NOT LLM judgment" and uses "IMPORTANT" but doesn't use RFC 2119 MUST/SHOULD/MAY language as required by project spec conventions.
- **Evidence:**
  ```typescript
  * IMPORTANT: This is NOT LLM judgment.
  ```
  Should be: "This function MUST NOT involve LLM judgment."

### Finding SP2: Incomplete Append-Only Implementation
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 200-246
- **Severity:** HIGH
- **Description:** Per CLAUDE.md: "Append-only history - Never mutate occurrence records; mark inactive instead." However, the `update()` method allows modifying multiple fields including `patternId`, `wasInjected`, and `wasAdheredTo` which violates append-only semantics.
- **Evidence:** The `update()` method allows mutations beyond just status changes, contradicting the append-only principle.

### Finding SP3: Missing Content Hash Verification
- **File:** `src/storage/repositories/pattern-occurrence.repo.ts`
- **Lines:** 145-194
- **Severity:** MEDIUM
- **Description:** Per CLAUDE.md: "Patterns stored with structured IDs and content hashes". The `create()` method accepts `carrierExcerptHash` and `originExcerptHash` but doesn't verify they are valid hashes or that they match the actual content.
- **Evidence:** No hash validation in the `create()` method.

### Finding SP4: Token Cap Not Enforced
- **File:** `src/injection/confidence.ts`
- **Lines:** All
- **Severity:** MEDIUM
- **Description:** Per CLAUDE.md: "Token-conscious injection - Cap warnings at 6 (2 baseline + 4 learned)". The confidence module computes priorities but doesn't enforce or reference this cap.
- **Evidence:** No mention of warning cap in injection priority calculation.

### Finding SP5: Security Bias Not Prioritized in Injection
- **File:** `src/injection/confidence.ts`
- **Lines:** 133-176
- **Severity:** HIGH
- **Description:** Per CLAUDE.md: "Security bias - Security patterns get priority in injection". The `computeInjectionPriority` function doesn't apply any security category boost - it only uses severity, relevance, and recency.
- **Evidence:**
  ```typescript
  return (
    attributionConfidence *
    severityWeight[pattern.severityMax] *
    relevanceWeight *
    recencyWeight *
    crossProjectMultiplier
  );
  // No security category boost
  ```

### Finding SP6: Noncompliance Checker Missing Spec Reference
- **File:** `src/attribution/noncompliance-checker.ts`
- **Lines:** 1-16
- **Severity:** LOW
- **Description:** The file header describes behavior but doesn't reference the spec section (e.g., "See Spec Section X.Y") that defines these requirements, unlike other files like confidence.ts.
- **Evidence:** No spec section reference in documentation header.

---

# JUDGE EVALUATIONS (OPUS Model)

## Judge 1: Security Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| S1 | HIGH | MODIFIED | LOW | Code pattern is fragile but fields are code-controlled, not user input. Maintainability concern, not active vulnerability. |
| S2 | MEDIUM | CONFIRMED | MEDIUM | Valid concern - JSON fields lack size validation, could enable DoS. Zod schema provides some validation but not size limits. |
| S3 | LOW | DISMISSED | - | False positive. Commands are completely hardcoded with no interpolation. Safe as written. |
| S4 | HIGH | CONFIRMED | HIGH | Legitimate security concern. `entry.name` from filesystem could contain `..` components. Should validate `destPath.startsWith(dest)`. |
| S5 | MEDIUM | MODIFIED | LOW | Reframed for CLI context. Falcon-ai is local CLI tool, "malicious client" scenario assumes server deployment. Minor automation safeguard. |
| S6 | LOW | DISMISSED | - | UUIDs are not sensitive. Designed to be unguessable. Security theater concern. |

### Detailed Reasoning

**S1 - MODIFIED:** The finding correctly identifies a code pattern that could become problematic, but overstates the current risk. The `update()` method only allows specific field names from a hardcoded set within the method itself - there's no user input in column name construction. This is a maintainability concern rather than an active vulnerability. The pattern should be documented as "safe because fields are code-controlled."

**S2 - CONFIRMED:** Valid concern. JSON fields stored without size validation could enable denial-of-service through storage exhaustion. Additionally, deeply nested JSON or JSON with circular references could cause parsing issues. The Zod schema provides some validation, but this doesn't prevent large payloads.

**S3 - DISMISSED:** The commands are completely hardcoded with no interpolation of external values. This is a false positive - the code is safe as written. While it's good practice to be cautious with execSync, flagging safe usage patterns creates noise.

**S4 - CONFIRMED:** This is a legitimate security concern. While the source directory is controlled, `entry.name` comes from the filesystem and could contain `..` components if the source package is compromised. The function should validate that `destPath.startsWith(dest)` after resolution.

**S5 - MODIFIED:** While technically true, this finding lacks context. Falcon-ai is a CLI tool that runs locally per-project. The "malicious client" scenario assumes a multi-user server deployment which isn't the design. Severity reduced to LOW.

**S6 - DISMISSED:** UUIDs are not sensitive data - they're designed to be unguessable and don't reveal system internals useful to attackers. Logging operation results is standard practice.

---

## Judge 2: Docs Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| D1 | LOW | CONFIRMED | MEDIUM | Typo in exported function name is a bug. Will be breaking change to fix later. |
| D2 | LOW | CONFIRMED | LOW | Private functions should have basic JSDoc for maintainability. |
| D3 | LOW | CONFIRMED | LOW | Public interface fields have non-obvious semantics needing documentation. |
| D4 | LOW | MODIFIED | INFO | Inline documentation is helpful; changelog link would be bureaucratic. Consider expanding inline rationale. |

### Detailed Reasoning

**D1 - CONFIRMED (upgraded to MEDIUM):** Typos in public API function names are bugs, not just documentation issues. `promoteToDerivdPrinciple` (missing 'e') will make the API harder to discover and use. Since this is an exported function, changing it would be a breaking change, so this should be fixed soon before adoption increases.

**D2 - CONFIRMED:** While these are private/helper functions, they perform important operations (git interactions, recursive file copying) that future maintainers need to understand. Minimal JSDoc explaining parameters and return values would improve maintainability.

**D3 - CONFIRMED:** The `PatternStats` interface is part of the public API. Fields like `adherenceRate` and `lastSeenActive` have non-obvious semantics. Documentation would prevent misuse.

**D4 - MODIFIED (downgraded to INFO):** The NOTE about v1.0 changes is helpful inline documentation. Requiring a changelog link for every version reference would be overly bureaucratic. Consider expanding inline rationale rather than adding external links.

---

## Judge 3: Bug Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| B1 | MEDIUM | DISMISSED | - | False positive. Single-threaded JS, local const array cannot be mutated between check and use. |
| B2 | MEDIUM | CONFIRMED | MEDIUM | Valid bug. Documents < 5 lines never searched. Should handle short documents. |
| B3 | MEDIUM | CONFIRMED | MEDIUM | Good catch. `\|\| undefined` converts empty strings incorrectly. Use explicit null check. |
| B4 | MEDIUM | CONFIRMED | MEDIUM | Valid bug. If `carrierLocation` undefined, `.includes()` throws TypeError. |
| B5 | LOW | MODIFIED | LOW | Reframed. Won't cause infinite loop, but NaN propagation from invalid dates could cause issues. |
| B6 | HIGH | CONFIRMED | HIGH | Valid race condition. Multiple init processes could cause DB constraint violation. Needs transaction. |
| B7 | MEDIUM | MODIFIED | LOW | Technically possible with BigInt but unlikely in practice. Consider explicit conversion for safety. |

### Detailed Reasoning

**B1 - DISMISSED:** This is not a real bug. The code is single-threaded JavaScript, and `injectedOccurrences` is a local const array that cannot be mutated between the check and usage. The "concurrent environment" concern doesn't apply to synchronous code execution.

**B2 - CONFIRMED:** Valid bug. Documents with fewer than 5 lines will never be searched, returning null even if they contain all keywords. This could miss guidance in short spec sections or bullet lists. The function should handle documents shorter than windowSize.

**B3 - CONFIRMED:** Good catch. Using `|| undefined` for `originExcerptHash` will convert empty strings to undefined, which is semantically different from the field being absent. Should use explicit null check.

**B4 - CONFIRMED:** Valid bug. If `carrierLocation` can be undefined, calling `.includes()` will throw. This is a runtime error waiting to happen.

**B5 - MODIFIED:** The function won't cause an infinite loop - it will return NaN for invalid dates. However, NaN propagation through calculations could cause unexpected behavior. Reframed as "NaN propagation from invalid dates."

**B6 - CONFIRMED:** Valid race condition. In automated CI/CD pipelines where multiple jobs might initialize projects simultaneously, this could cause failures. The fix is to wrap the check-and-insert in a transaction.

**B7 - MODIFIED (downgraded to LOW):** This is technically possible with BigInt but unlikely in practice with better-sqlite3's default configuration and typical PR number ranges. Valid concern for future-proofing.

---

## Judge 4: Test Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| T1 | HIGH | CONFIRMED | HIGH | Critical gap. Failure mode resolver is deterministic heart of attribution - needs comprehensive tests. |
| T2 | MEDIUM | CONFIRMED | MEDIUM | Boundary conditions in numerical calculations need explicit tests. |
| T3 | MEDIUM | CONFIRMED | MEDIUM | CLI with multiple side effects needs integration test suite. |
| T4 | HIGH | CONFIRMED | HIGH | Promotion affects workspace-level principles across all projects. Critical business logic. |
| T5 | MEDIUM | CONFIRMED | MEDIUM | Magic number thresholds need boundary tests for regression protection. |

### Detailed Reasoning

**T1 - CONFIRMED:** The failure mode resolver is the deterministic heart of the attribution system - per CLAUDE.md, this is critical because "Deterministic over LLM judgment" is a key design principle. A complex decision tree without tests is a significant risk. Every branch in `resolveFailureMode` should have explicit test coverage.

**T2 - CONFIRMED:** Boundary conditions in numerical calculations are common bug sources. Tests should verify: confidence exactly at 0.0 and 1.0 after clamping, behavior with zero occurrences, behavior with ancient dates (decay at max), and interaction of multiple modifiers.

**T3 - CONFIRMED:** The init command creates files, modifies database state, and has multiple error paths. Without integration tests, regressions could corrupt user projects.

**T4 - CONFIRMED:** Pattern promotion affects workspace-level derived principles which then influence all projects in that workspace. Given the multi-project scope of impact, this needs thorough testing.

**T5 - CONFIRMED:** Magic numbers like `score >= 2` and `relevanceScore >= 0.3` define system behavior at boundaries. Tests should verify behavior at exactly these thresholds.

---

## Judge 5: Decisions Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| DC1 | MEDIUM | CONFIRMED | MEDIUM | 90-day half-life affects priority decay. Product decision needing documented rationale. |
| DC2 | MEDIUM | CONFIRMED | MEDIUM | Promotion thresholds are significant policy. Document rationale, consider configurability. |
| DC3 | HIGH | CONFIRMED | HIGH | Security-only promotion is major policy decision visible only in code. Requires ADR. |
| DC4 | LOW | MODIFIED | INFO | Spec reference exists. Ensure spec explains the 5% choice. |
| DC5 | MEDIUM | CONFIRMED | MEDIUM | Tuning parameters affect ranking. Document rationale, consider configurability. |

### Detailed Reasoning

**DC1 - CONFIRMED:** The 90-day half-life significantly affects how quickly patterns lose priority. This value represents a product decision that should be documented with rationale. Was this based on typical development cycles? Quarterly planning? Empirical testing? Future tuners need this context.

**DC2 - CONFIRMED:** These thresholds define when project-level patterns become workspace-level principles. The choices of 3 projects (why not 2 or 5?), 60% confidence, and boost amounts all deserve explanation.

**DC3 - CONFIRMED:** This is the most significant undocumented decision. Restricting promotion to security patterns is a major policy choice. Other categories might have cross-project patterns worth elevating. The decision should be documented with clear rationale.

**DC4 - MODIFIED (downgraded to INFO):** The code does reference the spec section, which is appropriate. The 5% penalty value itself is arbitrary-feeling without explanation, but the reference exists.

**DC5 - CONFIRMED:** The 0.15 for touches and 0.05 for technologies, with 1.5x max, are tuning parameters that affect injection ranking. Without documented rationale, maintenance is risky.

---

## Judge 6: Spec Judge

| Finding | Scout Severity | Verdict | Final Severity | Reasoning Summary |
|---------|---------------|---------|----------------|-------------------|
| SP1 | MEDIUM | MODIFIED | INFO | RFC 2119 for specs, not code comments. Current approach acceptable. |
| SP2 | HIGH | CONFIRMED | HIGH | Significant spec violation. Update allows mutations violating append-only principle. |
| SP3 | MEDIUM | MODIFIED | LOW | Repository is storage layer. Hash verification belongs in attribution layer. |
| SP4 | MEDIUM | CONFIRMED | MEDIUM | Cap of 6 warnings should be documented or enforced somewhere in pipeline. |
| SP5 | HIGH | CONFIRMED | HIGH | Clear spec violation. Security patterns should get injection priority boost. |
| SP6 | LOW | CONFIRMED | LOW | Consistency in documentation style. Add spec section reference. |

### Detailed Reasoning

**SP1 - MODIFIED (downgraded to INFO):** While CLAUDE.md mentions RFC 2119 conventions for specs, it doesn't mandate their use in code comments. The "IMPORTANT:" prefix is clear enough for code documentation. RFC 2119 language is more appropriate for formal specification documents.

**SP2 - CONFIRMED:** This is a significant spec violation. The CLAUDE.md explicitly states "Append-only history - Never mutate occurrence records; mark inactive instead." Allowing updates to `patternId`, `wasInjected`, and `wasAdheredTo` directly contradicts this.

**SP3 - MODIFIED (downgraded to LOW):** The spec says patterns are "stored with content hashes" which this code does. Verification that hashes match content would happen at creation time in a different layer (the attribution agent). The repository is just storage.

**SP4 - CONFIRMED:** The confidence module computes injection priority which directly feeds into injection selection. Per spec, there should be a cap of 6 warnings. While this might be enforced elsewhere, it should at least be documented here.

**SP5 - CONFIRMED:** The CLAUDE.md explicitly states "Security bias - Security patterns get priority in injection." The function has no security category boost. This is a clear spec violation.

**SP6 - CONFIRMED:** Consistency in documentation style improves maintainability. Other files reference spec sections; this one should too.

---

# SUMMARY

## Overall Statistics

| Metric | Count |
|--------|-------|
| Total Scout Findings | 31 |
| Confirmed | 22 |
| Modified | 7 |
| Dismissed | 4 |
| **Confirmation Rate** | **71%** |

## By Scout/Judge

| Scout | Findings | Confirmed | Modified | Dismissed |
|-------|----------|-----------|----------|-----------|
| Security | 6 | 2 | 2 | 2 |
| Docs | 4 | 3 | 1 | 0 |
| Bug | 7 | 4 | 2 | 1 |
| Test | 5 | 5 | 0 | 0 |
| Decisions | 5 | 4 | 1 | 0 |
| Spec | 6 | 4 | 2 | 0 |

## By Final Severity (After Judge Review)

| Severity | Count |
|----------|-------|
| HIGH | 8 |
| MEDIUM | 12 |
| LOW | 7 |
| INFO | 2 |
| DISMISSED | 4 |

## All Confirmed/Modified Findings by Severity

### HIGH (8 findings)

| ID | File | Description | Status |
|----|------|-------------|--------|
| S4 | init.ts:318-331 | Path traversal in copyDirRecursive | CONFIRMED |
| B6 | init.ts:172-179 | Race condition in workspace slug generation | CONFIRMED |
| T1 | failure-mode-resolver.ts | No unit tests for failure mode resolver | CONFIRMED |
| T4 | promotion-checker.ts | Missing promotion checker tests | CONFIRMED |
| DC3 | promotion-checker.ts:93-100 | Security-only promotion policy undocumented | CONFIRMED |
| SP2 | pattern-occurrence.repo.ts:200-246 | Incomplete append-only implementation | CONFIRMED |
| SP5 | confidence.ts:133-176 | Security bias not prioritized in injection | CONFIRMED |
| D1 | promotion-checker.ts:131 | Typo in function name (`promoteToDerivdPrinciple`) | CONFIRMED (upgraded) |

### MEDIUM (12 findings)

| ID | File | Description | Status |
|----|------|-------------|--------|
| S2 | pattern-occurrence.repo.ts:176-181 | No input sanitization on evidence JSON fields | CONFIRMED |
| B2 | noncompliance-checker.ts:182-197 | Off-by-one in sliding window search | CONFIRMED |
| B3 | pattern-occurrence.repo.ts:407-409 | Null handling inconsistency in evidence fields | CONFIRMED |
| B4 | noncompliance-checker.ts:216 | Missing null check in evidence location comparison | CONFIRMED |
| T2 | confidence.ts:74-114 | Missing edge case tests for confidence calculation | CONFIRMED |
| T3 | init.ts | No integration tests for init command | CONFIRMED |
| T5 | noncompliance-checker.ts:171-200 | Noncompliance checker lacks boundary tests | CONFIRMED |
| DC1 | confidence.ts:102-104 | Undocumented 90-day half-life choice | CONFIRMED |
| DC2 | promotion-checker.ts:36-52 | Hardcoded promotion thresholds | CONFIRMED |
| DC5 | confidence.ts:151-157 | Relevance weight coefficients | CONFIRMED |
| SP4 | confidence.ts | Token cap not enforced | CONFIRMED |

### LOW (7 findings)

| ID | File | Description | Status |
|----|------|-------------|--------|
| S1 | pattern-occurrence.repo.ts:243 | SQL pattern maintainability concern | MODIFIED |
| S5 | pattern-occurrence.repo.ts:145-194 | Rate limiting for automation scenarios | MODIFIED |
| B5 | confidence.ts:192-197 | NaN propagation from invalid dates | MODIFIED |
| B7 | pattern-occurrence.repo.ts:401-402 | Type assertion for BigInt safety | MODIFIED |
| D2 | init.ts:296-331 | Missing JSDoc for private functions | CONFIRMED |
| D3 | confidence.ts:10-16 | Incomplete interface documentation | CONFIRMED |
| SP3 | pattern-occurrence.repo.ts:145-194 | Hash verification belongs elsewhere | MODIFIED |
| SP6 | noncompliance-checker.ts:1-16 | Missing spec reference | CONFIRMED |

### INFO (2 findings)

| ID | File | Description | Status |
|----|------|-------------|--------|
| D4 | noncompliance-checker.ts:10-16 | Version reference documentation | MODIFIED |
| DC4 | confidence.ts:164-166 | Cross-project penalty spec reference exists | MODIFIED |
| SP1 | failure-mode-resolver.ts:37-42 | RFC 2119 for code comments | MODIFIED |

### DISMISSED (4 findings)

| ID | File | Reason |
|----|------|--------|
| S3 | init.ts:298,306 | False positive - hardcoded commands, no interpolation |
| S6 | promotion-checker.ts:197-200 | UUIDs not sensitive, security theater |
| B1 | confidence.ts:55-58 | False positive - single-threaded JS, no race |

---

## Key Recommendations

### Critical (Must Fix)

1. **Fix append-only violation (SP2)** - Restrict `update()` to only allow status changes
2. **Add security bias to injection priority (SP5)** - Per spec requirement
3. **Fix path traversal vulnerability (S4)** - Add `path.resolve()` comparison
4. **Fix race condition in init (B6)** - Wrap in transaction or use atomic upsert
5. **Fix function name typo (D1)** - `promoteToDerivdPrinciple` -> `promoteToDerivedPrinciple`

### High Priority (Should Fix)

1. **Add unit tests for failure mode resolver (T1)**
2. **Add unit tests for promotion checker (T4)**
3. **Document security-only promotion policy (DC3)** - Create ADR
4. **Fix null handling bugs (B3, B4)**
5. **Fix short document handling (B2)**

### Medium Priority (Plan to Fix)

1. **Add JSON size validation (S2)**
2. **Add edge case tests (T2, T5)**
3. **Add CLI integration tests (T3)**
4. **Document magic numbers (DC1, DC2, DC5)**
5. **Document or enforce token cap (SP4)**

---

*Generated by Test A2 (Scouts: SONNET, Judges: OPUS, Batch Mode) on 2026-01-20*
