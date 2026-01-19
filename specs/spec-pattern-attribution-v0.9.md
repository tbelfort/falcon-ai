# Meta-Learning Pattern Attribution System Specification v0.9

**Status:** Draft for Review
**Last Updated:** 2026-01-18
**Authors:** Human + Claude Opus 4.5 + GPT-5 Pro consultation

---

## 1. Overview

### 1.1 Purpose

A feedback loop for a multi-agent software development system. When PR reviews find bugs, we trace them back to the guidance that caused them, then inject warnings into future agent runs.

**Goals:**
- Improve quality: fewer security issues, bugs, and compliance failures
- Improve effectiveness: better context packs, better specs, better code
- Close the feedback loop that existing systems (e.g., say-your-harmony) failed to close

### 1.2 System Context

```
LINEAR ISSUE (CON-XXX)
        │
        ▼
CONTEXT PACK CREATION (opus agent)
│   • Reads relevant docs, extracts constraints with citations
│   • Outputs: taskProfile, constraints, sources consulted
│   ← INJECTION POINT: Load warnings from past failures
        │
        ▼
SPEC CREATION (opus agent)
│   • Reads ONLY the Context Pack (nothing else)
│   • Extracts requirements, test specs, acceptance criteria
│   ← INJECTION POINT: Load warnings from past failures
        │
        ▼
IMPLEMENTATION (sonnet agent)
│   • Follows Spec exactly
│   • Output: Pull Request
        │
        ▼
PR REVIEW
│   • 6 Scouts (sonnet) - scan for issues, read-only
│   • 6 Judges (opus) - evaluate each scout's findings
│   • Orchestrator - synthesizes verdict
        │
        ▼
PATTERN ATTRIBUTION (this system)
│   • For each confirmed finding: analyze root cause
│   • Output: Pattern OR ExecutionNoncompliance OR DocUpdateRequest
        │
        └──────────► FEEDBACK LOOP back to Context Pack/Spec agents
```

### 1.3 Design Principles

1. **Deterministic over LLM judgment** — Use structured evidence features and decision trees, not vibes
2. **Append-only history** — Never mutate occurrence records; mark inactive instead of delete
3. **Separate belief from action** — Attribution confidence ≠ injection priority
4. **Distinguish guidance errors from execution errors** — Pattern vs ExecutionNoncompliance
5. **Token-conscious injection** — Cap warnings to avoid fatigue
6. **Security bias** — Security patterns get priority in injection

### 1.4 Key Insight: Evidence Features + Deterministic Resolver

Instead of asking an LLM to "choose the failure mode," we:
1. Have the Attribution Agent output **structured evidence features**
2. Run a **deterministic decision tree** to resolve failureMode

This gives us:
- Consistency across runs
- Debuggability (see why decisions were made)
- Reversibility (improve rules without rewriting history)

---

## 2. Entity Definitions

### 2.1 PatternDefinition

A reusable pattern representing bad guidance that led to a confirmed finding.

```typescript
interface PatternDefinition {
  id: string;                          // UUID
  contentHash: string;                 // SHA-256 of normalized patternContent

  // What was wrong
  patternContent: string;              // The actual bad guidance text
  failureMode: FailureMode;
  findingCategory: FindingCategory;
  severity: Severity;                  // Inherited from original finding

  // What to do instead
  alternative: string;                 // Recommended correct approach
  consequenceClass?: string;           // External reference: CWE-89, etc.

  // Where to inject warnings
  carrierStage: 'context-pack' | 'spec';

  // Evidence quality (from primary/best occurrence)
  primaryCarrierQuoteType: 'verbatim' | 'paraphrase' | 'inferred';

  // Filtering criteria
  technologies: string[];              // ['sql', 'postgres']
  taskTypes: string[];                 // ['api', 'database']
  touches: Touch[];                    // ['user_input', 'database']

  // Baseline alignment (for inferred pattern gate)
  alignedBaselineId?: string;          // DerivedPrinciple ID if pattern aligns with a baseline

  // Lifecycle
  status: 'active' | 'archived' | 'superseded';
  permanent: boolean;                  // If true, no time decay
  supersededBy?: string;               // PatternDefinition ID if superseded

  // Timestamps
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}
```

#### FailureMode Enum

```typescript
type FailureMode =
  | 'incorrect'           // Guidance explicitly said to do the wrong thing
  | 'incomplete'          // Guidance omitted a necessary constraint/guardrail
  | 'missing_reference'   // Didn't cite a mandatory doc that was relevant
  | 'ambiguous'           // Guidance admits multiple reasonable interpretations
  | 'conflict_unresolved' // Contradictory guidance from multiple sources not reconciled
  | 'synthesis_drift';    // Carrier (Context Pack/Spec) distorted the source meaning
```

#### FindingCategory Enum

