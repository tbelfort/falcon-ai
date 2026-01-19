# Meta-Learning Pattern Attribution System Specification v1.0

**Status:** Final Draft
**Last Updated:** 2026-01-18
**Authors:** Human + Claude Opus 4.5 + GPT-5 Pro review
**Previous Version:** v0.9

---

## Changelog from v0.9

| Issue | Fix | Section |
|-------|-----|---------|
| `FindingCategory` didn't include 'decisions' but `DocUpdateRequest` used it | Added 'decisions' to `FindingCategory` | 2.1 |
| `onDocumentChange()` only worked for git fingerprints | Branch by `fingerprint.kind` for all variants | 7.2 |
| Step E "quote exists → incorrect" was too strong | Added `carrierInstructionKind` evidence feature | 2.2, 3.3 |
| Pattern identity/dedupe underspecified | Added deterministic `patternKey` with uniqueness | 2.1 |
| Baseline tie-breaking not deterministic | Added `touchOverlapCount desc, id asc` ordering | 5.1 |
| Pattern severity semantics unclear for multiple occurrences | Added `severityMax` field to PatternDefinition | 2.1 |
| No DecisionClass enum for counting decisions | Added `DecisionClass` enum | 2.5 |
| ExecutionNoncompliance `ambiguity` cause was misplaced | Clarified routing rule | 2.4 |
| No mechanism for CRITICAL novel inferred findings | Added `ProvisionalAlert` entity | 2.9 |
| No tracking for repeated noncompliance | Added `SalienceIssue` entity | 2.10 |
| relevanceWeight didn't prioritize touches over tech | Updated formula: `0.15*touches + 0.05*tech` | 4.2 |
| Conflict precedence incomplete | Added `privacy` and `backcompat` | 5.4 |
| Meta-warnings could be cited as sources | Added non-citable rule to prompts | 9.3 |
| TaskProfile extraction had no validation | Added deterministic validators | 9.4 |
| Baseline B11 missing | Added Least Privilege / Credential Scope | 6.1 |

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
│   • Output: Pattern OR ExecutionNoncompliance OR DocUpdateRequest OR ProvisionalAlert
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
7. **Pattern content immutability** — `patternContent` is never mutated; supersede instead
8. **Invisible infrastructure** — Pattern attribution lives in the orchestrator, not task files. TASKS/*.md files remain clean and unaware of meta-learning. This allows task optimization without breaking the feedback loop.

### 1.4 Key Insight: Evidence Features + Deterministic Resolver

Instead of asking an LLM to "choose the failure mode," we:
1. Have the Attribution Agent output **structured evidence features**
2. Run a **deterministic decision tree** to resolve failureMode

This gives us:
- Consistency across runs
- Debuggability (see why decisions were made)
- Reversibility (improve rules without rewriting history)

### 1.5 Attribution Strategy (C + A)

**Recommended implementation approach:**

- **Context Pack agent** precomputes and emits doc-level features:
  - `taskProfile`, `constraintsExtracted`, `sourcesConsulted`, `conflictsDetected`, `vaguenessFlags`

- **Spec agent** emits its own lightweight metadata:
  - Spec-level vagueness flags, `hasTestableAcceptanceCriteria`

- **Attribution Agent** runs **per-finding** (not batched):
  - Simpler to make correct
  - Can parallelize if needed
  - Lower risk of cross-contamination between findings

Batching (multiple findings per Attribution Agent call) is deferred to v2 after strict JSON schema validation is in place.

---

## 2. Entity Definitions

### 2.1 PatternDefinition

A reusable pattern representing bad guidance that led to a confirmed finding.

```typescript
interface PatternDefinition {
  id: string;                          // UUID (surrogate key)
  patternKey: string;                  // Deterministic uniqueness key (UNIQUE INDEX)
  contentHash: string;                 // SHA-256 of normalized patternContent

  // What was wrong
  patternContent: string;              // The actual bad guidance text (IMMUTABLE)
  failureMode: FailureMode;
  findingCategory: FindingCategory;
  severity: Severity;                  // Inherited from original finding
  severityMax: Severity;               // MAX severity across all active occurrences

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

#### Pattern Identity / Deduplication

The `patternKey` is a deterministic uniqueness key:

```typescript
patternKey = sha256(
  carrierStage + "|" +
  normalizeWhitespace(patternContent) + "|" +
  findingCategory
)
```

**Why this composition:**
- `carrierStage`: Same quote in context-pack vs spec are different patterns
- `patternContent`: The actual bad guidance (normalized)
- `findingCategory`: Same quote causing security vs correctness issues are different patterns

**Why NOT include `failureMode`:** failureMode can change when evidence improves; identity shouldn't change.

**Enforcement:** UNIQUE INDEX on `patternKey`. If a second occurrence matches an existing patternKey, append to that pattern instead of creating a new one.

#### Severity Update Rule

When a new occurrence is created for an existing pattern:
```typescript
pattern.severityMax = max(pattern.severityMax, newOccurrence.severity)
```

This ensures injection priority reflects the worst observed impact.

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
  | 'compliance'          // Led to doc/spec deviation (maps to Docs/Spec Scout/Judge)
  | 'decisions';          // Missing/undocumented decisions (maps to Decisions Scout/Judge)
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
  severity: Severity;                  // Severity of THIS occurrence

  // Evidence (structured bundle from Attribution Agent)
  evidence: EvidenceBundle;

  // Provenance chain
  carrierFingerprint: DocFingerprint;  // Where bad guidance appeared
  originFingerprint?: DocFingerprint;  // Ultimate source (if traced)
  provenanceChain: DocFingerprint[];   // Full chain for audit

  // Section anchors for change detection
  carrierExcerptHash: string;          // SHA-256 of the specific cited excerpt
  originExcerptHash?: string;          // SHA-256 of origin excerpt (if traced)

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

  // NEW: Carrier instruction classification (for Step E)
  carrierInstructionKind: CarrierInstructionKind;

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

// NEW: Classification for Step E in failureMode resolver
type CarrierInstructionKind =
  | 'explicitly_harmful'           // Carrier explicitly recommends prohibited mechanism
  | 'benign_but_missing_guardrails' // Carrier gives valid advice but omits necessary constraints
  | 'descriptive'                  // Carrier describes behavior without recommending
  | 'unknown';                     // Could not determine

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
  | 'override';     // Agent intentionally overrode (rare)
```

**Note on ambiguity:** The `ambiguity` cause was removed from `NoncomplianceCause`. If guidance was ignored *because* it was ambiguous, this is a guidance problem, not an execution problem. Route to:
- `DocUpdateRequest(updateType='clarify_guidance')` AND
- `PatternDefinition(failureMode='ambiguous')`

Do NOT create `ExecutionNoncompliance` for ambiguity cases.

### 2.5 DocUpdateRequest

Triggered when a finding requires documentation update. Primary output for `decisions` findings.

```typescript
interface DocUpdateRequest {
  id: string;                          // UUID

  // Source
  findingId: string;
  issueId: string;
  findingCategory: FindingCategory;    // Now includes 'decisions'
  scoutType: string;                   // Which scout found this
  decisionClass?: DecisionClass;       // Required if findingCategory == 'decisions'

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

// NEW: Decision classification for counting recurrence
type DecisionClass =
  | 'caching'            // Caching invalidation, TTLs, strategies
  | 'retries'            // Retry policies, backoff strategies
  | 'timeouts'           // Timeout values, circuit breaker thresholds
  | 'authz_model'        // Permission models, role hierarchies
  | 'error_contract'     // Error codes, shapes, status codes
  | 'migrations'         // Schema migration strategies, rollback plans
  | 'logging_privacy'    // What to log, PII handling
  | 'backcompat';        // Breaking changes, deprecation policies
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
  injectedAlerts: string[];            // ProvisionalAlert IDs

  // Context
  taskProfile: TaskProfile;            // Profile used for selection

  // Timestamps
  injectedAt: string;
}
```

### 2.9 ProvisionalAlert (NEW)

Short-lived alerts for CRITICAL findings that don't yet meet the learned pattern gate.

```typescript
interface ProvisionalAlert {
  id: string;                          // UUID

  // Source
  findingId: string;
  issueId: string;

  // Content
  message: string;                     // Short actionable warning
  touches: Touch[];                    // For injection filtering

  // Where to inject
  injectInto: 'context-pack' | 'spec' | 'both';

  // Lifecycle
  expiresAt: string;                   // ISO 8601, default: createdAt + 14 days
  status: 'active' | 'expired' | 'promoted';
  promotedToPatternId?: string;        // If promoted to full pattern

  // Timestamps
  createdAt: string;
}
```

**Rules:**
- Created only for HIGH/CRITICAL security findings with `inferred` carrierQuoteType
- Does NOT require 2+ occurrences (unlike learned patterns)
- TTL of 14 days by default
- If the same issue recurs within TTL, promote to full PatternDefinition
- Keeps deterministic pattern gate intact while allowing immediate response

### 2.10 SalienceIssue (NEW)

Tracks guidance that is repeatedly ignored, suggesting a formatting/prominence problem.

```typescript
interface SalienceIssue {
  id: string;                          // UUID

  // What's being ignored
  guidanceLocationHash: string;        // SHA-256 of (stage + location + excerpt)
  guidanceStage: 'context-pack' | 'spec';
  guidanceLocation: string;            // Section reference
  guidanceExcerpt: string;             // The guidance being ignored

  // Tracking
  occurrenceCount: number;             // How many times ignored in windowDays
  windowDays: number;                  // Default: 30
  noncomplianceIds: string[];          // ExecutionNoncompliance IDs

  // Resolution
  status: 'pending' | 'resolved';
  resolution?: 'reformatted' | 'moved_earlier' | 'false_positive';

  // Timestamps
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}
```

**Rules:**
- Created when same `guidanceLocationHash` appears in 3+ ExecutionNoncompliance records within 30 days
- Does NOT automatically escalate prominence (v1)
- Surfaces for manual review of format/placement issues

---

## 3. Attribution Process

### 3.1 Trigger

Attribution runs after PR Review completes, for each **confirmed** finding (judgeVerdict == 'CONFIRMED').

### 3.2 Attribution Agent Responsibilities

For each confirmed finding:

1. **Locate the carrier** — Find where in Context Pack or Spec the problematic guidance appeared
2. **Extract evidence features** — Output structured EvidenceBundle (not free-form judgment)
3. **Classify carrier instruction** — Determine `carrierInstructionKind` for Step E
4. **Trace provenance** — If carrier cites a source, retrieve and compare
5. **Check for noncompliance** — Search full Context Pack/Spec for allegedly missing guidance

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

STEP E: Incorrect vs Incomplete (using carrierInstructionKind)
────────────────────────────────────────
  // CHANGED: No longer assumes "quote exists → incorrect"
  // Uses structured classification from Attribution Agent

  IF evidence.carrierQuoteType IN ('verbatim', 'paraphrase'):
    SWITCH evidence.carrierInstructionKind:
      CASE 'explicitly_harmful':
        // Carrier explicitly recommends prohibited mechanism
        // e.g., "Use template literals for SQL queries"
        failureMode = 'incorrect'
        EXIT

      CASE 'benign_but_missing_guardrails':
        // Carrier gives valid advice but omits constraints
        // e.g., "Retry failed requests" (no max/backoff)
        failureMode = 'incomplete'
        EXIT

      CASE 'descriptive':
        // Carrier describes without recommending
        // e.g., "The system uses string concatenation"
        failureMode = 'incomplete'
        EXIT

      CASE 'unknown':
        // Conservative default
        failureMode = 'incomplete'
        EXIT

  ELSE:
     // carrierQuoteType is 'inferred' — no direct quote found
     failureMode = 'incomplete'  // Conservative default
```

### 3.4 Pre-Pattern Check: ExecutionNoncompliance

**BEFORE** creating a Pattern with `failureMode = 'incomplete'` or `failureMode = 'missing_reference'`:

1. Search the FULL Context Pack for the allegedly missing guidance
2. Search the FULL Spec for the allegedly missing guidance
3. Use normalized keyword matching and semantic search

**IF guidance is found:**
- Do NOT create a Pattern
- Create ExecutionNoncompliance instead
- Record `violatedGuidanceExcerpt` with the found text
- Check for SalienceIssue trigger (3+ in 30 days)

**IF guidance is not found:**
- Proceed with Pattern creation

This prevents polluting the pattern store with "always mention X" when X was already mentioned.

### 3.5 Decisions Findings: Special Handling

When a finding comes from the Decisions Scout/Judge:

1. **ALWAYS** create a DocUpdateRequest
   - The Decisions Judge principle: "Doc update is REQUIRED, not optional"
   - Set `decisionClass` for recurrence counting

2. **ONLY** create a Pattern if:
   - Same `decisionClass` has been missed 3+ times (recurrence)
   - Decision class is high-risk: `authz_model`, `backcompat`, `logging_privacy`
   - It's a process failure: Context Pack systematically fails to prompt for this type

3. **PREFER** creating DerivedPrinciple (checklist) over granular patterns:
   - "If task touches `caching`, require invalidation strategy documentation"
   - This compresses many potential "document X" patterns into one principle

### 3.6 ProvisionalAlert Creation (NEW)

For HIGH/CRITICAL security findings with `inferred` carrierQuoteType that don't meet the normal pattern gate:

```
IF finding.severity IN ('HIGH', 'CRITICAL')
   AND finding.scoutType == 'security'
   AND evidence.carrierQuoteType == 'inferred'
   AND NOT meetsInferredGate(pattern)
THEN:
   CREATE ProvisionalAlert {
     findingId: finding.id,
     issueId: finding.issueId,
     message: generateShortWarning(finding),
     touches: taskProfile.touches,
     injectInto: evidence.carrierStage,
     expiresAt: now() + 14 days
   }
```

This provides immediate response to critical security issues without polluting the permanent pattern store.

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

  // CHANGED: Touches weighted higher than technologies
  relevanceWeight:
    baseRelevance = 1.0
    touchOverlaps = count of (pattern.touches ∩ taskProfile.touches)
    techOverlaps = count of (pattern.technologies ∩ taskProfile.technologies)
    relevanceWeight = min(baseRelevance + 0.15 * touchOverlaps + 0.05 * techOverlaps, 1.5)

  recencyWeight:
    IF daysSinceLastSeen <= 7  THEN 1.0
    IF daysSinceLastSeen <= 30 THEN 0.95
    IF daysSinceLastSeen <= 90 THEN 0.9
    ELSE 0.8
```

### 4.3 Tie-Breaking (NEW)

When injectionPriority values are equal, use deterministic tie-breaking:

```
ORDER BY:
  1. severity DESC (CRITICAL > HIGH > MEDIUM > LOW)
  2. daysSinceLastSeen ASC (more recent first)
  3. id ASC (stable ordering by pattern ID)
```

For baseline principles (which all have confidence 0.9):

```
ORDER BY:
  1. touchOverlapCount DESC (more overlaps first)
  2. id ASC (B01, B02, ... for stable ordering)
```

### 4.4 Special Rules for Inferred Patterns

Patterns with `primaryCarrierQuoteType == 'inferred'` have lower base confidence (0.40).

**Injection gate:** Do not inject `inferred` patterns unless:
- `activeOccurrenceCount >= 2`, OR
- `severity` is HIGH or CRITICAL AND `alignedBaselineId` is set (pattern aligns with a baseline principle), OR
- `failureMode == 'missing_reference'`

**Baseline alignment:** When creating a pattern, check if its `touches` and `findingCategory` align with an existing baseline principle. If so, set `alignedBaselineId`. This allows novel security issues to be injected even with only one occurrence, if they fall under an existing baseline category.

**ProvisionalAlert fallback:** If an inferred pattern doesn't meet the gate but is HIGH/CRITICAL security, create a ProvisionalAlert instead (see Section 3.6).

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

  // CHANGED: Deterministic tie-breaking
  selectedPrinciples = eligiblePrinciples
    .sortBy(p => [
      -countOverlap(p.touches, taskProfile.touches),  // touchOverlapCount DESC
      p.id                                            // id ASC
    ])
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

  // Apply inferred gate (see Section 4.4)
  eligiblePatterns = eligiblePatterns.filter(p =>
    p.primaryCarrierQuoteType != 'inferred'
    OR meetsInferredGate(p)
  )

  // Compute injection priority for each
  FOR each pattern IN eligiblePatterns:
    pattern.injectionPriority = computeInjectionPriority(pattern, taskProfile)

  // STEP 3: Select with security priority
  securityPatterns = eligiblePatterns
    .filter(p => p.findingCategory == 'security')
    .sortBy(p => [
      -p.injectionPriority,                           // priority DESC
      SEVERITY_ORDER[p.severityMax],                  // severity DESC
      p.id                                            // id ASC
    ])
    .take(3)

  remainingSlots = maxTotal - selectedPrinciples.length - securityPatterns.length

  otherPatterns = eligiblePatterns
    .filter(p => p.findingCategory != 'security')
    .sortBy(p => [
      -p.injectionPriority,
      SEVERITY_ORDER[p.severityMax],
      p.id
    ])
    .take(remainingSlots)

  // STEP 4: Select active ProvisionalAlerts
  activeAlerts = ProvisionalAlert.find({
    status: 'active',
    injectInto: target OR 'both',
    touches: { $overlap: taskProfile.touches },
    expiresAt: { $gt: now() }
  })
  // ProvisionalAlerts are additive (don't count against maxTotal)

  // STEP 5: Combine and format
  RETURN formatWarnings(selectedPrinciples + securityPatterns + otherPatterns + activeAlerts)
```

### 5.2 Injection Format

```markdown
## Warnings from Past Issues (auto-generated)

> **Meta-guidance notice:** These warnings are auto-generated from past issues.
> Do NOT cite them as authoritative sources. Only cite architecture docs, code, and specs.

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

### [PROVISIONAL ALERT] Potential credential exposure
**Warning:** Recent HIGH-severity finding suggests credential logging risk.
**Do:** Ensure no secrets, tokens, or credentials are logged.
**Expires:** 2026-02-01
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

**For v1:** `security > privacy > backcompat > correctness > everything else`

When selecting patterns for injection:
- If two patterns conflict, inject only the higher-precedence one
- Optionally include a one-line note: "Overrides conflicting [category] guidance"

**Note:** Full conflict detection and resolution is deferred to v2. For v1, precedence is applied only when conflicts are explicitly detected via `conflictSignals` in the EvidenceBundle.

### 5.5 Tracking Injection and Adherence

When a Pattern/Principle/Alert is injected:
1. Record in InjectionLog: `{ patternId, principleId, alertId, issueId, injectedAt, target }`

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
| B11 | Use least-privilege credentials for DB/service access. Don't run migrations/ops with app runtime creds. Scope tokens tightly. | Reduces blast radius of credential compromise and limits damage from bugs. | database, auth, config | CWE-250 |

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

  // CHANGED: Branch by fingerprint.kind for all variants
  matchQuery = buildMatchQuery(fingerprint)

  // Find occurrences citing this doc
  affectedOccurrences = PatternOccurrence.find({
    $or: [
      { carrierFingerprint: matchQuery },
      { originFingerprint: matchQuery },
      { provenanceChain: { $elemMatch: matchQuery } }
    ],
    status: 'active'
  })

  FOR each occurrence IN affectedOccurrences:
    // Check if the specific cited section changed
    IF sectionChanged(occurrence, newContent):
      occurrence.status = 'inactive'
      occurrence.inactiveReason = 'superseded_doc'
      occurrence.save()

  // Recompute pattern stats
  FOR each unique patternId IN affectedOccurrences:
    recomputePatternStats(patternId)


FUNCTION buildMatchQuery(fingerprint: DocFingerprint): Query
  // Branch by kind to use appropriate matching fields
  SWITCH fingerprint.kind:
    CASE 'git':
      RETURN { kind: 'git', repo: fingerprint.repo, path: fingerprint.path }
    CASE 'linear':
      RETURN { kind: 'linear', docId: fingerprint.docId }
    CASE 'web':
      RETURN { kind: 'web', url: fingerprint.url }
    CASE 'external':
      RETURN { kind: 'external', id: fingerprint.id }


FUNCTION sectionChanged(occurrence: PatternOccurrence, newContent: string): boolean
  // Compare excerpt hashes to detect section-level changes
  newExcerptHash = extractAndHashExcerpt(
    newContent,
    occurrence.evidence.carrierLocation
  )
  RETURN newExcerptHash != occurrence.carrierExcerptHash
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

### 7.5 ProvisionalAlert Lifecycle

```
FUNCTION processExpiredAlerts():
  expiredAlerts = ProvisionalAlert.find({
    status: 'active',
    expiresAt: { $lte: now() }
  })

  FOR each alert IN expiredAlerts:
    // Check if recurrence happened during alert window
    matchingPatterns = PatternDefinition.find({
      touches: { $overlap: alert.touches },
      findingCategory: 'security',
      createdAt: { $gte: alert.createdAt }
    })

    IF matchingPatterns.length > 0:
      // Promote to full pattern
      alert.status = 'promoted'
      alert.promotedToPatternId = matchingPatterns[0].id
    ELSE:
      alert.status = 'expired'

    alert.save()
```

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

### 9.3 Non-Citable Meta-Warning Rule (NEW)

The Context Pack and Spec agent prompts MUST include this instruction:

```markdown
## Important: Meta-Guidance vs Authoritative Sources

The "Warnings from Past Issues" section contains **meta-guidance** auto-generated
from past review findings. These warnings help avoid past mistakes.

**DO NOT cite warnings as sources of truth.**
Only cite:
- Architecture documents
- Code files
- External specifications
- Approved design documents

Warnings inform your approach but are not authoritative constraints.
```

This prevents the self-referential loop where injected warnings get cited as constraints.

### 9.4 TaskProfile Validation (NEW)

After Context Pack agent outputs `taskProfile`, run deterministic validators:

```
FUNCTION validateTaskProfile(
  taskProfile: TaskProfile,
  constraints: ConstraintExtracted[]
): ValidatedTaskProfile

  corrections = []

  // Check for obvious database indicators
  IF constraints.any(c => matchesDBKeywords(c.constraint))
     AND 'database' NOT IN taskProfile.touches:
    corrections.push({ add: 'database', reason: 'constraint mentions SQL/DB' })

  // Check for auth/authz indicators
  IF constraints.any(c => matchesAuthKeywords(c.constraint))
     AND 'authz' NOT IN taskProfile.touches
     AND 'auth' NOT IN taskProfile.touches:
    corrections.push({ add: 'authz', reason: 'constraint mentions permissions/roles' })

  // Check for network indicators
  IF constraints.any(c => matchesNetworkKeywords(c.constraint))
     AND 'network' NOT IN taskProfile.touches:
    corrections.push({ add: 'network', reason: 'constraint mentions HTTP/API calls' })

  // Apply corrections
  IF corrections.length > 0:
    taskProfile.touches = union(taskProfile.touches, corrections.map(c => c.add))
    taskProfile.confidence = taskProfile.confidence * 0.8  // Lower confidence on auto-correction

  RETURN taskProfile


FUNCTION matchesDBKeywords(text: string): boolean
  keywords = ['SQL', 'Postgres', 'MySQL', 'database', 'query', 'SELECT', 'INSERT', 'UPDATE']
  RETURN keywords.any(k => text.toLowerCase().includes(k.toLowerCase()))

FUNCTION matchesAuthKeywords(text: string): boolean
  keywords = ['permission', 'role', 'authorize', 'authz', 'ACL', 'access control', 'privilege']
  RETURN keywords.any(k => text.toLowerCase().includes(k.toLowerCase()))

FUNCTION matchesNetworkKeywords(text: string): boolean
  keywords = ['HTTP', 'API', 'fetch', 'request', 'endpoint', 'REST', 'GraphQL', 'outbound']
  RETURN keywords.any(k => text.toLowerCase().includes(k.toLowerCase()))
```

This prevents the most expensive tagging misses where obvious touches are not tagged.

---

## 10. Scope

### 10.1 Included in v1

- [x] PatternDefinition + PatternOccurrence entities with patternKey deduplication
- [x] DerivedPrinciple entity (for baselines)
- [x] ExecutionNoncompliance entity (without ambiguity cause)
- [x] DocUpdateRequest entity with DecisionClass enum
- [x] TaskProfile entity with validation
- [x] TaggingMiss entity
- [x] InjectionLog entity
- [x] ProvisionalAlert entity for CRITICAL inferred findings
- [x] SalienceIssue entity for repeated noncompliance tracking
- [x] Evidence features + deterministic failureMode resolver with carrierInstructionKind
- [x] 11 baseline principles with `touches` filtering (including B11: Least Privilege)
- [x] Tiered injection (2 baseline + 4 learned, cap 6, security priority)
- [x] Conflict precedence order (security > privacy > backcompat > correctness)
- [x] Injection/adherence tracking
- [x] Filter miss detection
- [x] Source doc change detection for all DocFingerprint kinds
- [x] Context Pack metadata requirements with validation
- [x] Non-citable meta-warning rule
- [x] Deterministic tie-breaking for all selections

### 10.2 Deferred to v2

- [ ] Semantic clustering (SimHash64) for near-duplicate pattern detection
- [ ] Automatic DerivedPrinciple generation from pattern clusters (3+ similar patterns)
- [ ] Conflict graphs and automatic conflict resolution suggestions
- [ ] Confidence constant calibration based on observed data
- [ ] Positive metrics tracking (review efficiency, adherence rates)
- [ ] Human review UI for pattern management
- [ ] A/B testing for injection strategies
- [ ] Batched attribution (multiple findings per agent call)
- [ ] Automatic ExecutionNoncompliance escalation (v1 is record-only)

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
       carrierInstructionKind: 'explicitly_harmful',  // NEW
       hasCitation: true,
       citedSources: ['DB_PATTERNS.md#L45'],
       sourceRetrievable: true,
       sourceAgreesWithCarrier: true,
       mandatoryDocMissing: false,
       vaguenessSignals: [],
       conflictSignals: []
     }
4. Resolver determines: failureMode = 'incorrect' (explicitly_harmful)
5. Computes patternKey = sha256('context-pack|Use template literals...|security')
6. Checks: Does pattern with this patternKey exist?
   - If YES: Append occurrence to existing pattern, update severityMax
   - If NO: Create new PatternDefinition + PatternOccurrence
7. Next time Context Pack agent runs for database task:
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
     possibleCauses: ['salience']
   }
5. Checks SalienceIssue trigger:
   - Same guidanceLocationHash ignored 3+ times in 30 days?
   - If YES: Create/update SalienceIssue for manual review
6. No Pattern created — guidance was correct, agent ignored it
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
       decisionClass: 'caching',  // NEW
       description: 'Add caching invalidation strategy for user sessions'
     }
   - Checks: Is this a recurring pattern? (3+ times for 'caching' decisionClass)
   - If NO: Only DocUpdateRequest, no Pattern
   - If YES: Also creates Pattern or DerivedPrinciple for caching decisions
```

### A.4 ProvisionalAlert Flow (NEW)

```
1. Security Scout finds: "Potential SSRF in image proxy"
2. Security Judge confirms: HIGH severity
3. Attribution Agent runs:
   - Cannot find verbatim/paraphrase carrier quote
   - carrierQuoteType: 'inferred'
   - Checks inferred gate: 1 occurrence, no alignedBaselineId
   - Gate NOT met → no Pattern created
4. ProvisionalAlert created:
   {
     message: 'SSRF risk: Validate and allowlist URLs before fetching external resources',
     touches: ['network', 'user_input'],
     injectInto: 'context-pack',
     expiresAt: now() + 14 days
   }
5. Next 14 days: Alert is injected for matching tasks
6. If similar finding occurs → Promote to full Pattern
   If no recurrence → Alert expires silently
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
| **Pattern Key** | Deterministic uniqueness key for pattern deduplication |
| **Provisional Alert** | Short-lived warning for CRITICAL findings that don't yet meet pattern gate |
| **Salience Issue** | Tracking for guidance repeatedly ignored (formatting/prominence problem) |
| **Decision Class** | Category of undocumented decisions for recurrence counting |
| **Carrier Instruction Kind** | Classification of how carrier guidance relates to the finding |

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
| Conflict precedence: security > privacy > backcompat > correctness (v1) | Comprehensive conflict resolution; backcompat can cause production outages | 2026-01-18 |
| InjectionLog as separate entity | Enables adherence tracking without mutating Pattern/Occurrence | 2026-01-18 |
| primaryCarrierQuoteType on PatternDefinition | Enables filtering inferred patterns without querying occurrences | 2026-01-18 |
| alignedBaselineId for inferred pattern gate | Allows novel security patterns to be injected with 1 occurrence if they align with baselines | 2026-01-18 |
| Add carrierInstructionKind to EvidenceBundle | Fixes Step E "quote exists → incorrect" being too strong | 2026-01-18 |
| Add patternKey for deterministic deduplication | Prevents duplicate patterns from multiple runs | 2026-01-18 |
| Add ProvisionalAlert entity | Responds to CRITICAL findings without polluting pattern store | 2026-01-18 |
| Add SalienceIssue entity (record-only for v1) | Tracks repeated noncompliance for format review without auto-escalation | 2026-01-18 |
| Weight touches higher than technologies in relevanceWeight | Touches are more robust abstraction than tech tags | 2026-01-18 |
| Remove ambiguity from NoncomplianceCause | Ambiguity is a guidance problem, not execution problem | 2026-01-18 |
| Add DecisionClass enum | Enables deterministic counting for decisions recurrence | 2026-01-18 |
| Add B11 (Least Privilege) | Common security pattern that pays rent | 2026-01-18 |
| Add non-citable meta-warning rule | Prevents self-referential citation loops | 2026-01-18 |
| Add TaskProfile validation | Catches obvious tagging misses deterministically | 2026-01-18 |
| Treat patternContent as immutable | Preserves contentHash meaning; supersede instead of mutate | 2026-01-18 |
| Branch onDocumentChange by fingerprint.kind | Fixes detection for non-git fingerprints | 2026-01-18 |
| Store excerptHash on occurrences | Enables section-level change detection | 2026-01-18 |
| Use C+A attribution strategy | Precompute doc-level features + per-finding attribution for correctness | 2026-01-18 |