```typescript
type FindingCategory =
  | 'security'            // Led to vulnerability (maps to Security Scout/Judge)
  | 'correctness'         // Led to bug (maps to Bug Scout/Judge)
  | 'testing'             // Led to weak/missing tests (maps to Test Scout/Judge)
  | 'compliance';         // Led to doc/spec deviation (maps to Docs/Spec Scout/Judge)
```

#### Severity Enum

```typescript
type Severity =
  | 'CRITICAL'            // System-breaking, security breach, data loss
  | 'HIGH'                // Significant impact, must fix before merge
  | 'MEDIUM'              // Should fix, but not blocking
  | 'LOW';                // Minor issue, nice to fix
```

#### Touch Enum

```typescript
type Touch =
  | 'user_input'          // Handles external/user-provided data
  | 'database'            // Interacts with database
  | 'network'             // Makes network calls
  | 'auth'                // Handles authentication
  | 'authz'               // Handles authorization
  | 'caching'             // Implements caching
  | 'schema'              // Modifies data schemas
  | 'logging'             // Writes logs
  | 'config'              // Handles configuration
  | 'api';                // Exposes or consumes APIs
```

### 2.2 PatternOccurrence

A specific instance of a pattern being attributed to a finding. Append-only.

```typescript
interface PatternOccurrence {
  id: string;                          // UUID
  patternId: string;                   // FK to PatternDefinition

  // Source finding
  findingId: string;                   // From PR Review
  issueId: string;                     // CON-123
  prNumber: number;

  // Evidence (structured bundle from Attribution Agent)
  evidence: EvidenceBundle;

  // Provenance chain
  carrierFingerprint: DocFingerprint;  // Where bad guidance appeared
  originFingerprint?: DocFingerprint;  // Ultimate source (if traced)
  provenanceChain: DocFingerprint[];   // Full chain for audit

  // Injection tracking
  wasInjected: boolean;                // Was this pattern injected before the PR?
  wasAdheredTo: boolean | null;        // Did implementation follow the warning? (null if not injected)

  // Lifecycle
  status: 'active' | 'inactive';
  inactiveReason?: 'superseded_doc' | 'pattern_archived' | 'false_positive';

  // Timestamps
  createdAt: string;                   // ISO 8601
}
```

#### EvidenceBundle

Structured output from Attribution Agent. Used by deterministic resolver.

```typescript
interface EvidenceBundle {
  // Carrier identification
  carrierStage: 'context-pack' | 'spec';
  carrierQuote: string;                // The actual text that caused the problem
  carrierQuoteType: 'verbatim' | 'paraphrase' | 'inferred';
  carrierLocation: string;             // Section reference within carrier

  // Citation analysis
  hasCitation: boolean;                // Did carrier cite a source?
  citedSources: string[];              // Source references found
  sourceRetrievable: boolean;          // Can we access the cited source?
  sourceAgreesWithCarrier: boolean | null;  // null if not retrievable

  // Obligation analysis
  mandatoryDocMissing: boolean;        // Was a required doc not referenced?
  missingDocId?: string;               // Which mandatory doc was missing

  // Quality signals (may be computed at Context Pack creation)
  vaguenessSignals: string[];          // ['appropriately', 'robust', 'as needed']
  hasTestableAcceptanceCriteria: boolean;

  // Conflict detection
  conflictSignals: ConflictSignal[];
}

interface ConflictSignal {
  docA: string;                        // First conflicting source
  docB: string;                        // Second conflicting source
  topic: string;                       // What they conflict about
  excerptA?: string;                   // Relevant text from docA
  excerptB?: string;                   // Relevant text from docB
}
```

#### DocFingerprint

Universal document versioning across source types.

```typescript
type DocFingerprint =
  | { kind: 'git'; repo: string; path: string; commitSha: string }
  | { kind: 'linear'; docId: string; updatedAt: string; contentHash: string }
  | { kind: 'web'; url: string; retrievedAt: string; excerptHash: string }
  | { kind: 'external'; id: string; version?: string };  // CWE-89, OWASP, etc.
```

### 2.3 DerivedPrinciple

A general principle — either a baseline guardrail or derived from pattern clusters.

```typescript
interface DerivedPrinciple {
  id: string;                          // UUID

  // Content
  principle: string;                   // "Never use string interpolation for SQL"
  rationale: string;                   // Why this matters

  // Origin
  origin: 'baseline' | 'derived';
  derivedFrom?: string[];              // PatternDefinition IDs (if derived)
  externalRefs?: string[];             // ['CWE-89', 'OWASP-A03'] (if baseline)

  // Where to inject
  injectInto: 'context-pack' | 'spec' | 'both';

  // Filtering criteria
  touches: Touch[];                    // Primary filter
  technologies?: string[];             // Optional secondary filter
  taskTypes?: string[];                // Optional secondary filter

  // Confidence
  confidence: number;                  // 0.0-1.0 (0.9 for baselines)

  // Lifecycle
  status: 'active' | 'archived' | 'superseded';
  permanent: boolean;                  // If true, no time decay
  supersededBy?: string;               // DerivedPrinciple ID if superseded

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

### 2.4 ExecutionNoncompliance

When an agent ignored correct guidance. NOT a guidance error — distinct from Pattern.

```typescript
interface ExecutionNoncompliance {
  id: string;                          // UUID

  // Source finding
  findingId: string;
  issueId: string;                     // CON-123
  prNumber: number;

  // What was ignored
  violatedGuidanceStage: 'context-pack' | 'spec';
  violatedGuidanceLocation: string;    // Section reference
  violatedGuidanceExcerpt: string;     // The guidance that was ignored

  // Analysis
  possibleCauses: NoncomplianceCause[];

  // Timestamps
  createdAt: string;
}

type NoncomplianceCause =
  | 'salience'      // Warning wasn't prominent enough
  | 'formatting'    // Warning format was unclear
  | 'ambiguity'     // Warning was ambiguous (edge case of guidance problem)
  | 'override';     // Agent intentionally overrode (rare)
```

### 2.5 DocUpdateRequest

Triggered when a finding requires documentation update. Primary output for `decisions` findings.

```typescript
interface DocUpdateRequest {
  id: string;                          // UUID

  // Source
  findingId: string;
  issueId: string;
  findingCategory: FindingCategory;
  scoutType: string;                   // Which scout found this

  // What needs updating
  targetDoc: string;                   // Doc path or identifier
  updateType: DocUpdateType;
  description: string;                 // What specifically needs to change
  suggestedContent?: string;           // Optional draft content

  // Status
  status: 'pending' | 'completed' | 'rejected';
  completedAt?: string;
  rejectionReason?: string;

  // Timestamps
  createdAt: string;
}

type DocUpdateType =
  | 'add_decision'       // Document an undocumented decision
  | 'clarify_guidance'   // Make ambiguous guidance clearer
  | 'fix_error'          // Correct incorrect guidance
  | 'add_constraint';    // Add missing constraint/guardrail
```

### 2.6 TaskProfile

Classification of what a task interacts with. Used for injection filtering.

```typescript
interface TaskProfile {
  touches: Touch[];                    // What system areas does this task interact with?
  technologies: string[];              // What specific technologies? (sql, postgres, redis, etc.)
  taskTypes: string[];                 // What kind of task? (api, database, ui, migration, etc.)
  confidence: number;                  // How confident in this classification? (0-1)
}
```

### 2.7 TaggingMiss

Tracks when a pattern should have been injected but wasn't due to taskProfile mismatch.

```typescript
interface TaggingMiss {
  id: string;                          // UUID

  // What happened
  findingId: string;
  patternId: string;                   // Pattern that would have helped

  // The mismatch
  actualTaskProfile: TaskProfile;
  requiredMatch: {
    touches?: Touch[];
    technologies?: string[];
    taskTypes?: string[];
  };
  missingTags: string[];               // What was missing from taskProfile

  // Resolution
  status: 'pending' | 'resolved';
  resolution?: 'broadened_pattern' | 'improved_extraction' | 'false_positive';

  // Timestamps
  createdAt: string;
  resolvedAt?: string;
}
```

### 2.8 InjectionLog

Records what patterns/principles were injected for each issue. Used for adherence tracking.

```typescript
interface InjectionLog {
  id: string;                          // UUID

  // What was injected
  issueId: string;                     // CON-123
  target: 'context-pack' | 'spec';

  // Injected items
  injectedPatterns: string[];          // PatternDefinition IDs
  injectedPrinciples: string[];        // DerivedPrinciple IDs

  // Context
  taskProfile: TaskProfile;            // Profile used for selection

  // Timestamps
  injectedAt: string;
}
```

---

## 3. Attribution Process

### 3.1 Trigger

Attribution runs after PR Review completes, for each **confirmed** finding (judgeVerdict == 'CONFIRMED').

### 3.2 Attribution Agent Responsibilities

For each confirmed finding:

1. **Locate the carrier** — Find where in Context Pack or Spec the problematic guidance appeared
2. **Extract evidence features** — Output structured EvidenceBundle (not free-form judgment)
3. **Trace provenance** — If carrier cites a source, retrieve and compare
4. **Check for noncompliance** — Search full Context Pack/Spec for allegedly missing guidance

### 3.3 FailureMode Resolution (Deterministic Decision Tree)

```
INPUT: EvidenceBundle from Attribution Agent

STEP A: Can we prove synthesis drift?
────────────────────────────────────────
  IF evidence.hasCitation == true
     AND evidence.sourceRetrievable == true
     AND evidence.sourceAgreesWithCarrier == false
  THEN:
     failureMode = 'synthesis_drift'
     EXIT

  IF evidence.hasCitation == true
     AND evidence.sourceRetrievable == false
  THEN:
     failureMode = 'incorrect'
     SET flag: suspectedSynthesisDrift = true
     SET confidenceModifier = -0.15
     EXIT

STEP B: Is mandatory doc missing?
────────────────────────────────────────
  IF evidence.mandatoryDocMissing == true
  THEN:
     failureMode = 'missing_reference'
     EXIT

STEP C: Are there unresolved conflicts?
────────────────────────────────────────
  IF evidence.conflictSignals.length > 0
     AND carrier document has no resolution section for the conflict
  THEN:
     failureMode = 'conflict_unresolved'
     EXIT

STEP D: Ambiguous vs Incomplete
────────────────────────────────────────
  Ambiguity signals (any of):
    - evidence.vaguenessSignals.length >= 2
    - evidence.hasTestableAcceptanceCriteria == false
    - Multiple reasonable implementations could satisfy the guidance

  Incompleteness signals (any of):
    - Guidance gives specific mechanism but omits boundary conditions
    - Guidance gives partial algorithm (e.g., "retry" but no max/backoff)
    - Guidance relies on invariant it doesn't mention

  IF ambiguity signals dominate:
     failureMode = 'ambiguous'
     EXIT

  IF incompleteness signals dominate:
     failureMode = 'incomplete'
     EXIT

STEP E: Default to incorrect or incomplete
────────────────────────────────────────
  IF evidence.carrierQuoteType IN ('verbatim', 'paraphrase')
  THEN:
     // We found a specific quote that relates to the finding.
     // By virtue of finding it, the guidance "directly instructed"
     // the behavior that led to the problem.
     failureMode = 'incorrect'
     EXIT

  ELSE:
     // carrierQuoteType is 'inferred' — no direct quote found
     // The finding happened but we couldn't pinpoint explicit bad guidance
     failureMode = 'incomplete'  // Conservative default
```

**Note on Step E:** The determination of whether guidance "directly instructs harmful behavior" is not LLM judgment. If the Attribution Agent found a verbatim or paraphrase match (`carrierQuote`), that quote is by definition related to the finding — otherwise it wouldn't have been selected as the carrier. The quote's existence as the carrier is the evidence.

### 3.4 Pre-Pattern Check: ExecutionNoncompliance

**BEFORE** creating a Pattern with `failureMode = 'incomplete'` or `failureMode = 'missing_reference'`:

1. Search the FULL Context Pack for the allegedly missing guidance
2. Search the FULL Spec for the allegedly missing guidance
3. Use normalized keyword matching and semantic search

**IF guidance is found:**
- Do NOT create a Pattern
- Create ExecutionNoncompliance instead
- Record `violatedGuidanceExcerpt` with the found text

**IF guidance is not found:**
- Proceed with Pattern creation

This prevents polluting the pattern store with "always mention X" when X was already mentioned.

### 3.5 Decisions Findings: Special Handling

When a finding comes from the Decisions Scout/Judge:

1. **ALWAYS** create a DocUpdateRequest
   - The Decisions Judge principle: "Doc update is REQUIRED, not optional"

2. **ONLY** create a Pattern if:
   - Same decision class has been missed 3+ times (recurrence)
   - Decision class is high-risk: security, privacy, backcompat
   - It's a process failure: Context Pack systematically fails to prompt for this type

3. **PREFER** creating DerivedPrinciple (checklist) over granular patterns:
   - "If task touches `caching`, require invalidation strategy documentation"
   - This compresses many potential "document X" patterns into one principle

---

## 4. Confidence Model

### 4.1 Attribution Confidence

How certain we are the attribution is correct.

```
attributionConfidence = CLAMP(
  evidenceQualityBase
  + occurrenceBoost
  - decayPenalty
  + confidenceModifiers,
  0.0, 1.0
)

WHERE:
  evidenceQualityBase:
    IF primaryCarrierQuoteType == 'verbatim'   THEN 0.75
    IF primaryCarrierQuoteType == 'paraphrase' THEN 0.55
    IF primaryCarrierQuoteType == 'inferred'   THEN 0.40

  occurrenceBoost:
    min((activeOccurrenceCount - 1), 5) * 0.05
    // First occurrence = no boost, max boost = 0.25 at 6+ occurrences

  decayPenalty (only if pattern.permanent == false):
    min(daysSinceLastActiveOccurrence / 90, 1.0) * 0.15
    // 90-day half-life, max penalty = 0.15

  confidenceModifiers:
    IF suspectedSynthesisDrift THEN -0.15
    IF mandatoryDocMissing AND doc is verifiably mandatory THEN +0.10
```

### 4.2 Injection Priority

How urgently we should inject this warning. Separate from attribution confidence.

```
injectionPriority =
  attributionConfidence
  * severityWeight
  * relevanceWeight
  * recencyWeight

WHERE:
  severityWeight:
    CRITICAL = 1.0
    HIGH     = 0.9
    MEDIUM   = 0.7
    LOW      = 0.5

  relevanceWeight:
    baseRelevance = 1.0
    touchOverlaps = count of (pattern.touches ∩ taskProfile.touches)
    techOverlaps = count of (pattern.technologies ∩ taskProfile.technologies)
    relevanceWeight = min(baseRelevance + 0.1 * touchOverlaps + 0.1 * techOverlaps, 1.5)

  recencyWeight:
    IF daysSinceLastSeen <= 7  THEN 1.0
    IF daysSinceLastSeen <= 30 THEN 0.95
    IF daysSinceLastSeen <= 90 THEN 0.9
    ELSE 0.8
```

### 4.3 Special Rules for Inferred Patterns

Patterns with `primaryCarrierQuoteType == 'inferred'` have lower base confidence (0.40).

**Injection gate:** Do not inject `inferred` patterns unless:
- `activeOccurrenceCount >= 2`, OR
- `severity` is HIGH or CRITICAL AND `alignedBaselineId` is set (pattern aligns with a baseline principle), OR
- `failureMode == 'missing_reference'`

**Baseline alignment:** When creating a pattern, check if its `touches` and `findingCategory` align with an existing baseline principle. If so, set `alignedBaselineId`. This allows novel security issues to be injected even with only one occurrence, if they fall under an existing baseline category.

---

## 5. Injection System

### 5.1 Tiered Injection Algorithm

```
FUNCTION selectWarningsForInjection(
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  maxTotal: number = 6
): InjectedWarning[]

  // STEP 1: Select baseline principles
  eligiblePrinciples = DerivedPrinciple.find({
    origin: 'baseline',
    status: 'active',
    injectInto: target OR 'both',
    touches: { $overlap: taskProfile.touches }
  })

  // Sort by confidence, select top 2
  selectedPrinciples = eligiblePrinciples
    .sortBy(p => p.confidence, DESC)
    .take(2)

  // STEP 2: Select learned patterns
  eligiblePatterns = PatternDefinition.find({
    status: 'active',
    carrierStage: target,
    $or: [
      { touches: { $overlap: taskProfile.touches } },
      { technologies: { $overlap: taskProfile.technologies } },
      { taskTypes: { $overlap: taskProfile.taskTypes } }
    ]
  })

  // Apply inferred gate (see Section 4.3)
  eligiblePatterns = eligiblePatterns.filter(p =>
    p.primaryCarrierQuoteType != 'inferred'
    OR meetsInferredGate(p)
  )

  // meetsInferredGate(p) returns true if:
  //   - computePatternStats(p.id).activeOccurrences >= 2, OR
  //   - p.severity IN ('HIGH', 'CRITICAL') AND p.alignedBaselineId != null, OR
  //   - p.failureMode == 'missing_reference'

  // Compute injection priority for each
  FOR each pattern IN eligiblePatterns:
    pattern.injectionPriority = computeInjectionPriority(pattern, taskProfile)

  // STEP 3: Select with security priority
  securityPatterns = eligiblePatterns
    .filter(p => p.findingCategory == 'security')
    .sortBy(p => p.injectionPriority, DESC)
    .take(3)

  remainingSlots = maxTotal - selectedPrinciples.length - securityPatterns.length

  otherPatterns = eligiblePatterns
    .filter(p => p.findingCategory != 'security')
    .sortBy(p => p.injectionPriority, DESC)
    .take(remainingSlots)

  // STEP 4: Combine and format
  RETURN formatWarnings(selectedPrinciples + securityPatterns + otherPatterns)
```

### 5.2 Injection Format

```markdown
## Warnings from Past Issues (auto-generated)

### [SECURITY][incorrect][HIGH] SQL query construction
**Bad guidance:** "Use template literals for SQL for readability."
**Observed result:** SQL injection vulnerability (CON-123, PR #456).
**Do instead:** Always use parameterized queries. Never interpolate user input.
**Applies when:** touches=database,user_input; tech=sql,postgres

### [CORRECTNESS][incomplete][MEDIUM] Retry logic
**Bad guidance:** "Retry failed requests."
**Observed result:** Infinite retry loop causing resource exhaustion (CON-456, PR #789).
**Do instead:** Implement exponential backoff with max 3 retries.
**Applies when:** touches=network

### [BASELINE] Input validation
**Principle:** Validate, sanitize, and bound all external input before processing.
**Rationale:** Prevents injection attacks, DoS via large payloads, and type confusion.
**Applies when:** touches=user_input
```

### 5.3 Low-Confidence TaskProfile Fallback

If `taskProfile.confidence < 0.5`:
- Include 1 additional baseline principle (top 3 instead of top 2)
- Include top 2 global high-severity patterns regardless of tag matching

### 5.4 Conflict Precedence Order

When two patterns or principles conflict, use this precedence order:

```
security > privacy > backcompat > correctness > performance > style
```

**For v1:** Simplified to: `security > correctness > everything else`

When selecting patterns for injection:
- If two patterns conflict, inject only the higher-precedence one
- Optionally include a one-line note: "Overrides conflicting [category] guidance"

**Note:** Full conflict detection and resolution is deferred to v2. For v1, precedence is applied only when conflicts are explicitly detected via `conflictSignals` in the EvidenceBundle.

### 5.5 Tracking Injection and Adherence

When a Pattern/Principle is injected:
1. Record in InjectionLog: `{ patternId, principleId, issueId, injectedAt, target }`

After PR Review, for each finding that maps to a pattern:
1. Check InjectionLog: Was this pattern injected for this issue?
2. Set `occurrence.wasInjected = true/false`
3. If injected, analyze implementation: Did it follow the warning?
4. Set `occurrence.wasAdheredTo = true/false/null`

---

## 6. Baseline Principles

### 6.1 Initial Set (v1)

| ID | Principle | Rationale | Touches | External Ref |
|----|-----------|-----------|---------|--------------|
| B01 | Always use parameterized queries for SQL. Never interpolate user input into query strings. | Prevents SQL injection, the most common and dangerous database vulnerability. | database, user_input | CWE-89 |
| B02 | Validate, sanitize, and bound all external input before processing. Reject unexpected types, formats, and sizes. | Prevents injection attacks, type confusion, and DoS via malformed input. | user_input | CWE-20 |
| B03 | Never log secrets, credentials, API keys, or PII. Redact or omit sensitive fields. | Prevents credential leakage through log aggregation and monitoring systems. | logging, auth | CWE-532 |
| B04 | Require explicit authorization checks before sensitive operations. Never rely on implicit permissions. | Prevents privilege escalation and unauthorized access to protected resources. | auth, authz | CWE-862 |
| B05 | Set timeouts on all network calls. No unbounded waits. | Prevents resource exhaustion and cascading failures from slow/unresponsive services. | network | — |
| B06 | Implement retry with exponential backoff, jitter, and maximum attempt limits. | Prevents retry storms and allows graceful degradation during outages. | network | — |
| B07 | Use idempotency keys for operations that cannot be safely retried. | Prevents duplicate processing and data corruption during network retries. | network, database | — |
| B08 | Enforce size limits and rate limits on user-provided data and requests. | Prevents DoS attacks and resource exhaustion from malicious or buggy clients. | user_input, api | CWE-400 |
| B09 | Require migration plan with rollback strategy for all schema changes. | Prevents data loss and enables recovery from failed deployments. | schema | — |
| B10 | Define error contract (status codes, error shapes, error codes) before implementation. | Ensures consistent error handling across the system and clear client expectations. | api | — |

### 6.2 Baseline Configuration

All baseline principles have:
- `origin: 'baseline'`
- `confidence: 0.9`
- `permanent: true`
- `status: 'active'`
- `injectInto: 'both'`

### 6.3 Baseline Lifecycle

- Baselines are NOT subject to time decay
- Baselines can be superseded (wording improved) but not archived
- Baselines are always considered for injection if `touches` overlap
- New baselines require explicit addition to this spec

---

## 7. Invalidation and Lifecycle

### 7.1 Pattern Invalidation Triggers

A pattern or its occurrences may be invalidated when:

1. **Source doc updated** — The cited source document has changed
2. **Pattern superseded** — A clearer/better pattern replaces it
3. **Confirmed false positive** — Manual or automated review determines attribution was wrong
4. **Confidence decay** — Time-based decay drops confidence below threshold

### 7.2 Source Doc Change Detection

When a document changes:

```
FUNCTION onDocumentChange(fingerprint: DocFingerprint, newContent: string):

  // Find occurrences citing this doc
  affectedOccurrences = PatternOccurrence.find({
    $or: [
      { 'carrierFingerprint.path': fingerprint.path },
      { 'originFingerprint.path': fingerprint.path },
      { 'provenanceChain': { $elemMatch: { path: fingerprint.path } } }
    ],
    status: 'active'
  })

  FOR each occurrence IN affectedOccurrences:
    // Check if the specific cited section changed
    IF sectionChanged(occurrence.carrierFingerprint, newContent):
      occurrence.status = 'inactive'
      occurrence.inactiveReason = 'superseded_doc'
      occurrence.save()

  // Recompute pattern stats
  FOR each unique patternId IN affectedOccurrences:
    recomputePatternStats(patternId)
```

### 7.3 Computed Statistics (Never Stored, Always Computed)

```typescript
interface PatternStats {
  totalOccurrences: number;           // COUNT(*) all occurrences
  activeOccurrences: number;          // COUNT(*) WHERE status = 'active'
  lastSeenActive: string | null;      // MAX(createdAt) WHERE status = 'active'
  injectionCount: number;             // COUNT(*) WHERE wasInjected = true
  adherenceRate: number | null;       // AVG(wasAdheredTo) WHERE wasInjected = true
}

FUNCTION computePatternStats(patternId: string): PatternStats
```

### 7.4 Archival Criteria

A pattern is archived (soft delete) if:

```
shouldArchive =
  pattern.permanent == false
  AND (
    activeOccurrences == 0
    OR attributionConfidence < 0.2
  )
  AND pattern.status != 'superseded'  // Superseded patterns stay for history
```

Archived patterns:
- Are NOT considered for injection
- Are retained for audit/history
- Can be un-archived if new occurrences appear

---

## 8. Filter Miss Learning

### 8.1 Detection

When a finding is attributed to a pattern:

```
FUNCTION checkForTaggingMiss(finding, pattern, taskProfile):

  // Was this pattern injected?
  wasInjected = InjectionLog.exists({
    patternId: pattern.id,
    issueId: finding.issueId
  })

  IF wasInjected:
    RETURN null  // Not a tagging miss

  // Would it have matched with different tags?
  wouldMatch = checkHypotheticalMatch(pattern, taskProfile)

  IF wouldMatch.result == true:
    CREATE TaggingMiss {
      findingId: finding.id,
      patternId: pattern.id,
      actualTaskProfile: taskProfile,
      requiredMatch: wouldMatch.requiredTags,
      missingTags: wouldMatch.missingTags
    }
```

### 8.2 Resolution Actions

Periodically review TaggingMiss records:

1. **Broaden pattern** — If pattern's `touches`/`technologies` are too narrow, expand them
2. **Improve extraction** — If taskProfile extraction consistently misses certain tags, improve the prompt
3. **Mark false positive** — If the pattern wouldn't actually have helped, mark accordingly

---

## 9. Context Pack Agent Requirements

### 9.1 Required Metadata Output

The Context Pack agent MUST output structured metadata for the meta-learning system:

```typescript
interface ContextPackMetadata {
  // Task classification (for injection filtering)
  taskProfile: {
    touches: Touch[];              // What does this task interact with?
    technologies: string[];        // What specific technologies?
    taskTypes: string[];           // What kind of task? (api, database, ui, etc.)
    confidence: number;            // How confident in this classification? (0-1)
  };

  // Extracted constraints (for conflict detection)
  constraintsExtracted: {
    constraint: string;            // The constraint text
    source: DocFingerprint;        // Where it came from
    section: string;               // Section within source
    modality: 'MUST' | 'SHOULD' | 'MAY';
  }[];

  // Sources consulted (for provenance)
  sourcesConsulted: DocFingerprint[];

  // Pre-computed signals (for attribution efficiency)
  conflictsDetected: ConflictSignal[];

  vaguenessFlags: {
    section: string;               // Which section has vague language
    signals: string[];             // The vague terms detected
  }[];
}
```

### 9.2 Injection Point

```
BEFORE Context Pack agent starts:
  1. Extract preliminary taskProfile from Linear issue (labels, description)
  2. Load relevant warnings: selectWarningsForInjection('context-pack', preliminaryTaskProfile)
  3. Inject warnings into Context Pack agent system prompt

AFTER Context Pack is created:
  1. Extract actual taskProfile from ContextPackMetadata
  2. Load refined warnings: selectWarningsForInjection('spec', actualTaskProfile)
  3. Inject warnings into Spec agent system prompt
```

---

## 10. Scope

### 10.1 Included in v1

- [x] PatternDefinition + PatternOccurrence entities
- [x] DerivedPrinciple entity (for baselines)
- [x] ExecutionNoncompliance entity
- [x] DocUpdateRequest entity
- [x] TaskProfile entity
- [x] TaggingMiss entity
- [x] InjectionLog entity
- [x] Evidence features + deterministic failureMode resolver
- [x] 10 baseline principles with `touches` filtering
- [x] Tiered injection (2 baseline + 4 learned, cap 6, security priority)
- [x] Conflict precedence order (simplified for v1)
- [x] Injection/adherence tracking
- [x] Filter miss detection
- [x] Source doc change detection for invalidation
- [x] Context Pack metadata requirements

### 10.2 Deferred to v2

- [ ] Semantic clustering (SimHash64) for near-duplicate pattern detection
- [ ] Automatic DerivedPrinciple generation from pattern clusters (3+ similar patterns)
- [ ] Conflict graphs and automatic conflict resolution suggestions
- [ ] Confidence constant calibration based on observed data
- [ ] Positive metrics tracking (review efficiency, adherence rates)
- [ ] Human review UI for pattern management
- [ ] A/B testing for injection strategies

---

## Appendix A: Example Flows

### A.1 SQL Injection Attribution Flow

```
1. Bug Scout finds: "SQL injection in search endpoint"
2. Bug Judge confirms: "CONFIRMED - no parameterization"
3. Attribution Agent runs:
   - Searches Context Pack for SQL guidance
   - Finds: Section 4.2 says "Use template literals for readable queries"
   - Extracts evidence:
     {
       carrierStage: 'context-pack',
       carrierQuote: 'Use template literals for readable queries',
       carrierQuoteType: 'verbatim',
       hasCitation: true,
       citedSources: ['DB_PATTERNS.md#L45'],
       sourceRetrievable: true,
       sourceAgreesWithCarrier: true,  // Source also says this (source is wrong)
       mandatoryDocMissing: false,
       vaguenessSignals: [],
       conflictSignals: []
     }
4. Resolver determines: failureMode = 'incorrect' (source agrees, so not drift)
5. Creates PatternDefinition + PatternOccurrence
6. Next time Context Pack agent runs for database task:
   - Warning injected: "Bad guidance: 'Use template literals...' Do instead: parameterized queries"
```

### A.2 ExecutionNoncompliance Flow

```
1. Security Scout finds: "No input validation on user search"
2. Security Judge confirms
3. Attribution Agent runs:
   - Searches Context Pack for input validation guidance
   - Finds: Section 2.1 explicitly says "Validate all user input before processing"
   - Guidance exists and is correct!
4. Creates ExecutionNoncompliance (not Pattern):
   {
     violatedGuidanceStage: 'context-pack',
     violatedGuidanceLocation: 'Section 2.1',
     violatedGuidanceExcerpt: 'Validate all user input before processing',
     possibleCauses: ['salience']  // Warning wasn't prominent enough
   }
5. No Pattern created — guidance was correct, agent ignored it
6. This informs warning format improvements, not content changes
```

### A.3 Decisions Finding Flow

```
1. Decisions Scout finds: "Caching strategy undocumented"
2. Decisions Judge confirms
3. Attribution Agent runs:
   - This is a decisions finding
   - Creates DocUpdateRequest:
     {
       targetDoc: 'ARCHITECTURE.md',
       updateType: 'add_decision',
       description: 'Add caching invalidation strategy for user sessions'
     }
   - Checks: Is this a recurring pattern? (3+ times for caching decisions)
   - If NO: Only DocUpdateRequest, no Pattern
   - If YES: Also creates Pattern or DerivedPrinciple for caching decisions
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Carrier** | The document (Context Pack or Spec) where bad guidance appeared |
| **Origin** | The ultimate source of bad guidance (e.g., architecture doc, web search) |
| **Provenance Chain** | The full path from finding back to origin |
| **Evidence Bundle** | Structured features extracted by Attribution Agent |
| **Failure Mode** | Classification of how guidance failed (incorrect, incomplete, etc.) |
| **Touch** | A category of system interaction (user_input, database, etc.) |
| **Task Profile** | Classification of what a task interacts with (touches, technologies, taskTypes) |
| **Baseline Principle** | A known-good guardrail seeded at system start |
| **Derived Principle** | A principle extracted from pattern clusters |
| **Tagging Miss** | When a pattern should have matched but wasn't injected due to taskProfile gaps |
| **Execution Noncompliance** | When an agent ignored correct guidance (not a guidance error) |
| **Injection Log** | Record of what patterns/principles were injected for a given issue |
| **Aligned Baseline** | A baseline principle that a learned pattern falls under (for inferred pattern gate) |

---

## Appendix C: Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Use deterministic resolver instead of LLM judgment for failureMode | Consistency, debuggability, reversibility | 2026-01-18 |
| Separate Pattern from ExecutionNoncompliance | Prevents polluting pattern store with "agent ignored guidance" cases | 2026-01-18 |
| Keep PatternOccurrence separate from PatternDefinition | Enables clean invalidation, per-occurrence evidence, injection tracking | 2026-01-18 |
| Use `touches` for filtering instead of strict technology tags | More robust matching when technology tags are incomplete | 2026-01-18 |
| Cap injection at 6 (2 baseline + 4 learned) | Balance between coverage and warning fatigue | 2026-01-18 |
| Security patterns get priority in injection selection | Security issues are disproportionately costly | 2026-01-18 |
| Decisions findings primarily create DocUpdateRequests, not Patterns | Aligns with Decisions Judge principle; prevents tautological patterns | 2026-01-18 |
| Severity inherited from original finding | Pattern severity reflects the real-world impact observed | 2026-01-18 |
| Conflict precedence: security > correctness > everything else (v1) | Simplifies conflict resolution; full order deferred to v2 | 2026-01-18 |
| InjectionLog as separate entity | Enables adherence tracking without mutating Pattern/Occurrence | 2026-01-18 |
| primaryCarrierQuoteType on PatternDefinition | Enables filtering inferred patterns without querying occurrences | 2026-01-18 |
| alignedBaselineId for inferred pattern gate | Allows novel security patterns to be injected with 1 occurrence if they align with baselines | 2026-01-18 |
