# Phase 1: Data Layer Foundation

**Parent Document:** `specs/spec-pattern-attribution-v1.0.md`
**Dependencies:** None (this is the foundation)
**Outputs Required By:** Phase 2, Phase 3, Phase 4, Phase 5

---

## 1. Overview

This phase establishes the data layer for the Pattern Attribution System. It includes:
- Zod schemas for all 14 entities (8 original + 2 new: ProvisionalAlert, SalienceIssue + 4 kill switch: PatternCreationState, AttributionHealthMetrics, KillSwitchStatus, AttributionOutcome)
- SQLite database with better-sqlite3 (14 tables total)
- Repository pattern for data access (12 repositories including KillSwitchRepository)
- Baseline principles seeding (11 baselines including B11: Least Privilege)
- Kill switch data layer for attribution health monitoring (Section 11 of main spec)
- Unit tests

---

## 2. Dependencies Research

**Reference Document:** `ai_docs/phase-1-dependencies.md`

This phase requires research on three key dependencies. The research document contains:

### 2.1 better-sqlite3 (^11.0.0)

- **WAL Mode:** Required for concurrent read/write access. Enable with `db.pragma('journal_mode = WAL')`.
- **Foreign Keys:** Must enable per-connection with `db.pragma('foreign_keys = ON')`.
- **Transactions:** Use `db.transaction()` wrapper for atomic operations. Does NOT work with async functions.
- **Prepared Statements:** Use `db.prepare()` for all queries to prevent SQL injection and improve performance.
- **Gotchas:** Synchronous execution, WAL file growth, single-writer serialization.

### 2.2 Zod (^3.24.0)

- **discriminatedUnion:** Use for `ScopeSchema` and `DocFingerprintSchema` for efficient parsing.
- **refine:** Use for custom validation rules (e.g., "PatternDefinition must have project-level scope").
- **safeParse vs parse:** Use `safeParse()` in repositories for better error handling.
- **passthrough:** Use for extensible config objects like `WorkspaceConfigSchema`.
- **Type Inference:** Always use `z.infer<typeof Schema>` to derive TypeScript types.

### 2.3 Vitest (^2.0.0)

- **SQLite Testing:** Use isolated temp databases per test run.
- **Fixtures:** Use `test.extend` for database fixtures with automatic cleanup.
- **Parallelism:** Disable parallel execution for SQLite tests (`singleFork: true`).
- **Cleanup:** Close DB and delete files in `afterEach`.

See `ai_docs/phase-1-dependencies.md` for complete API patterns, code examples, and gotchas.

---

## 3. Deliverables Checklist

- [ ] `src/schemas/index.ts` - All Zod schemas and type exports
- [ ] `src/schemas/validators.ts` - Custom validation helpers
- [ ] `src/storage/db.ts` - Database initialization
- [ ] `src/storage/repositories/pattern-definition.repo.ts`
- [ ] `src/storage/repositories/pattern-occurrence.repo.ts`
- [ ] `src/storage/repositories/derived-principle.repo.ts`
- [ ] `src/storage/repositories/execution-noncompliance.repo.ts`
- [ ] `src/storage/repositories/doc-update-request.repo.ts`
- [ ] `src/storage/repositories/tagging-miss.repo.ts`
- [ ] `src/storage/repositories/injection-log.repo.ts`
- [ ] `src/storage/repositories/provisional-alert.repo.ts` (NEW)
- [ ] `src/storage/repositories/salience-issue.repo.ts` (NEW)
- [ ] `src/storage/repositories/kill-switch.repo.ts` (NEW - Section 11)
- [ ] `src/storage/seed/baselines.ts` - 11 baseline principles
- [ ] `tests/schemas/*.test.ts` - Schema validation tests
- [ ] `tests/storage/*.test.ts` - Repository tests

---

## 4. Entity Definitions

### 4.1 Scope Type

```typescript
// File: src/schemas/index.ts
import { z } from 'zod';

// Scope - Hierarchical scoping for data isolation
export const ScopeSchema = z.discriminatedUnion('level', [
  z.object({
    level: z.literal('global')
  }),
  z.object({
    level: z.literal('workspace'),
    workspaceId: z.string().uuid()
  }),
  z.object({
    level: z.literal('project'),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid()
  })
]);

export type Scope = z.infer<typeof ScopeSchema>;

// v1.2: Workspace - groups related projects
export const WorkspaceConfigSchema = z.object({
  maxInjectedWarnings: z.number().int().positive().optional(),
  crossProjectWarningsEnabled: z.boolean().optional(),
  autoPromotionEnabled: z.boolean().optional()
}).passthrough();  // Allow additional settings

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(50),
  config: WorkspaceConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// v1.2: Project - corresponds to a code repository
export const ProjectConfigSchema = z.object({
  linearProjectId: z.string().optional(),
  linearTeamId: z.string().optional(),
  defaultTouches: z.array(z.string()).optional()
}).passthrough();  // Allow additional settings

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  repoOriginUrl: z.string().min(1),         // Canonical git remote URL
  repoSubdir: z.string().optional(),         // For monorepos
  repoPath: z.string().optional(),           // Local hint (informational)
  config: ProjectConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
```

### 4.2 Enums

```typescript
// FailureMode - How guidance failed
export const FailureModeSchema = z.enum([
  'incorrect',           // Guidance explicitly said to do the wrong thing
  'incomplete',          // Guidance omitted a necessary constraint/guardrail
  'missing_reference',   // Didn't cite a mandatory doc that was relevant
  'ambiguous',           // Guidance admits multiple reasonable interpretations
  'conflict_unresolved', // Contradictory guidance not reconciled
  'synthesis_drift'      // Carrier distorted the source meaning
]);

// FindingCategory - Maps to scout types (UPDATED: includes 'decisions')
export const FindingCategorySchema = z.enum([
  'security',    // Led to vulnerability (Security Scout)
  'correctness', // Led to bug (Bug Scout)
  'testing',     // Led to weak tests (Test Scout)
  'compliance',  // Led to doc/spec deviation (Docs/Spec Scout)
  'decisions'    // Missing/undocumented decisions (Decisions Scout) - NEW
]);

// Severity - Impact level
export const SeveritySchema = z.enum([
  'CRITICAL', // System-breaking, security breach, data loss
  'HIGH',     // Significant impact, must fix before merge
  'MEDIUM',   // Should fix, but not blocking
  'LOW'       // Minor issue, nice to fix
]);

// Touch - System interaction categories (used for filtering)
export const TouchSchema = z.enum([
  'user_input', // Handles external/user-provided data
  'database',   // Interacts with database
  'network',    // Makes network calls
  'auth',       // Handles authentication
  'authz',      // Handles authorization
  'caching',    // Implements caching
  'schema',     // Modifies data schemas
  'logging',    // Writes logs
  'config',     // Handles configuration
  'api'         // Exposes or consumes APIs
]);

// NoncomplianceCause - Why agent ignored correct guidance
// UPDATED: Removed 'ambiguity' - ambiguity is a guidance problem, not execution
export const NoncomplianceCauseSchema = z.enum([
  'salience',   // Warning wasn't prominent enough
  'formatting', // Warning format was unclear
  'override'    // Agent intentionally overrode
]);

// DocUpdateType - Type of documentation update needed
export const DocUpdateTypeSchema = z.enum([
  'add_decision',     // Document an undocumented decision
  'clarify_guidance', // Make ambiguous guidance clearer
  'fix_error',        // Correct incorrect guidance
  'add_constraint'    // Add missing constraint/guardrail
]);

// NEW: DecisionClass - Category of undocumented decisions for recurrence counting
export const DecisionClassSchema = z.enum([
  'caching',         // Caching invalidation, TTLs, strategies
  'retries',         // Retry policies, backoff strategies
  'timeouts',        // Timeout values, circuit breaker thresholds
  'authz_model',     // Permission models, role hierarchies
  'error_contract',  // Error codes, shapes, status codes
  'migrations',      // Schema migration strategies, rollback plans
  'logging_privacy', // What to log, PII handling
  'backcompat'       // Breaking changes, deprecation policies
]);

// NEW: CarrierInstructionKind - Classification for Step E in failureMode resolver
export const CarrierInstructionKindSchema = z.enum([
  'explicitly_harmful',           // Carrier explicitly recommends prohibited mechanism
  'benign_but_missing_guardrails', // Carrier gives valid advice but omits necessary constraints
  'descriptive',                  // Carrier describes behavior without recommending
  'unknown'                       // Could not determine
]);
```

### 4.3 DocFingerprint (Discriminated Union)

```typescript
// Universal document versioning across source types
export const DocFingerprintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('git'),
    repo: z.string().min(1),
    path: z.string().min(1),
    commitSha: z.string().length(40)
  }),
  z.object({
    kind: z.literal('linear'),
    docId: z.string().min(1),
    updatedAt: z.string().datetime(),
    contentHash: z.string().length(64)
  }),
  z.object({
    kind: z.literal('web'),
    url: z.string().url(),
    retrievedAt: z.string().datetime(),
    excerptHash: z.string().length(64)
  }),
  z.object({
    kind: z.literal('external'),
    id: z.string().min(1),
    version: z.string().optional()
  })
]);
```

### 4.4 EvidenceBundle

```typescript
// ConflictSignal - Detected conflict between sources
export const ConflictSignalSchema = z.object({
  docA: z.string().min(1),
  docB: z.string().min(1),
  topic: z.string().min(1),
  excerptA: z.string().optional(),
  excerptB: z.string().optional()
});

// EvidenceBundle - Structured output from Attribution Agent
// UPDATED: Added carrierInstructionKind for Step E fix
export const EvidenceBundleSchema = z.object({
  // Carrier identification
  carrierStage: z.enum(['context-pack', 'spec']),
  carrierQuote: z.string().min(1).max(2000),
  carrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  carrierLocation: z.string().min(1),

  // NEW: Carrier instruction classification for Step E
  carrierInstructionKind: CarrierInstructionKindSchema,

  // Citation analysis
  hasCitation: z.boolean(),
  citedSources: z.array(z.string()),
  sourceRetrievable: z.boolean(),
  sourceAgreesWithCarrier: z.boolean().nullable(),

  // Obligation analysis
  mandatoryDocMissing: z.boolean(),
  missingDocId: z.string().optional(),

  // Quality signals
  vaguenessSignals: z.array(z.string()),
  hasTestableAcceptanceCriteria: z.boolean(),

  // Conflict detection
  conflictSignals: z.array(ConflictSignalSchema)
});
```

### 4.5 PatternDefinition

```typescript
// PatternDefinition - Reusable pattern representing bad guidance
// UPDATED: Added scope, patternKey, severityMax
export const PatternDefinitionSchema = z.object({
  id: z.string().uuid(),                           // UUID (surrogate key)
  scope: ScopeSchema.refine(                       // MUST be project-level scope
    (s) => s.level === 'project',
    { message: 'PatternDefinition must have project-level scope' }
  ),
  patternKey: z.string().length(64),               // Deterministic uniqueness key (UNIQUE per scope)
  contentHash: z.string().length(64),              // SHA-256 of normalized patternContent

  // What was wrong (patternContent is IMMUTABLE)
  patternContent: z.string().min(1).max(2000),
  failureMode: FailureModeSchema,
  findingCategory: FindingCategorySchema,
  severity: SeveritySchema,                        // Inherited from original finding
  severityMax: SeveritySchema,                     // NEW: MAX severity across all active occurrences

  // What to do instead
  alternative: z.string().min(1).max(2000),
  consequenceClass: z.string().optional(),         // CWE-89, etc.

  // Where to inject warnings
  carrierStage: z.enum(['context-pack', 'spec']),

  // Evidence quality
  primaryCarrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),

  // Filtering criteria
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  touches: z.array(TouchSchema),

  // Baseline alignment
  alignedBaselineId: z.string().uuid().optional(),

  // Lifecycle
  status: z.enum(['active', 'archived', 'superseded']),
  permanent: z.boolean(),
  supersededBy: z.string().uuid().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

### 4.6 PatternOccurrence

```typescript
// PatternOccurrence - Specific instance of pattern attribution (append-only)
// UPDATED: Added scope, severity, carrierExcerptHash, originExcerptHash
export const PatternOccurrenceSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string().uuid(),

  // Scope (denormalized for query efficiency)
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source finding
  findingId: z.string().min(1),
  issueId: z.string().min(1),                      // Linear issue key (e.g., PROJ-123)
  prNumber: z.number().int().positive(),
  severity: SeveritySchema,                        // NEW: Severity of THIS occurrence

  // Evidence
  evidence: EvidenceBundleSchema,

  // Provenance chain
  carrierFingerprint: DocFingerprintSchema,
  originFingerprint: DocFingerprintSchema.optional(),
  provenanceChain: z.array(DocFingerprintSchema),

  // NEW: Section anchors for change detection
  carrierExcerptHash: z.string().length(64),       // SHA-256 of the specific cited excerpt
  originExcerptHash: z.string().length(64).optional(), // SHA-256 of origin excerpt (if traced)

  // Injection tracking
  wasInjected: z.boolean(),
  wasAdheredTo: z.boolean().nullable(),

  // Lifecycle
  status: z.enum(['active', 'inactive']),
  inactiveReason: z.enum([
    'superseded_doc',
    'pattern_archived',
    'false_positive'
  ]).optional(),

  // ProvisionalAlert link (for promotion tracking)
  provisionalAlertId: z.string().uuid().optional(),

  // Timestamps
  createdAt: z.string().datetime()
});
```

### 4.7 DerivedPrinciple

```typescript
// DerivedPrinciple - General principle (baseline or derived from patterns)
// UPDATED: Added scope (workspace-level)
export const DerivedPrincipleSchema = z.object({
  id: z.string().uuid(),
  scope: ScopeSchema.refine(                       // MUST be workspace-level scope
    (s) => s.level === 'workspace',
    { message: 'DerivedPrinciple must have workspace-level scope' }
  ),

  // Content
  principle: z.string().min(1).max(500),
  rationale: z.string().min(1).max(1000),

  // Origin
  origin: z.enum(['baseline', 'derived']),
  derivedFrom: z.array(z.string().uuid()).optional(),
  externalRefs: z.array(z.string()).optional(),    // CWE-89, OWASP-A03

  // Injection target
  injectInto: z.enum(['context-pack', 'spec', 'both']),

  // Filtering criteria
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()).optional(),
  taskTypes: z.array(z.string()).optional(),

  // Confidence
  confidence: z.number().min(0).max(1),

  // Lifecycle
  status: z.enum(['active', 'archived', 'superseded']),
  permanent: z.boolean(),
  supersededBy: z.string().uuid().optional(),

  // v1.2: Promotion tracking for idempotency and rollback
  promotionKey: z.string().optional(),  // Hash of sorted source pattern IDs

  // v1.2 FIX: Rollback/archive tracking fields
  archivedReason: z.string().optional(),  // Why was this archived (e.g., 'rollback', 'obsolete', 'incorrect')
  archivedAt: z.string().datetime().optional(),  // When was it archived
  archivedBy: z.string().optional(),  // Who/what archived it (e.g., 'system:rollback', 'user:admin@example.com')

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

### 4.8 ExecutionNoncompliance

```typescript
// ExecutionNoncompliance - Agent ignored correct guidance
// UPDATED: Added scope, removed 'ambiguity' from possibleCauses
export const ExecutionNoncomplianceSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source finding
  findingId: z.string().min(1),
  issueId: z.string().min(1),                      // Linear issue key (e.g., PROJ-123)
  prNumber: z.number().int().positive(),

  // What was ignored
  violatedGuidanceStage: z.enum(['context-pack', 'spec']),
  violatedGuidanceLocation: z.string().min(1),
  violatedGuidanceExcerpt: z.string().min(1).max(2000),

  // Analysis (no 'ambiguity' - that's a guidance problem)
  possibleCauses: z.array(NoncomplianceCauseSchema),

  // Timestamps
  createdAt: z.string().datetime()
});
```

### 4.9 DocUpdateRequest

```typescript
// DocUpdateRequest - Documentation update needed
// UPDATED: Added scope, decisionClass field
export const DocUpdateRequestSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  findingId: z.string().min(1),
  issueId: z.string().min(1),                      // Linear issue key (e.g., PROJ-123)
  findingCategory: FindingCategorySchema,          // Now includes 'decisions'
  scoutType: z.string().min(1),
  decisionClass: DecisionClassSchema.optional(),   // NEW: Required if findingCategory == 'decisions'

  // What needs updating
  targetDoc: z.string().min(1),
  updateType: DocUpdateTypeSchema,
  description: z.string().min(1).max(2000),
  suggestedContent: z.string().max(5000).optional(),

  // Status
  status: z.enum(['pending', 'completed', 'rejected']),
  completedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),

  // Timestamps
  createdAt: z.string().datetime()
});
```

### 4.10 TaskProfile

```typescript
// TaskProfile - Classification of task interactions
export const TaskProfileSchema = z.object({
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});
```

### 4.11 TaggingMiss

```typescript
// TaggingMiss - Pattern should have matched but wasn't injected
// UPDATED: Added scope
export const TaggingMissSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // What happened
  findingId: z.string().min(1),
  patternId: z.string().uuid(),

  // The mismatch
  actualTaskProfile: TaskProfileSchema,
  requiredMatch: z.object({
    touches: z.array(TouchSchema).optional(),
    technologies: z.array(z.string()).optional(),
    taskTypes: z.array(z.string()).optional()
  }),
  missingTags: z.array(z.string()),

  // Resolution
  status: z.enum(['pending', 'resolved']),
  resolution: z.enum([
    'broadened_pattern',
    'improved_extraction',
    'false_positive'
  ]).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional()
});
```

### 4.12 InjectionLog

```typescript
// InjectionLog - Record of what was injected
// UPDATED: Added scope, injectedAlerts field
export const InjectionLogSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // What was injected
  issueId: z.string().min(1),                      // Linear issue key (e.g., PROJ-123)
  target: z.enum(['context-pack', 'spec']),

  // Injected items
  injectedPatterns: z.array(z.string().uuid()),
  injectedPrinciples: z.array(z.string().uuid()),
  injectedAlerts: z.array(z.string().uuid()),      // NEW: ProvisionalAlert IDs

  // Context
  taskProfile: TaskProfileSchema,

  // Timestamps
  injectedAt: z.string().datetime()
});
```

### 4.13 ProvisionalAlert (NEW)

```typescript
// NEW: ProvisionalAlert - Short-lived alerts for CRITICAL findings that don't meet pattern gate
// UPDATED: Added scope
export const ProvisionalAlertSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  findingId: z.string().min(1),
  issueId: z.string().min(1),                      // Linear issue key (e.g., PROJ-123)

  // Content
  message: z.string().min(1).max(500),             // Short actionable warning
  touches: z.array(TouchSchema),                   // For injection filtering

  // Where to inject
  injectInto: z.enum(['context-pack', 'spec', 'both']),

  // Lifecycle
  expiresAt: z.string().datetime(),                // Default: createdAt + 14 days
  status: z.enum(['active', 'expired', 'promoted']),
  promotedToPatternId: z.string().uuid().optional(), // If promoted to full pattern

  // Timestamps
  createdAt: z.string().datetime()
});
```

### 4.14 SalienceIssue (NEW)

```typescript
// NEW: SalienceIssue - Tracks guidance that is repeatedly ignored
// UPDATED: Added scope
export const SalienceIssueSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // What's being ignored
  guidanceLocationHash: z.string().length(64),     // SHA-256 of (stage + location + excerpt)
  guidanceStage: z.enum(['context-pack', 'spec']),
  guidanceLocation: z.string().min(1),
  guidanceExcerpt: z.string().min(1).max(2000),

  // Tracking
  occurrenceCount: z.number().int().positive(),    // How many times ignored in windowDays
  windowDays: z.number().int().default(30),
  noncomplianceIds: z.array(z.string().uuid()),    // ExecutionNoncompliance IDs

  // Resolution
  status: z.enum(['pending', 'resolved']),
  resolution: z.enum([
    'reformatted',
    'moved_earlier',
    'false_positive'
  ]).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional()
});
```

### 4.15 PatternCreationState Enum (NEW - Section 11)

```typescript
// NEW: PatternCreationState - Kill switch states for pattern creation
export const PatternCreationStateSchema = z.enum([
  'active',           // Normal operation: all patterns created
  'inferred_paused',  // Only verbatim/paraphrase patterns created
  'fully_paused'      // No new patterns created; injection continues for existing
]);
```

### 4.16 AttributionHealthMetrics (NEW - Section 11)

```typescript
// NEW: AttributionHealthMetrics - Rolling 30-day metrics per project
export const AttributionHealthMetricsSchema = z.object({
  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Rolling window metrics (last 30 days)
  totalAttributions: z.number().int().nonnegative(),           // Total pattern attributions attempted
  verbatimAttributions: z.number().int().nonnegative(),        // carrierQuoteType = 'verbatim'
  paraphraseAttributions: z.number().int().nonnegative(),      // carrierQuoteType = 'paraphrase'
  inferredAttributions: z.number().int().nonnegative(),        // carrierQuoteType = 'inferred'

  // Outcome tracking (requires PR review after injection)
  injectionsWithoutRecurrence: z.number().int().nonnegative(), // Injected warning, same category not found again
  injectionsWithRecurrence: z.number().int().nonnegative(),    // Injected warning, same category still found

  // Computed health scores (computed at query time, not stored)
  attributionPrecisionScore: z.number().min(0).max(1),         // verbatim / total (higher = better)
  inferredRatio: z.number().min(0).max(1),                     // inferred / total (lower = better)
  observedImprovementRate: z.number().min(0).max(1),           // (without recurrence) / (total injections)

  // Window metadata
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  computedAt: z.string().datetime()
});
```

### 4.17 KillSwitchStatus (NEW - Section 11)

```typescript
// NEW: KillSwitchStatus - Current state of the kill switch per project
export const KillSwitchStatusSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Current state
  state: PatternCreationStateSchema,
  reason: z.string().nullable(),              // Why we entered this state
  enteredAt: z.string().datetime().nullable(), // When we entered this state
  autoResumeAt: z.string().datetime().nullable(), // Scheduled re-evaluation time

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

### 4.18 AttributionOutcome (NEW - Section 11)

```typescript
// NEW: AttributionOutcome - Record of each attribution result for health tracking
export const AttributionOutcomeSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  issueKey: z.string().min(1),                // Linear issue key (e.g., PROJ-123)

  // Attribution details
  carrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  patternCreated: z.boolean(),
  injectionOccurred: z.boolean(),
  recurrenceObserved: z.boolean().nullable(), // null if not yet known

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()            // For recurrence updates
});
```

### 4.19 Type Exports

```typescript
// Export inferred types
export type FailureMode = z.infer<typeof FailureModeSchema>;
export type FindingCategory = z.infer<typeof FindingCategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Touch = z.infer<typeof TouchSchema>;
export type NoncomplianceCause = z.infer<typeof NoncomplianceCauseSchema>;
export type DocUpdateType = z.infer<typeof DocUpdateTypeSchema>;
export type DecisionClass = z.infer<typeof DecisionClassSchema>;
export type CarrierInstructionKind = z.infer<typeof CarrierInstructionKindSchema>;
export type DocFingerprint = z.infer<typeof DocFingerprintSchema>;
export type ConflictSignal = z.infer<typeof ConflictSignalSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;
export type PatternOccurrence = z.infer<typeof PatternOccurrenceSchema>;
export type DerivedPrinciple = z.infer<typeof DerivedPrincipleSchema>;
export type ExecutionNoncompliance = z.infer<typeof ExecutionNoncomplianceSchema>;
export type DocUpdateRequest = z.infer<typeof DocUpdateRequestSchema>;
export type TaskProfile = z.infer<typeof TaskProfileSchema>;
export type TaggingMiss = z.infer<typeof TaggingMissSchema>;
export type InjectionLog = z.infer<typeof InjectionLogSchema>;
export type ProvisionalAlert = z.infer<typeof ProvisionalAlertSchema>;
export type SalienceIssue = z.infer<typeof SalienceIssueSchema>;

// NEW: Kill switch types (Section 11)
export type PatternCreationState = z.infer<typeof PatternCreationStateSchema>;
export type AttributionHealthMetrics = z.infer<typeof AttributionHealthMetricsSchema>;
export type KillSwitchStatus = z.infer<typeof KillSwitchStatusSchema>;
export type AttributionOutcome = z.infer<typeof AttributionOutcomeSchema>;
```

---

## 5. Database Schema (SQLite)

### 5.1 Database Initialization

```typescript
// File: src/storage/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// UPDATED: Global installation path (not per-project)
const FALCON_DIR = path.join(os.homedir(), '.falcon-ai');
const DB_DIR = path.join(FALCON_DIR, 'db');
const DB_PATH = path.join(DB_DIR, 'falcon.db');

export function initDatabase(): Database.Database {
  // Ensure directory exists
  fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);

  // Performance settings (WAL mode for concurrency)
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 20000');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    -- NEW: Workspaces table (v1.2: added slug, status per main spec)
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,           -- v1.2: URL-safe identifier
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- NEW: Projects table (v1.2: added repo_origin_url, repo_subdir, status per main spec)
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      repo_path TEXT,                -- Local path (informational only, may be NULL)
      repo_origin_url TEXT NOT NULL, -- v1.2: stable identity via git remote
      repo_subdir TEXT,              -- v1.2: for monorepos (e.g., "packages/api")
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_identity ON projects(repo_origin_url, repo_subdir);

    -- Pattern Definitions (UPDATED: added scope, pattern_key, severity_max)
    CREATE TABLE IF NOT EXISTS pattern_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      pattern_content TEXT NOT NULL,
      failure_mode TEXT NOT NULL CHECK (failure_mode IN (
        'incorrect', 'incomplete', 'missing_reference',
        'ambiguous', 'conflict_unresolved', 'synthesis_drift'
      )),
      finding_category TEXT NOT NULL CHECK (finding_category IN (
        'security', 'correctness', 'testing', 'compliance', 'decisions'
      )),
      severity TEXT NOT NULL CHECK (severity IN (
        'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
      )),
      severity_max TEXT NOT NULL CHECK (severity_max IN (
        'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
      )),
      alternative TEXT NOT NULL,
      consequence_class TEXT,
      carrier_stage TEXT NOT NULL CHECK (carrier_stage IN (
        'context-pack', 'spec'
      )),
      primary_carrier_quote_type TEXT NOT NULL CHECK (primary_carrier_quote_type IN (
        'verbatim', 'paraphrase', 'inferred'
      )),
      technologies TEXT NOT NULL DEFAULT '[]',
      task_types TEXT NOT NULL DEFAULT '[]',
      touches TEXT NOT NULL DEFAULT '[]',
      aligned_baseline_id TEXT REFERENCES derived_principles(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'archived', 'superseded'
      )),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Pattern Occurrences (UPDATED: added scope, severity, carrier_excerpt_hash, origin_excerpt_hash)
    CREATE TABLE IF NOT EXISTS pattern_occurrences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN (
        'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
      )),
      evidence TEXT NOT NULL,
      carrier_fingerprint TEXT NOT NULL,
      origin_fingerprint TEXT,
      provenance_chain TEXT NOT NULL DEFAULT '[]',
      carrier_excerpt_hash TEXT NOT NULL,
      origin_excerpt_hash TEXT,
      was_injected INTEGER NOT NULL DEFAULT 0,
      was_adhered_to INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'inactive'
      )),
      inactive_reason TEXT CHECK (inactive_reason IN (
        'superseded_doc', 'pattern_archived', 'false_positive'
      ) OR inactive_reason IS NULL),
      provisional_alert_id TEXT,  -- If this occurrence promoted an alert
      created_at TEXT NOT NULL,
      FOREIGN KEY (provisional_alert_id) REFERENCES provisional_alerts(id)
    );

    -- Derived Principles (baselines and derived) - workspace-scoped
    -- v1.2: added promotion_key for idempotent promotion and rollback
    CREATE TABLE IF NOT EXISTS derived_principles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      principle TEXT NOT NULL,
      rationale TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('baseline', 'derived')),
      derived_from TEXT,
      external_refs TEXT,
      inject_into TEXT NOT NULL CHECK (inject_into IN (
        'context-pack', 'spec', 'both'
      )),
      touches TEXT NOT NULL DEFAULT '[]',
      technologies TEXT,
      task_types TEXT,
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'archived', 'superseded'
      )),
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT REFERENCES derived_principles(id),
      promotion_key TEXT,  -- v1.2: hash of source pattern IDs for idempotent promotion
      archived_reason TEXT,
      archived_at TEXT,
      archived_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_derived_principles_promotion_key
      ON derived_principles(workspace_id, promotion_key) WHERE promotion_key IS NOT NULL;

    -- Execution Noncompliance - project-scoped
    CREATE TABLE IF NOT EXISTS execution_noncompliance (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      violated_guidance_stage TEXT NOT NULL CHECK (violated_guidance_stage IN (
        'context-pack', 'spec'
      )),
      violated_guidance_location TEXT NOT NULL,
      violated_guidance_excerpt TEXT NOT NULL,
      possible_causes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    -- Doc Update Requests (UPDATED: added scope, decision_class)
    CREATE TABLE IF NOT EXISTS doc_update_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      finding_category TEXT NOT NULL CHECK (finding_category IN (
        'security', 'correctness', 'testing', 'compliance', 'decisions'
      )),
      scout_type TEXT NOT NULL,
      decision_class TEXT CHECK (decision_class IN (
        'caching', 'retries', 'timeouts', 'authz_model',
        'error_contract', 'migrations', 'logging_privacy', 'backcompat'
      ) OR decision_class IS NULL),
      target_doc TEXT NOT NULL,
      update_type TEXT NOT NULL CHECK (update_type IN (
        'add_decision', 'clarify_guidance', 'fix_error', 'add_constraint'
      )),
      description TEXT NOT NULL,
      suggested_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'rejected'
      )),
      completed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL
    );

    -- Tagging Misses - project-scoped
    CREATE TABLE IF NOT EXISTS tagging_misses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL REFERENCES pattern_definitions(id),
      actual_task_profile TEXT NOT NULL,
      required_match TEXT NOT NULL,
      missing_tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'resolved'
      )),
      resolution TEXT CHECK (resolution IN (
        'broadened_pattern', 'improved_extraction', 'false_positive'
      ) OR resolution IS NULL),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    -- Injection Logs (UPDATED: added scope, injected_alerts)
    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      issue_id TEXT NOT NULL,
      target TEXT NOT NULL CHECK (target IN ('context-pack', 'spec')),
      injected_patterns TEXT NOT NULL DEFAULT '[]',
      injected_principles TEXT NOT NULL DEFAULT '[]',
      injected_alerts TEXT NOT NULL DEFAULT '[]',
      task_profile TEXT NOT NULL,
      injected_at TEXT NOT NULL
    );

    -- NEW: Provisional Alerts - project-scoped
    CREATE TABLE IF NOT EXISTS provisional_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      message TEXT NOT NULL,
      touches TEXT NOT NULL DEFAULT '[]',
      inject_into TEXT NOT NULL CHECK (inject_into IN (
        'context-pack', 'spec', 'both'
      )),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'expired', 'promoted'
      )),
      promoted_to_pattern_id TEXT REFERENCES pattern_definitions(id),
      created_at TEXT NOT NULL
    );

    -- NEW: Salience Issues - project-scoped
    CREATE TABLE IF NOT EXISTS salience_issues (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      guidance_location_hash TEXT NOT NULL,
      guidance_stage TEXT NOT NULL CHECK (guidance_stage IN (
        'context-pack', 'spec'
      )),
      guidance_location TEXT NOT NULL,
      guidance_excerpt TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      window_days INTEGER NOT NULL DEFAULT 30,
      noncompliance_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'resolved'
      )),
      resolution TEXT CHECK (resolution IN (
        'reformatted', 'moved_earlier', 'false_positive'
      ) OR resolution IS NULL),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    -- NEW: Kill Switch Status - project-scoped (Section 11)
    CREATE TABLE IF NOT EXISTS kill_switch_status (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      state TEXT NOT NULL DEFAULT 'active' CHECK (state IN (
        'active', 'inferred_paused', 'fully_paused'
      )),
      reason TEXT,
      entered_at TEXT,
      auto_resume_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- NEW: Attribution Outcomes - project-scoped (Section 11)
    CREATE TABLE IF NOT EXISTS attribution_outcomes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      issue_key TEXT NOT NULL,
      carrier_quote_type TEXT NOT NULL CHECK (carrier_quote_type IN (
        'verbatim', 'paraphrase', 'inferred'
      )),
      pattern_created INTEGER NOT NULL DEFAULT 0,
      injection_occurred INTEGER NOT NULL DEFAULT 0,
      recurrence_observed INTEGER,  -- NULL if not yet known
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON pattern_definitions(status);
    CREATE INDEX IF NOT EXISTS idx_patterns_carrier ON pattern_definitions(carrier_stage);
    CREATE INDEX IF NOT EXISTS idx_patterns_category ON pattern_definitions(finding_category);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_scope_key ON pattern_definitions(workspace_id, project_id, pattern_key);
    CREATE INDEX IF NOT EXISTS idx_patterns_workspace ON pattern_definitions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_patterns_project ON pattern_definitions(project_id);

    CREATE INDEX IF NOT EXISTS idx_occurrences_pattern ON pattern_occurrences(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_issue ON pattern_occurrences(issue_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_status ON pattern_occurrences(status);
    CREATE INDEX IF NOT EXISTS idx_occurrences_workspace ON pattern_occurrences(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_project ON pattern_occurrences(project_id);

    CREATE INDEX IF NOT EXISTS idx_principles_status ON derived_principles(status);
    CREATE INDEX IF NOT EXISTS idx_principles_origin ON derived_principles(origin);
    CREATE INDEX IF NOT EXISTS idx_principles_workspace ON derived_principles(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_noncompliance_issue ON execution_noncompliance(issue_id);
    CREATE INDEX IF NOT EXISTS idx_noncompliance_project ON execution_noncompliance(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_status ON doc_update_requests(status);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_decision_class ON doc_update_requests(decision_class);
    CREATE INDEX IF NOT EXISTS idx_doc_updates_project ON doc_update_requests(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_issue ON injection_logs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_project ON injection_logs(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_tagging_misses_status ON tagging_misses(status);
    CREATE INDEX IF NOT EXISTS idx_tagging_misses_project ON tagging_misses(workspace_id, project_id);

    CREATE INDEX IF NOT EXISTS idx_alerts_status ON provisional_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_expires ON provisional_alerts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_project ON provisional_alerts(workspace_id, project_id);

    CREATE INDEX IF NOT EXISTS idx_salience_status ON salience_issues(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_salience_hash ON salience_issues(workspace_id, project_id, guidance_location_hash);
    CREATE INDEX IF NOT EXISTS idx_salience_project ON salience_issues(workspace_id, project_id);

    -- NEW: Kill switch indexes (Section 11)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kill_switch_project ON kill_switch_status(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_kill_switch_state ON kill_switch_status(state);

    CREATE INDEX IF NOT EXISTS idx_outcomes_project ON attribution_outcomes(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_created ON attribution_outcomes(created_at);
    CREATE INDEX IF NOT EXISTS idx_outcomes_issue ON attribution_outcomes(issue_key);
  `);
}

export function getDatabase(): Database.Database {
  return initDatabase();
}
```

---

## 6. Repository Implementation

### 6.1 Base Repository Pattern

```typescript
// File: src/storage/repositories/base.repo.ts
import type { Database } from 'better-sqlite3';

export abstract class BaseRepository<T> {
  constructor(protected db: Database) {}

  protected parseJsonField<U>(value: string | null): U {
    if (!value) return [] as unknown as U;
    try {
      return JSON.parse(value);
    } catch {
      return [] as unknown as U;
    }
  }

  protected stringifyJsonField(value: unknown): string {
    return JSON.stringify(value ?? []);
  }

  protected boolToInt(value: boolean): number {
    return value ? 1 : 0;
  }

  protected intToBool(value: number | null): boolean {
    return value === 1;
  }

  protected nullableIntToBool(value: number | null): boolean | null {
    if (value === null) return null;
    return value === 1;
  }
}
```

### 6.2 PatternDefinitionRepository

```typescript
// File: src/storage/repositories/pattern-definition.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { PatternDefinition, Touch, Severity } from '../../schemas';
import { PatternDefinitionSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

// scope is required; id, patternKey, contentHash, severityMax, timestamps are auto-generated
type CreateInput = Omit<PatternDefinition, 'id' | 'patternKey' | 'contentHash' | 'severityMax' | 'createdAt' | 'updatedAt'>;

export class PatternDefinitionRepository extends BaseRepository<PatternDefinition> {

  findById(id: string): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // NEW: Find by patternKey (deterministic uniqueness key) - scoped to workspace+project
  // v1.2 FIX: Changed to single options object to match Phase 2 calling convention
  findByPatternKey(options: {
    workspaceId: string;
    projectId: string;
    patternKey: string;
  }): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND pattern_key = ?'
    ).get(options.workspaceId, options.projectId, options.patternKey) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2 FIX: Changed to single options object to match Phase 3 calling convention
  findActive(options: {
    workspaceId: string;
    projectId: string;
    carrierStage?: 'context-pack' | 'spec';
    findingCategory?: PatternDefinition['findingCategory'];
  }): PatternDefinition[] {
    let sql = 'SELECT * FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = ?';
    const params: unknown[] = [options.workspaceId, options.projectId, 'active'];

    if (options.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToEntity(row));
  }

  findByTouches(scope: { workspaceId: string; projectId: string }, touches: Touch[]): PatternDefinition[] {
    // Get all active patterns and filter in memory
    // v1.2 FIX: Use new options object signature
    const all = this.findActive({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId
    });
    return all.filter(p =>
      p.touches.some(t => touches.includes(t))
    );
  }

  // v1.2 FIX: Added for Phase 5 ProvisionalAlert expiry processing
  // Finds patterns that match both touches AND category (for alert-to-pattern promotion)
  findByTouchesAndCategory(options: {
    workspaceId: string;
    projectId: string;
    touches: Touch[];
    findingCategory: PatternDefinition['findingCategory'];
    status?: 'active' | 'inactive';
  }): PatternDefinition[] {
    const statusFilter = options.status ?? 'active';
    const rows = this.db.prepare(`
      SELECT * FROM pattern_definitions
      WHERE workspace_id = ? AND project_id = ? AND status = ? AND finding_category = ?
    `).all(options.workspaceId, options.projectId, statusFilter, options.findingCategory) as Record<string, unknown>[];

    const patterns = rows.map(row => this.rowToEntity(row));
    // Filter by touches in memory (JSON field)
    return patterns.filter(p =>
      p.touches.some(t => options.touches.includes(t))
    );
  }

  // NEW: Find patterns from OTHER projects in same workspace (for cross-project warnings)
  // v1.2 FIX: Added findingCategory filter (security-only for cross-project)
  findCrossProject(options: {
    workspaceId: string;
    excludeProjectId: string;
    carrierStage?: 'context-pack' | 'spec';
    minSeverity?: Severity;
    findingCategory?: string;  // v1.2 FIX: Filter by category (security-only recommended)
  }): PatternDefinition[] {
    let sql = `
      SELECT * FROM pattern_definitions
      WHERE workspace_id = ?
        AND project_id != ?
        AND status = ?
    `;
    const params: unknown[] = [options.workspaceId, options.excludeProjectId, 'active'];

    if (options.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options.minSeverity) {
      // Filter to patterns where severityMax >= minSeverity
      const minRank = this.severityRank(options.minSeverity);
      sql += ` AND (
        CASE severity_max
          WHEN 'CRITICAL' THEN 4
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 1
        END
      ) >= ?`;
      params.push(minRank);
    }

    // v1.2 FIX: Filter by finding category if specified
    if (options.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToEntity(row));
  }

  // NEW: Compute patternKey deterministically
  private computePatternKey(carrierStage: string, patternContent: string, findingCategory: string): string {
    const normalized = patternContent.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256')
      .update(`${carrierStage}|${normalized}|${findingCategory}`)
      .digest('hex');
  }

  create(data: CreateInput): PatternDefinition {
    const now = new Date().toISOString();
    const contentHash = createHash('sha256')
      .update(data.patternContent.trim().toLowerCase())
      .digest('hex');

    // Extract scope IDs (scope must be project-level per Zod validation)
    const { workspaceId, projectId } = data.scope as { level: 'project'; workspaceId: string; projectId: string };

    // NEW: Compute patternKey for deduplication
    const patternKey = this.computePatternKey(
      data.carrierStage,
      data.patternContent,
      data.findingCategory
    );

    // Check for existing by patternKey within same scope (deduplication)
    const existing = this.findByPatternKey({ workspaceId, projectId, patternKey });
    if (existing) {
      // Update severityMax if new occurrence has higher severity
      if (this.severityRank(data.severity) > this.severityRank(existing.severityMax)) {
        return this.update(existing.id, { severityMax: data.severity })!;
      }
      return existing;
    }

    const pattern: PatternDefinition = {
      id: uuidv4(),
      patternKey,
      contentHash,
      severityMax: data.severity, // NEW: Initialize to first occurrence severity
      createdAt: now,
      updatedAt: now,
      ...data
    };

    // Validate with Zod
    PatternDefinitionSchema.parse(pattern);

    this.db.prepare(`
      INSERT INTO pattern_definitions (
        id, workspace_id, project_id, pattern_key, content_hash, pattern_content,
        failure_mode, finding_category, severity, severity_max, alternative,
        consequence_class, carrier_stage, primary_carrier_quote_type,
        technologies, task_types, touches, aligned_baseline_id,
        status, permanent, superseded_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pattern.id,
      workspaceId,
      projectId,
      pattern.patternKey,
      pattern.contentHash,
      pattern.patternContent,
      pattern.failureMode,
      pattern.findingCategory,
      pattern.severity,
      pattern.severityMax,
      pattern.alternative,
      pattern.consequenceClass ?? null,
      pattern.carrierStage,
      pattern.primaryCarrierQuoteType,
      this.stringifyJsonField(pattern.technologies),
      this.stringifyJsonField(pattern.taskTypes),
      this.stringifyJsonField(pattern.touches),
      pattern.alignedBaselineId ?? null,
      pattern.status,
      this.boolToInt(pattern.permanent),
      pattern.supersededBy ?? null,
      pattern.createdAt,
      pattern.updatedAt
    );

    return pattern;
  }

  // NEW: Helper to rank severity for comparison
  private severityRank(severity: Severity): number {
    const ranks: Record<Severity, number> = {
      'LOW': 1,
      'MEDIUM': 2,
      'HIGH': 3,
      'CRITICAL': 4
    };
    return ranks[severity];
  }

  // v1.2: Create pattern from promoted ProvisionalAlert (used by Phase 4)
  createFromProvisionalAlert(options: {
    workspaceId: string;
    projectId: string;
    alert: {
      findingId: string;
      issueId: string;
      message: string;
      touches: Touch[];
      injectInto: 'context-pack' | 'spec' | 'both';
    };
    stats: {
      occurrenceCount: number;
      uniqueIssueCount: number;
      averageConfidence: number;
    };
  }): PatternDefinition {
    // Create pattern from alert data
    return this.create({
      scope: {
        level: 'project',
        workspaceId: options.workspaceId,
        projectId: options.projectId
      },
      patternContent: options.alert.message,
      failureMode: 'incomplete',  // Default for promoted alerts
      findingCategory: 'correctness',  // Default category
      severity: 'HIGH',  // Alerts are created for CRITICAL findings
      alternative: 'See original alert message for guidance',
      carrierStage: options.alert.injectInto === 'both' ? 'context-pack' : options.alert.injectInto,
      primaryCarrierQuoteType: 'inferred',
      technologies: [],
      taskTypes: [],
      touches: options.alert.touches,
      status: 'active',
      permanent: false
    });
  }

  update(id: string, data: Partial<PatternDefinition>): PatternDefinition | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: PatternDefinition = {
      ...existing,
      ...data,
      id: existing.id,
      patternKey: existing.patternKey,
      contentHash: existing.contentHash,
      patternContent: existing.patternContent, // IMMUTABLE
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    PatternDefinitionSchema.parse(updated);

    this.db.prepare(`
      UPDATE pattern_definitions SET
        failure_mode = ?, finding_category = ?,
        severity = ?, severity_max = ?, alternative = ?, consequence_class = ?,
        carrier_stage = ?, primary_carrier_quote_type = ?,
        technologies = ?, task_types = ?, touches = ?,
        aligned_baseline_id = ?, status = ?, permanent = ?,
        superseded_by = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.failureMode,
      updated.findingCategory,
      updated.severity,
      updated.severityMax,
      updated.alternative,
      updated.consequenceClass ?? null,
      updated.carrierStage,
      updated.primaryCarrierQuoteType,
      this.stringifyJsonField(updated.technologies),
      this.stringifyJsonField(updated.taskTypes),
      this.stringifyJsonField(updated.touches),
      updated.alignedBaselineId ?? null,
      updated.status,
      this.boolToInt(updated.permanent),
      updated.supersededBy ?? null,
      updated.updatedAt,
      id
    );

    return updated;
  }

  private rowToEntity(row: Record<string, unknown>): PatternDefinition {
    return {
      id: row.id as string,
      // Construct scope object from DB columns
      scope: {
        level: 'project' as const,
        workspaceId: row.workspace_id as string,
        projectId: row.project_id as string
      },
      patternKey: row.pattern_key as string,
      contentHash: row.content_hash as string,
      patternContent: row.pattern_content as string,
      failureMode: row.failure_mode as PatternDefinition['failureMode'],
      findingCategory: row.finding_category as PatternDefinition['findingCategory'],
      severity: row.severity as PatternDefinition['severity'],
      severityMax: row.severity_max as PatternDefinition['severity'],
      alternative: row.alternative as string,
      consequenceClass: row.consequence_class as string | undefined,
      carrierStage: row.carrier_stage as PatternDefinition['carrierStage'],
      primaryCarrierQuoteType: row.primary_carrier_quote_type as PatternDefinition['primaryCarrierQuoteType'],
      technologies: this.parseJsonField<string[]>(row.technologies as string),
      taskTypes: this.parseJsonField<string[]>(row.task_types as string),
      touches: this.parseJsonField<Touch[]>(row.touches as string),
      alignedBaselineId: row.aligned_baseline_id as string | undefined,
      status: row.status as PatternDefinition['status'],
      permanent: this.intToBool(row.permanent as number),
      supersededBy: row.superseded_by as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }
}
```

### 6.3 PatternOccurrenceRepository

```typescript
// File: src/storage/repositories/pattern-occurrence.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { PatternOccurrence, EvidenceBundle, DocFingerprint } from '../../schemas';
import { PatternOccurrenceSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

type CreateInput = Omit<PatternOccurrence, 'id' | 'createdAt'>;

export class PatternOccurrenceRepository extends BaseRepository<PatternOccurrence> {

  findById(id: string): PatternOccurrence | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_occurrences WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Find occurrences by pattern within scope
  findByPatternId(options: {
    workspaceId: string;
    patternId: string;
  }): PatternOccurrence[] {
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND pattern_id = ?
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.patternId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2: Find occurrences linked to a ProvisionalAlert (used by Phase 4 promotion)
  findByProvisionalAlertId(options: {
    workspaceId: string;
    alertId: string;
  }): PatternOccurrence[] {
    // Note: This requires a provisional_alert_id column or a join table
    // For simplicity, we store the link in a separate field
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND provisional_alert_id = ?
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.alertId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2: Find occurrence by pattern + issue (used by adherence updater)
  findByPatternAndIssue(options: {
    workspaceId: string;
    projectId: string;
    patternId: string;
    issueId: string;
  }): PatternOccurrence | null {
    const row = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND project_id = ? AND pattern_id = ? AND issue_id = ?
      LIMIT 1
    `).get(
      options.workspaceId,
      options.projectId,
      options.patternId,
      options.issueId
    ) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Find active occurrences within scope
  findActive(options: {
    workspaceId: string;
    projectId: string;
  }): PatternOccurrence[] {
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ? AND project_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  create(data: CreateInput): PatternOccurrence {
    const now = new Date().toISOString();

    const occurrence: PatternOccurrence = {
      id: uuidv4(),
      createdAt: now,
      ...data
    };

    PatternOccurrenceSchema.parse(occurrence);

    this.db.prepare(`
      INSERT INTO pattern_occurrences (
        id, workspace_id, project_id, pattern_id, finding_id, issue_id,
        pr_number, severity, evidence, carrier_fingerprint, origin_fingerprint,
        provenance_chain, carrier_excerpt_hash, origin_excerpt_hash,
        was_injected, was_adhered_to, status, inactive_reason, provisional_alert_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      occurrence.id,
      occurrence.workspaceId,
      occurrence.projectId,
      occurrence.patternId,
      occurrence.findingId,
      occurrence.issueId,
      occurrence.prNumber,
      occurrence.severity,
      this.stringifyJsonField(occurrence.evidence),
      this.stringifyJsonField(occurrence.carrierFingerprint),
      occurrence.originFingerprint ? this.stringifyJsonField(occurrence.originFingerprint) : null,
      this.stringifyJsonField(occurrence.provenanceChain),
      occurrence.carrierExcerptHash,
      occurrence.originExcerptHash ?? null,
      this.boolToInt(occurrence.wasInjected),
      occurrence.wasAdheredTo === null ? null : this.boolToInt(occurrence.wasAdheredTo),
      occurrence.status,
      occurrence.inactiveReason ?? null,
      occurrence.provisionalAlertId ?? null,
      occurrence.createdAt
    );

    return occurrence;
  }

  // v1.2: Update occurrence (used by adherence updater and promotion)
  update(options: {
    workspaceId: string;
    id: string;
    patternId?: string;
    provisionalAlertId?: string | null;
    wasInjected?: boolean;
    wasAdheredTo?: boolean | null;
    status?: 'active' | 'inactive';
    inactiveReason?: string | null;
  }): PatternOccurrence | null {
    const existing = this.findById(options.id);
    if (!existing || existing.workspaceId !== options.workspaceId) return null;

    // Build update dynamically
    const updates: string[] = [];
    const params: unknown[] = [];

    if (options.patternId !== undefined) {
      updates.push('pattern_id = ?');
      params.push(options.patternId);
    }
    if (options.wasInjected !== undefined) {
      updates.push('was_injected = ?');
      params.push(this.boolToInt(options.wasInjected));
    }
    if (options.wasAdheredTo !== undefined) {
      updates.push('was_adhered_to = ?');
      params.push(options.wasAdheredTo === null ? null : this.boolToInt(options.wasAdheredTo));
    }
    if (options.status !== undefined) {
      updates.push('status = ?');
      params.push(options.status);
    }
    if (options.inactiveReason !== undefined) {
      updates.push('inactive_reason = ?');
      params.push(options.inactiveReason);
    }

    if (updates.length === 0) return existing;

    params.push(options.id);

    this.db.prepare(`
      UPDATE pattern_occurrences SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    return this.findById(options.id);
  }

  // ============================================
  // PHASE 5 REQUIRED METHODS - Document change detection
  // These methods find occurrences by document fingerprint type
  // Used by onDocumentChange() in Phase 5 to invalidate occurrences
  // ============================================

  /**
   * Find occurrences citing a git document (by repo + path, ignoring commitSha).
   * Used by Phase 5 doc-change-watcher to invalidate occurrences when git files change.
   */
  findByGitDoc(options: {
    workspaceId: string;
    repo: string;
    path: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    // Query occurrences where carrier_fingerprint or origin_fingerprint is a git doc
    // with matching repo and path (JSON extraction)
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'git'
           AND json_extract(carrier_fingerprint, '$.repo') = ?
           AND json_extract(carrier_fingerprint, '$.path') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'git'
           AND json_extract(origin_fingerprint, '$.repo') = ?
           AND json_extract(origin_fingerprint, '$.path') = ?)
        )
    `).all(
      options.workspaceId,
      statusFilter,
      options.repo, options.path,
      options.repo, options.path
    ) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing a Linear document (by docId).
   * Used by Phase 5 doc-change-watcher to invalidate occurrences when Linear docs change.
   */
  findByLinearDocId(options: {
    workspaceId: string;
    docId: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'linear'
           AND json_extract(carrier_fingerprint, '$.docId') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'linear'
           AND json_extract(origin_fingerprint, '$.docId') = ?)
        )
    `).all(options.workspaceId, statusFilter, options.docId, options.docId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing a web URL.
   * Used by Phase 5 doc-change-watcher to invalidate occurrences when web content changes.
   */
  findByWebUrl(options: {
    workspaceId: string;
    url: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'web'
           AND json_extract(carrier_fingerprint, '$.url') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'web'
           AND json_extract(origin_fingerprint, '$.url') = ?)
        )
    `).all(options.workspaceId, statusFilter, options.url, options.url) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find occurrences citing an external reference (CWE, OWASP, etc.).
   * Used by Phase 5 doc-change-watcher to invalidate occurrences when external refs change.
   */
  findByExternalId(options: {
    workspaceId: string;
    externalId: string;
    status?: 'active' | 'inactive';
  }): PatternOccurrence[] {
    const statusFilter = options.status || 'active';
    const rows = this.db.prepare(`
      SELECT * FROM pattern_occurrences
      WHERE workspace_id = ?
        AND status = ?
        AND (
          (json_extract(carrier_fingerprint, '$.kind') = 'external'
           AND json_extract(carrier_fingerprint, '$.id') = ?)
          OR
          (json_extract(origin_fingerprint, '$.kind') = 'external'
           AND json_extract(origin_fingerprint, '$.id') = ?)
        )
    `).all(options.workspaceId, statusFilter, options.externalId, options.externalId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  private rowToEntity(row: Record<string, unknown>): PatternOccurrence {
    return {
      id: row.id as string,
      patternId: row.pattern_id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      prNumber: row.pr_number as number,
      severity: row.severity as PatternOccurrence['severity'],
      evidence: this.parseJsonField<EvidenceBundle>(row.evidence as string),
      carrierFingerprint: this.parseJsonField<DocFingerprint>(row.carrier_fingerprint as string),
      originFingerprint: row.origin_fingerprint
        ? this.parseJsonField<DocFingerprint>(row.origin_fingerprint as string)
        : undefined,
      provenanceChain: this.parseJsonField<DocFingerprint[]>(row.provenance_chain as string),
      carrierExcerptHash: row.carrier_excerpt_hash as string,
      originExcerptHash: row.origin_excerpt_hash as string | undefined,
      wasInjected: this.intToBool(row.was_injected as number),
      wasAdheredTo: this.nullableIntToBool(row.was_adhered_to as number | null),
      status: row.status as PatternOccurrence['status'],
      inactiveReason: row.inactive_reason as PatternOccurrence['inactiveReason'] | undefined,
      provisionalAlertId: row.provisional_alert_id as string | undefined,
      createdAt: row.created_at as string
    };
  }
}
```

### 6.4 ProvisionalAlertRepository (NEW)

**v1.1 FIXED:** All methods now require and use `workspaceId`/`projectId` for scope isolation.

```typescript
// File: src/storage/repositories/provisional-alert.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { ProvisionalAlert, Touch } from '../../schemas';
import { ProvisionalAlertSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

// v1.1: Scope fields are REQUIRED (not optional)
type CreateInput = Omit<ProvisionalAlert, 'id' | 'createdAt'> & {
  workspaceId: string;
  projectId: string;
};

export class ProvisionalAlertRepository extends BaseRepository<ProvisionalAlert> {

  findById(id: string): ProvisionalAlert | null {
    const row = this.db.prepare(
      'SELECT * FROM provisional_alerts WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.1 FIXED: Scope is REQUIRED, not optional
  findActive(options: {
    workspaceId: string;
    projectId: string;
    injectInto?: 'context-pack' | 'spec' | 'both';
    touches?: Touch[];
  }): ProvisionalAlert[] {
    const now = new Date().toISOString();
    // v1.1: Always filter by scope
    let sql = `
      SELECT * FROM provisional_alerts
      WHERE workspace_id = ? AND project_id = ?
        AND status = ? AND expires_at > ?
    `;
    const params: unknown[] = [options.workspaceId, options.projectId, 'active', now];

    if (options.injectInto) {
      sql += ' AND (inject_into = ? OR inject_into = ?)';
      params.push(options.injectInto, 'both');
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    let alerts = rows.map(row => this.rowToEntity(row));

    // Filter by touches if provided
    if (options.touches) {
      alerts = alerts.filter(a =>
        a.touches.some(t => options.touches!.includes(t))
      );
    }

    return alerts;
  }

  // v1.1: Still returns all expired alerts (for cleanup job)
  findExpired(): ProvisionalAlert[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM provisional_alerts WHERE status = ? AND expires_at <= ?'
    ).all('active', now) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // v1.1 FIXED: Include workspace_id and project_id in INSERT
  create(data: CreateInput): ProvisionalAlert {
    const now = new Date().toISOString();

    const alert: ProvisionalAlert = {
      id: uuidv4(),
      createdAt: now,
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      ...data
    };

    ProvisionalAlertSchema.parse(alert);

    this.db.prepare(`
      INSERT INTO provisional_alerts (
        id, workspace_id, project_id, finding_id, issue_id, message,
        touches, inject_into, expires_at, status, promoted_to_pattern_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.id,
      alert.workspaceId,
      alert.projectId,
      alert.findingId,
      alert.issueId,
      alert.message,
      this.stringifyJsonField(alert.touches),
      alert.injectInto,
      alert.expiresAt,
      alert.status,
      alert.promotedToPatternId ?? null,
      alert.createdAt
    );

    return alert;
  }

  update(id: string, data: Partial<ProvisionalAlert>): ProvisionalAlert | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: ProvisionalAlert = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId,  // v1.1: Scope is immutable
      projectId: existing.projectId,       // v1.1: Scope is immutable
      createdAt: existing.createdAt
    };

    ProvisionalAlertSchema.parse(updated);

    this.db.prepare(`
      UPDATE provisional_alerts SET
        message = ?, touches = ?, inject_into = ?,
        expires_at = ?, status = ?, promoted_to_pattern_id = ?
      WHERE id = ?
    `).run(
      updated.message,
      this.stringifyJsonField(updated.touches),
      updated.injectInto,
      updated.expiresAt,
      updated.status,
      updated.promotedToPatternId ?? null,
      id
    );

    return updated;
  }

  // v1.2: Update status with optional promoted pattern ID (used by Phase 4)
  updateStatus(options: {
    workspaceId: string;
    id: string;
    status: 'active' | 'expired' | 'promoted';
    promotedPatternId?: string;
  }): boolean {
    const result = this.db.prepare(`
      UPDATE provisional_alerts
      SET status = ?, promoted_to_pattern_id = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      options.status,
      options.promotedPatternId ?? null,
      options.id,
      options.workspaceId
    );

    return result.changes > 0;
  }

  // v1.1 FIXED: Include workspace_id and project_id in mapping
  private rowToEntity(row: Record<string, unknown>): ProvisionalAlert {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      issueId: row.issue_id as string,
      message: row.message as string,
      touches: this.parseJsonField<Touch[]>(row.touches as string),
      injectInto: row.inject_into as ProvisionalAlert['injectInto'],
      expiresAt: row.expires_at as string,
      status: row.status as ProvisionalAlert['status'],
      promotedToPatternId: row.promoted_to_pattern_id as string | undefined,
      createdAt: row.created_at as string
    };
  }
}
```

### 6.5 SalienceIssueRepository (NEW)

**v1.1 FIXED:** All methods now require and use `workspaceId`/`projectId` for scope isolation.

```typescript
// File: src/storage/repositories/salience-issue.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { SalienceIssue } from '../../schemas';
import { SalienceIssueSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

// v1.1: Scope fields are REQUIRED
type CreateInput = Omit<SalienceIssue, 'id' | 'guidanceLocationHash' | 'createdAt' | 'updatedAt'> & {
  workspaceId: string;
  projectId: string;
};

export class SalienceIssueRepository extends BaseRepository<SalienceIssue> {

  findById(id: string): SalienceIssue | null {
    const row = this.db.prepare(
      'SELECT * FROM salience_issues WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.1 FIXED: Scope is REQUIRED - hash is unique WITHIN a project
  findByLocationHash(options: {
    workspaceId: string;
    projectId: string;
    hash: string;
  }): SalienceIssue | null {
    const row = this.db.prepare(`
      SELECT * FROM salience_issues
      WHERE workspace_id = ? AND project_id = ? AND guidance_location_hash = ?
    `).get(options.workspaceId, options.projectId, options.hash) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.1 FIXED: Scope is REQUIRED
  findPending(options: {
    workspaceId: string;
    projectId: string;
  }): SalienceIssue[] {
    const rows = this.db.prepare(`
      SELECT * FROM salience_issues
      WHERE workspace_id = ? AND project_id = ? AND status = ?
    `).all(options.workspaceId, options.projectId, 'pending') as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // Compute location hash for lookup
  computeLocationHash(stage: string, location: string, excerpt: string): string {
    return createHash('sha256')
      .update(`${stage}|${location}|${excerpt}`)
      .digest('hex');
  }

  // v1.1 FIXED: Create or update (increment count if exists)
  upsert(data: CreateInput, noncomplianceId: string): SalienceIssue {
    const hash = this.computeLocationHash(
      data.guidanceStage,
      data.guidanceLocation,
      data.guidanceExcerpt
    );

    const existing = this.findByLocationHash({
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      hash
    });

    if (existing) {
      // Increment count and add noncompliance ID
      const updatedIds = [...existing.noncomplianceIds, noncomplianceId];
      return this.update(existing.id, {
        occurrenceCount: existing.occurrenceCount + 1,
        noncomplianceIds: updatedIds
      })!;
    }

    const now = new Date().toISOString();
    const issue: SalienceIssue = {
      id: uuidv4(),
      workspaceId: data.workspaceId,
      projectId: data.projectId,
      guidanceLocationHash: hash,
      createdAt: now,
      updatedAt: now,
      noncomplianceIds: [noncomplianceId],
      ...data
    };

    SalienceIssueSchema.parse(issue);

    this.db.prepare(`
      INSERT INTO salience_issues (
        id, workspace_id, project_id, guidance_location_hash, guidance_stage,
        guidance_location, guidance_excerpt, occurrence_count, window_days,
        noncompliance_ids, status, resolution, created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      issue.id,
      issue.workspaceId,
      issue.projectId,
      issue.guidanceLocationHash,
      issue.guidanceStage,
      issue.guidanceLocation,
      issue.guidanceExcerpt,
      issue.occurrenceCount,
      issue.windowDays,
      this.stringifyJsonField(issue.noncomplianceIds),
      issue.status,
      issue.resolution ?? null,
      issue.createdAt,
      issue.updatedAt,
      issue.resolvedAt ?? null
    );

    return issue;
  }

  update(id: string, data: Partial<SalienceIssue>): SalienceIssue | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: SalienceIssue = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId,  // v1.1: Scope is immutable
      projectId: existing.projectId,       // v1.1: Scope is immutable
      guidanceLocationHash: existing.guidanceLocationHash,
      createdAt: existing.createdAt,
      updatedAt: now
    };

    SalienceIssueSchema.parse(updated);

    this.db.prepare(`
      UPDATE salience_issues SET
        occurrence_count = ?, noncompliance_ids = ?,
        status = ?, resolution = ?, updated_at = ?, resolved_at = ?
      WHERE id = ?
    `).run(
      updated.occurrenceCount,
      this.stringifyJsonField(updated.noncomplianceIds),
      updated.status,
      updated.resolution ?? null,
      updated.updatedAt,
      updated.resolvedAt ?? null,
      id
    );

    return updated;
  }

  // v1.1 FIXED: Include workspace_id and project_id in mapping
  private rowToEntity(row: Record<string, unknown>): SalienceIssue {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      guidanceLocationHash: row.guidance_location_hash as string,
      guidanceStage: row.guidance_stage as SalienceIssue['guidanceStage'],
      guidanceLocation: row.guidance_location as string,
      guidanceExcerpt: row.guidance_excerpt as string,
      occurrenceCount: row.occurrence_count as number,
      windowDays: row.window_days as number,
      noncomplianceIds: this.parseJsonField<string[]>(row.noncompliance_ids as string),
      status: row.status as SalienceIssue['status'],
      resolution: row.resolution as SalienceIssue['resolution'] | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      resolvedAt: row.resolved_at as string | undefined
    };
  }
}
```

### 6.6 InjectionLogRepository

```typescript
// File: src/storage/repositories/injection-log.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { InjectionLog, TaskProfile } from '../../schemas';
import { InjectionLogSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

type CreateInput = Omit<InjectionLog, 'id' | 'injectedAt'>;

export class InjectionLogRepository extends BaseRepository<InjectionLog> {

  findById(id: string): InjectionLog | null {
    const row = this.db.prepare(
      'SELECT * FROM injection_logs WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Find logs by issue (scoped)
  findByIssueId(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
  }): InjectionLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
      ORDER BY injected_at DESC
    `).all(options.workspaceId, options.projectId, options.issueId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2: Find by target (scoped)
  findByTarget(options: {
    workspaceId: string;
    projectId: string;
    issueId: string;
    target: 'context-pack' | 'spec';
  }): InjectionLog | null {
    const row = this.db.prepare(`
      SELECT * FROM injection_logs
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ? AND target = ?
    `).get(
      options.workspaceId,
      options.projectId,
      options.issueId,
      options.target
    ) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  create(data: CreateInput): InjectionLog {
    const now = new Date().toISOString();

    const log: InjectionLog = {
      id: uuidv4(),
      injectedAt: now,
      ...data
    };

    InjectionLogSchema.parse(log);

    this.db.prepare(`
      INSERT INTO injection_logs (
        id, workspace_id, project_id, issue_id, target,
        injected_patterns, injected_principles, injected_alerts,
        task_profile, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.workspaceId,
      log.projectId,
      log.issueId,
      log.target,
      this.stringifyJsonField(log.injectedPatterns),
      this.stringifyJsonField(log.injectedPrinciples),
      this.stringifyJsonField(log.injectedAlerts),
      this.stringifyJsonField(log.taskProfile),
      log.injectedAt
    );

    return log;
  }

  private rowToEntity(row: Record<string, unknown>): InjectionLog {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      issueId: row.issue_id as string,
      target: row.target as InjectionLog['target'],
      injectedPatterns: this.parseJsonField<string[]>(row.injected_patterns as string),
      injectedPrinciples: this.parseJsonField<string[]>(row.injected_principles as string),
      injectedAlerts: this.parseJsonField<string[]>(row.injected_alerts as string),
      taskProfile: this.parseJsonField<TaskProfile>(row.task_profile as string),
      injectedAt: row.injected_at as string
    };
  }
}
```

### 6.7 TaggingMissRepository

```typescript
// File: src/storage/repositories/tagging-miss.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { TaggingMiss, TaskProfile } from '../../schemas';
import { TaggingMissSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

type CreateInput = Omit<TaggingMiss, 'id' | 'createdAt'>;

export class TaggingMissRepository extends BaseRepository<TaggingMiss> {

  findById(id: string): TaggingMiss | null {
    const row = this.db.prepare(
      'SELECT * FROM tagging_misses WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Find pending misses (scoped)
  findPending(options: {
    workspaceId: string;
    projectId: string;
  }): TaggingMiss[] {
    const rows = this.db.prepare(`
      SELECT * FROM tagging_misses
      WHERE workspace_id = ? AND project_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2: Find by pattern (scoped)
  findByPatternId(options: {
    workspaceId: string;
    patternId: string;
  }): TaggingMiss[] {
    const rows = this.db.prepare(`
      SELECT * FROM tagging_misses
      WHERE workspace_id = ? AND pattern_id = ?
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.patternId) as Record<string, unknown>[];

    return rows.map(row => this.rowToEntity(row));
  }

  create(data: CreateInput): TaggingMiss {
    const now = new Date().toISOString();

    const miss: TaggingMiss = {
      id: uuidv4(),
      createdAt: now,
      ...data
    };

    TaggingMissSchema.parse(miss);

    this.db.prepare(`
      INSERT INTO tagging_misses (
        id, workspace_id, project_id, finding_id, pattern_id,
        actual_task_profile, required_match, missing_tags,
        status, resolution, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      miss.id,
      miss.workspaceId,
      miss.projectId,
      miss.findingId,
      miss.patternId,
      this.stringifyJsonField(miss.actualTaskProfile),
      this.stringifyJsonField(miss.requiredMatch),
      this.stringifyJsonField(miss.missingTags),
      miss.status,
      miss.resolution ?? null,
      miss.createdAt,
      miss.resolvedAt ?? null
    );

    return miss;
  }

  // v1.2: Resolve a tagging miss
  resolve(options: {
    id: string;
    resolution: 'broadened_pattern' | 'improved_extraction' | 'false_positive';
  }): TaggingMiss | null {
    const existing = this.findById(options.id);
    if (!existing) return null;

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE tagging_misses
      SET status = 'resolved', resolution = ?, resolved_at = ?
      WHERE id = ?
    `).run(options.resolution, now, options.id);

    return this.findById(options.id);
  }

  private rowToEntity(row: Record<string, unknown>): TaggingMiss {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      findingId: row.finding_id as string,
      patternId: row.pattern_id as string,
      actualTaskProfile: this.parseJsonField<TaskProfile>(row.actual_task_profile as string),
      requiredMatch: this.parseJsonField<TaggingMiss['requiredMatch']>(row.required_match as string),
      missingTags: this.parseJsonField<string[]>(row.missing_tags as string),
      status: row.status as TaggingMiss['status'],
      resolution: row.resolution as TaggingMiss['resolution'] | undefined,
      createdAt: row.created_at as string,
      resolvedAt: row.resolved_at as string | undefined
    };
  }
}
```

### 6.8 DerivedPrincipleRepository (KEY METHODS)

**v1.2 NEW:** Repository for workspace-scoped derived principles with promotion support.

```typescript
// File: src/storage/repositories/derived-principle.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DerivedPrinciple } from '../../schemas';
import { DerivedPrincipleSchema } from '../../schemas';
import { BaseRepository } from './base.repo';

type CreateInput = Omit<DerivedPrinciple, 'id' | 'createdAt' | 'updatedAt'>;

export class DerivedPrincipleRepository extends BaseRepository<DerivedPrinciple> {

  findById(id: string): DerivedPrinciple | null {
    const row = this.db.prepare(
      'SELECT * FROM derived_principles WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // Find by principle text (used for baseline deduplication)
  findByPrinciple(principle: string, workspaceId: string): DerivedPrinciple | null {
    const row = this.db.prepare(
      'SELECT * FROM derived_principles WHERE principle = ? AND workspace_id = ?'
    ).get(principle, workspaceId) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Find ALL active principles (baselines and derived) - workspace-scoped
  findActive(options: {
    workspaceId: string;
    origin?: 'baseline' | 'derived';
  }): DerivedPrinciple[] {
    let sql = `
      SELECT * FROM derived_principles
      WHERE workspace_id = ? AND status = 'active'
    `;
    const params: unknown[] = [options.workspaceId];

    if (options.origin) {
      sql += ' AND origin = ?';
      params.push(options.origin);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2: Find active principles for injection (workspace-scoped) with touch filtering
  findForInjection(options: {
    workspaceId: string;
    target: 'context-pack' | 'spec';
    touches: string[];
  }): DerivedPrinciple[] {
    const rows = this.db.prepare(`
      SELECT * FROM derived_principles
      WHERE workspace_id = ?
        AND status = 'active'
        AND (inject_into = ? OR inject_into = 'both')
    `).all(options.workspaceId, options.target) as Record<string, unknown>[];

    // Filter by touches overlap in application code
    return rows
      .map(row => this.rowToEntity(row))
      .filter(dp => {
        if (dp.touches.length === 0) return true; // No filter = applies everywhere
        return dp.touches.some(t => options.touches.includes(t));
      });
  }

  // v1.2: Find by promotion key for idempotent promotion
  findByPromotionKey(options: {
    workspaceId: string;
    promotionKey: string;
  }): DerivedPrinciple | null {
    const row = this.db.prepare(`
      SELECT * FROM derived_principles
      WHERE workspace_id = ? AND promotion_key = ?
    `).get(options.workspaceId, options.promotionKey) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  // v1.2: Compute promotion key from source pattern IDs
  static computePromotionKey(patternIds: string[]): string {
    const sorted = [...patternIds].sort();
    return createHash('sha256')
      .update(sorted.join('|'))
      .digest('hex');
  }

  // v1.2: Rollback a derived principle (set status to archived)
  rollbackPromotion(options: {
    workspaceId: string;
    promotionKey: string;
  }): boolean {
    const result = this.db.prepare(`
      UPDATE derived_principles
      SET status = 'archived', updated_at = ?
      WHERE workspace_id = ? AND promotion_key = ? AND origin = 'derived'
    `).run(
      new Date().toISOString(),
      options.workspaceId,
      options.promotionKey
    );

    return result.changes > 0;
  }

  create(data: CreateInput): DerivedPrinciple {
    const id = uuidv4();
    const now = new Date().toISOString();

    const principle: DerivedPrinciple = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now
    };

    DerivedPrincipleSchema.parse(principle);

    this.db.prepare(`
      INSERT INTO derived_principles (
        id, workspace_id, principle, rationale, origin, derived_from,
        external_refs, inject_into, touches, technologies, task_types,
        confidence, status, permanent, superseded_by, promotion_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      principle.scope.workspaceId,
      principle.principle,
      principle.rationale,
      principle.origin,
      this.stringifyJsonField(principle.derivedFrom ?? []),
      this.stringifyJsonField(principle.externalRefs ?? []),
      principle.injectInto,
      this.stringifyJsonField(principle.touches),
      this.stringifyJsonField(principle.technologies ?? []),
      this.stringifyJsonField(principle.taskTypes ?? []),
      principle.confidence,
      principle.status,
      principle.permanent ? 1 : 0,
      principle.supersededBy ?? null,
      principle.promotionKey ?? null,
      now,
      now
    );

    return principle;
  }

  private rowToEntity(row: Record<string, unknown>): DerivedPrinciple {
    return {
      id: row.id as string,
      scope: { level: 'workspace', workspaceId: row.workspace_id as string },
      principle: row.principle as string,
      rationale: row.rationale as string,
      origin: row.origin as DerivedPrinciple['origin'],
      derivedFrom: this.parseJsonField<string[]>(row.derived_from as string),
      externalRefs: this.parseJsonField<string[]>(row.external_refs as string),
      injectInto: row.inject_into as DerivedPrinciple['injectInto'],
      touches: this.parseJsonField<string[]>(row.touches as string),
      technologies: this.parseJsonField<string[]>(row.technologies as string),
      taskTypes: this.parseJsonField<string[]>(row.task_types as string),
      confidence: row.confidence as number,
      status: row.status as DerivedPrinciple['status'],
      permanent: Boolean(row.permanent),
      supersededBy: row.superseded_by as string | undefined,
      promotionKey: row.promotion_key as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }
}
```

### 6.9 KillSwitchRepository (NEW - Section 11)

```typescript
// File: src/storage/repositories/kill-switch.repo.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  KillSwitchStatus,
  AttributionOutcome,
  AttributionHealthMetrics,
  PatternCreationState
} from '../../schemas';
import {
  KillSwitchStatusSchema,
  AttributionOutcomeSchema,
  AttributionHealthMetricsSchema
} from '../../schemas';
import { BaseRepository } from './base.repo';

// Health thresholds from Section 11.3 of main spec
const HEALTH_THRESHOLDS = {
  attributionPrecisionScore: {
    healthy: 0.60,
    warning: 0.40,
    critical: 0.40  // Action: Pause pattern creation
  },
  inferredRatio: {
    healthy: 0.25,
    warning: 0.40,
    critical: 0.40  // Action: Pause inferred patterns only
  },
  observedImprovementRate: {
    healthy: 0.40,
    warning: 0.20,
    critical: 0.20  // Action: Pause all pattern creation
  }
};

// Cooldown periods for state recovery
const COOLDOWN_DAYS = {
  inferred_paused: 7,
  fully_paused: 14
};

export class KillSwitchRepository extends BaseRepository<KillSwitchStatus> {

  // Get current kill switch status for a project
  getStatus(options: {
    workspaceId: string;
    projectId: string;
  }): KillSwitchStatus {
    const row = this.db.prepare(`
      SELECT * FROM kill_switch_status
      WHERE workspace_id = ? AND project_id = ?
    `).get(options.workspaceId, options.projectId) as Record<string, unknown> | undefined;

    if (row) {
      return this.rowToKillSwitchStatus(row);
    }

    // Create default ACTIVE status if not exists
    return this.createDefaultStatus(options);
  }

  // Create default ACTIVE status
  private createDefaultStatus(options: {
    workspaceId: string;
    projectId: string;
  }): KillSwitchStatus {
    const now = new Date().toISOString();
    const id = uuidv4();

    const status: KillSwitchStatus = {
      id,
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      state: 'active',
      reason: null,
      enteredAt: null,
      autoResumeAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO kill_switch_status (
        id, workspace_id, project_id, state, reason,
        entered_at, auto_resume_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      status.id,
      status.workspaceId,
      status.projectId,
      status.state,
      status.reason,
      status.enteredAt,
      status.autoResumeAt,
      status.createdAt,
      status.updatedAt
    );

    return status;
  }

  // Update kill switch state (for manual or automatic state changes)
  setStatus(options: {
    workspaceId: string;
    projectId: string;
    state: PatternCreationState;
    reason: string;
    autoResumeAt?: string;
  }): KillSwitchStatus {
    const now = new Date().toISOString();

    // Ensure row exists
    this.getStatus({
      workspaceId: options.workspaceId,
      projectId: options.projectId
    });

    this.db.prepare(`
      UPDATE kill_switch_status
      SET state = ?, reason = ?, entered_at = ?, auto_resume_at = ?, updated_at = ?
      WHERE workspace_id = ? AND project_id = ?
    `).run(
      options.state,
      options.reason,
      now,
      options.autoResumeAt ?? null,
      now,
      options.workspaceId,
      options.projectId
    );

    return this.getStatus({
      workspaceId: options.workspaceId,
      projectId: options.projectId
    });
  }

  // Record an attribution outcome for health tracking
  recordOutcome(data: Omit<AttributionOutcome, 'id' | 'createdAt' | 'updatedAt'>): AttributionOutcome {
    const now = new Date().toISOString();
    const id = uuidv4();

    const outcome: AttributionOutcome = {
      id,
      createdAt: now,
      updatedAt: now,
      ...data
    };

    AttributionOutcomeSchema.parse(outcome);

    this.db.prepare(`
      INSERT INTO attribution_outcomes (
        id, workspace_id, project_id, issue_key, carrier_quote_type,
        pattern_created, injection_occurred, recurrence_observed,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      outcome.id,
      outcome.workspaceId,
      outcome.projectId,
      outcome.issueKey,
      outcome.carrierQuoteType,
      this.boolToInt(outcome.patternCreated),
      this.boolToInt(outcome.injectionOccurred),
      outcome.recurrenceObserved === null ? null : this.boolToInt(outcome.recurrenceObserved),
      outcome.createdAt,
      outcome.updatedAt
    );

    return outcome;
  }

  // Update recurrence observation on an existing outcome
  updateRecurrence(options: {
    workspaceId: string;
    issueKey: string;
    recurrenceObserved: boolean;
  }): boolean {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE attribution_outcomes
      SET recurrence_observed = ?, updated_at = ?
      WHERE workspace_id = ? AND issue_key = ?
    `).run(
      this.boolToInt(options.recurrenceObserved),
      now,
      options.workspaceId,
      options.issueKey
    );

    return result.changes > 0;
  }

  // Compute health metrics for a project (rolling 30-day window)
  computeHealthMetrics(options: {
    workspaceId: string;
    projectId: string;
  }): AttributionHealthMetrics {
    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get aggregated metrics from outcomes table
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total_attributions,
        SUM(CASE WHEN carrier_quote_type = 'verbatim' THEN 1 ELSE 0 END) as verbatim_attributions,
        SUM(CASE WHEN carrier_quote_type = 'paraphrase' THEN 1 ELSE 0 END) as paraphrase_attributions,
        SUM(CASE WHEN carrier_quote_type = 'inferred' THEN 1 ELSE 0 END) as inferred_attributions,
        SUM(CASE WHEN injection_occurred = 1 AND recurrence_observed = 0 THEN 1 ELSE 0 END) as injections_without_recurrence,
        SUM(CASE WHEN injection_occurred = 1 AND recurrence_observed = 1 THEN 1 ELSE 0 END) as injections_with_recurrence
      FROM attribution_outcomes
      WHERE workspace_id = ? AND project_id = ?
        AND created_at >= ? AND created_at <= ?
    `).get(
      options.workspaceId,
      options.projectId,
      windowStart,
      windowEnd
    ) as Record<string, number>;

    const totalAttributions = row.total_attributions || 0;
    const verbatimAttributions = row.verbatim_attributions || 0;
    const paraphraseAttributions = row.paraphrase_attributions || 0;
    const inferredAttributions = row.inferred_attributions || 0;
    const injectionsWithoutRecurrence = row.injections_without_recurrence || 0;
    const injectionsWithRecurrence = row.injections_with_recurrence || 0;

    const totalInjections = injectionsWithoutRecurrence + injectionsWithRecurrence;

    // Compute health scores
    const attributionPrecisionScore = totalAttributions > 0
      ? verbatimAttributions / totalAttributions
      : 1.0;  // Default to healthy if no data

    const inferredRatio = totalAttributions > 0
      ? inferredAttributions / totalAttributions
      : 0.0;  // Default to healthy if no data

    const observedImprovementRate = totalInjections > 0
      ? injectionsWithoutRecurrence / totalInjections
      : 1.0;  // Default to healthy if no data

    const metrics: AttributionHealthMetrics = {
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      totalAttributions,
      verbatimAttributions,
      paraphraseAttributions,
      inferredAttributions,
      injectionsWithoutRecurrence,
      injectionsWithRecurrence,
      attributionPrecisionScore,
      inferredRatio,
      observedImprovementRate,
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      computedAt: new Date().toISOString()
    };

    AttributionHealthMetricsSchema.parse(metrics);
    return metrics;
  }

  // Evaluate health and return recommended state change (if any)
  evaluateHealth(options: {
    workspaceId: string;
    projectId: string;
  }): { shouldChange: boolean; newState: PatternCreationState; reason: string } | null {
    const metrics = this.computeHealthMetrics(options);
    const currentStatus = this.getStatus(options);

    // Check for critical thresholds
    if (metrics.attributionPrecisionScore < HEALTH_THRESHOLDS.attributionPrecisionScore.critical) {
      if (currentStatus.state !== 'fully_paused') {
        return {
          shouldChange: true,
          newState: 'fully_paused',
          reason: `attributionPrecisionScore dropped to ${metrics.attributionPrecisionScore.toFixed(2)}`
        };
      }
    }

    if (metrics.observedImprovementRate < HEALTH_THRESHOLDS.observedImprovementRate.critical) {
      if (currentStatus.state !== 'fully_paused') {
        return {
          shouldChange: true,
          newState: 'fully_paused',
          reason: `observedImprovementRate dropped to ${metrics.observedImprovementRate.toFixed(2)}`
        };
      }
    }

    if (metrics.inferredRatio > HEALTH_THRESHOLDS.inferredRatio.critical) {
      if (currentStatus.state === 'active') {
        return {
          shouldChange: true,
          newState: 'inferred_paused',
          reason: `inferredRatio exceeded threshold at ${metrics.inferredRatio.toFixed(2)}`
        };
      }
    }

    // Check for recovery (metrics healthy + cooldown passed)
    if (currentStatus.state !== 'active') {
      const metricsHealthy =
        metrics.attributionPrecisionScore >= HEALTH_THRESHOLDS.attributionPrecisionScore.healthy &&
        metrics.inferredRatio <= HEALTH_THRESHOLDS.inferredRatio.healthy &&
        metrics.observedImprovementRate >= HEALTH_THRESHOLDS.observedImprovementRate.healthy;

      if (metricsHealthy && currentStatus.autoResumeAt) {
        const now = new Date();
        const autoResume = new Date(currentStatus.autoResumeAt);
        if (now >= autoResume) {
          return {
            shouldChange: true,
            newState: 'active',
            reason: 'Metrics recovered and cooldown period passed'
          };
        }
      }
    }

    return null;
  }

  // Get health thresholds (for display/debugging)
  getHealthThresholds(): typeof HEALTH_THRESHOLDS {
    return HEALTH_THRESHOLDS;
  }

  // Get cooldown days (for display/debugging)
  getCooldownDays(): typeof COOLDOWN_DAYS {
    return COOLDOWN_DAYS;
  }

  // Compute auto-resume date based on current state
  computeAutoResumeDate(state: PatternCreationState): string {
    const days = state === 'fully_paused'
      ? COOLDOWN_DAYS.fully_paused
      : COOLDOWN_DAYS.inferred_paused;
    const resumeDate = new Date();
    resumeDate.setDate(resumeDate.getDate() + days);
    return resumeDate.toISOString();
  }

  // Find all projects in a given state
  findByState(options: {
    workspaceId: string;
    state: PatternCreationState;
  }): KillSwitchStatus[] {
    const rows = this.db.prepare(`
      SELECT * FROM kill_switch_status
      WHERE workspace_id = ? AND state = ?
    `).all(options.workspaceId, options.state) as Record<string, unknown>[];

    return rows.map(row => this.rowToKillSwitchStatus(row));
  }

  // Find all projects due for auto-resume evaluation
  findDueForResumeEvaluation(): KillSwitchStatus[] {
    const now = new Date().toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM kill_switch_status
      WHERE state != 'active'
        AND auto_resume_at IS NOT NULL
        AND auto_resume_at <= ?
    `).all(now) as Record<string, unknown>[];

    return rows.map(row => this.rowToKillSwitchStatus(row));
  }

  private rowToKillSwitchStatus(row: Record<string, unknown>): KillSwitchStatus {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      state: row.state as PatternCreationState,
      reason: row.reason as string | null,
      enteredAt: row.entered_at as string | null,
      autoResumeAt: row.auto_resume_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }
}

// === WorkspaceRepository ===
export class WorkspaceRepository extends BaseRepository {
  findById(id: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return row ? this.rowToEntity(row) : null;
  }

  findBySlug(slug: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug);
    return row ? this.rowToEntity(row) : null;
  }

  findActive(): Workspace[] {
    const rows = this.db.prepare('SELECT * FROM workspaces WHERE status = ?').all('active');
    return rows.map(row => this.rowToEntity(row));
  }

  create(data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>): Workspace {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...data
    };

    WorkspaceSchema.parse(workspace);

    this.db.prepare(`
      INSERT INTO workspaces (id, name, slug, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspace.id, workspace.name, workspace.slug,
      this.stringifyJsonField(workspace.config),
      workspace.status, workspace.createdAt, workspace.updatedAt
    );

    return workspace;
  }

  update(id: string, data: Partial<Workspace>): Workspace | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: Workspace = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    WorkspaceSchema.parse(updated);

    this.db.prepare(`
      UPDATE workspaces SET name = ?, slug = ?, config = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.slug, this.stringifyJsonField(updated.config),
           updated.status, updated.updatedAt, id);

    return updated;
  }

  private rowToEntity(row: unknown): Workspace {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      config: this.parseJsonField<WorkspaceConfig>(r.config as string),
      status: r.status as 'active' | 'archived',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  }
}

// === ProjectRepository ===
export class ProjectRepository extends BaseRepository {
  findById(params: { workspaceId: string; id: string }): Project | null {
    const row = this.db.prepare(
      'SELECT * FROM projects WHERE id = ? AND workspace_id = ?'
    ).get(params.id, params.workspaceId);
    return row ? this.rowToEntity(row) : null;
  }

  findByIdentity(params: { workspaceId: string; repoOriginUrl: string; repoSubdir?: string }): Project | null {
    const row = this.db.prepare(`
      SELECT * FROM projects
      WHERE workspace_id = ? AND repo_origin_url = ? AND (repo_subdir = ? OR (repo_subdir IS NULL AND ? IS NULL))
    `).get(params.workspaceId, params.repoOriginUrl, params.repoSubdir ?? null, params.repoSubdir ?? null);
    return row ? this.rowToEntity(row) : null;
  }

  findByWorkspace(workspaceId: string, status?: 'active' | 'archived'): Project[] {
    let sql = 'SELECT * FROM projects WHERE workspace_id = ?';
    const params: unknown[] = [workspaceId];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(row => this.rowToEntity(row));
  }

  create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...data
    };

    ProjectSchema.parse(project);

    this.db.prepare(`
      INSERT INTO projects (id, workspace_id, name, repo_origin_url, repo_subdir, repo_path, config, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id, project.workspaceId, project.name, project.repoOriginUrl,
      project.repoSubdir ?? null, project.repoPath ?? null,
      this.stringifyJsonField(project.config),
      project.status, project.createdAt, project.updatedAt
    );

    return project;
  }

  update(params: { workspaceId: string; id: string }, data: Partial<Project>): Project | null {
    const existing = this.findById(params);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...data,
      id: existing.id,
      workspaceId: existing.workspaceId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    ProjectSchema.parse(updated);

    this.db.prepare(`
      UPDATE projects SET name = ?, repo_origin_url = ?, repo_subdir = ?, repo_path = ?,
             config = ?, status = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(updated.name, updated.repoOriginUrl, updated.repoSubdir ?? null,
           updated.repoPath ?? null, this.stringifyJsonField(updated.config),
           updated.status, updated.updatedAt, params.id, params.workspaceId);

    return updated;
  }

  private rowToEntity(row: unknown): Project {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      name: r.name as string,
      repoOriginUrl: r.repo_origin_url as string,
      repoSubdir: r.repo_subdir as string | undefined,
      repoPath: r.repo_path as string | undefined,
      config: this.parseJsonField<ProjectConfig>(r.config as string),
      status: r.status as 'active' | 'archived',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  }
}

// === ExecutionNoncomplianceRepository ===
export class ExecutionNoncomplianceRepository extends BaseRepository {
  findById(id: string): ExecutionNoncompliance | null {
    const row = this.db.prepare('SELECT * FROM execution_noncompliance WHERE id = ?').get(id);
    return row ? this.rowToEntity(row) : null;
  }

  findByIssue(params: { workspaceId: string; projectId: string; issueId: string }): ExecutionNoncompliance[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_noncompliance
      WHERE workspace_id = ? AND project_id = ? AND issue_id = ?
      ORDER BY created_at DESC
    `).all(params.workspaceId, params.projectId, params.issueId);
    return rows.map(row => this.rowToEntity(row));
  }

  // v1.2 FIX: Added for Phase 5 salience detection (detects execution problems vs guidance problems)
  findByDateRange(options: {
    workspaceId: string;
    projectId: string;
    startDate: string;  // ISO 8601
    endDate: string;    // ISO 8601
  }): ExecutionNoncompliance[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_noncompliance
      WHERE workspace_id = ? AND project_id = ?
        AND created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `).all(options.workspaceId, options.projectId, options.startDate, options.endDate);
    return rows.map(row => this.rowToEntity(row));
  }

  create(data: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>): ExecutionNoncompliance {
    const noncompliance: ExecutionNoncompliance = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...data
    };

    ExecutionNoncomplianceSchema.parse(noncompliance);

    this.db.prepare(`
      INSERT INTO execution_noncompliance (
        id, workspace_id, project_id, finding_id, issue_id, pr_number,
        violated_guidance_stage, violated_guidance_location, violated_guidance_excerpt,
        possible_causes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      noncompliance.id, noncompliance.workspaceId, noncompliance.projectId,
      noncompliance.findingId, noncompliance.issueId, noncompliance.prNumber,
      noncompliance.violatedGuidanceStage, noncompliance.violatedGuidanceLocation,
      noncompliance.violatedGuidanceExcerpt,
      this.stringifyJsonField(noncompliance.possibleCauses),
      noncompliance.createdAt
    );

    return noncompliance;
  }

  private rowToEntity(row: unknown): ExecutionNoncompliance {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      projectId: r.project_id as string,
      findingId: r.finding_id as string,
      issueId: r.issue_id as string,
      prNumber: r.pr_number as number,
      violatedGuidanceStage: r.violated_guidance_stage as 'context-pack' | 'spec',
      violatedGuidanceLocation: r.violated_guidance_location as string,
      violatedGuidanceExcerpt: r.violated_guidance_excerpt as string,
      possibleCauses: this.parseJsonField<NoncomplianceCause[]>(r.possible_causes as string),
      createdAt: r.created_at as string
    };
  }
}

// === DocUpdateRequestRepository ===
export class DocUpdateRequestRepository extends BaseRepository {
  findById(id: string): DocUpdateRequest | null {
    const row = this.db.prepare('SELECT * FROM doc_update_requests WHERE id = ?').get(id);
    return row ? this.rowToEntity(row) : null;
  }

  findPending(params: { workspaceId: string; projectId: string }): DocUpdateRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(params.workspaceId, params.projectId);
    return rows.map(row => this.rowToEntity(row));
  }

  findByDecisionClass(params: { workspaceId: string; projectId: string; decisionClass: string }): DocUpdateRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM doc_update_requests
      WHERE workspace_id = ? AND project_id = ? AND decision_class = ?
      ORDER BY created_at DESC
    `).all(params.workspaceId, params.projectId, params.decisionClass);
    return rows.map(row => this.rowToEntity(row));
  }

  create(data: Omit<DocUpdateRequest, 'id' | 'createdAt'>): DocUpdateRequest {
    const request: DocUpdateRequest = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...data
    };

    DocUpdateRequestSchema.parse(request);

    this.db.prepare(`
      INSERT INTO doc_update_requests (
        id, workspace_id, project_id, finding_id, issue_id, finding_category, scout_type,
        decision_class, target_doc, update_type, description, suggested_content,
        status, completed_at, rejection_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id, request.workspaceId, request.projectId,
      request.findingId, request.issueId, request.findingCategory, request.scoutType,
      request.decisionClass ?? null, request.targetDoc, request.updateType,
      request.description, request.suggestedContent ?? null,
      request.status, request.completedAt ?? null, request.rejectionReason ?? null,
      request.createdAt
    );

    return request;
  }

  update(id: string, data: Partial<DocUpdateRequest>): DocUpdateRequest | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: DocUpdateRequest = { ...existing, ...data, id: existing.id, createdAt: existing.createdAt };
    DocUpdateRequestSchema.parse(updated);

    this.db.prepare(`
      UPDATE doc_update_requests SET status = ?, completed_at = ?, rejection_reason = ? WHERE id = ?
    `).run(updated.status, updated.completedAt ?? null, updated.rejectionReason ?? null, id);

    return updated;
  }

  private rowToEntity(row: unknown): DocUpdateRequest {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      projectId: r.project_id as string,
      findingId: r.finding_id as string,
      issueId: r.issue_id as string,
      findingCategory: r.finding_category as FindingCategory,
      scoutType: r.scout_type as string,
      decisionClass: r.decision_class as DecisionClass | undefined,
      targetDoc: r.target_doc as string,
      updateType: r.update_type as DocUpdateType,
      description: r.description as string,
      suggestedContent: r.suggested_content as string | undefined,
      status: r.status as 'pending' | 'completed' | 'rejected',
      completedAt: r.completed_at as string | undefined,
      rejectionReason: r.rejection_reason as string | undefined,
      createdAt: r.created_at as string
    };
  }
}
```

---

## 7. Baseline Principles

```typescript
// File: src/storage/seed/baselines.ts
import type { DerivedPrinciple, Touch } from '../../schemas';
import type { DerivedPrincipleRepository } from '../repositories/derived-principle.repo';

type BaselineInput = Omit<DerivedPrinciple, 'id' | 'createdAt' | 'updatedAt'>;

// UPDATED: 11 baselines (added B11: Least Privilege)
export const BASELINE_PRINCIPLES: BaselineInput[] = [
  {
    principle: 'Always use parameterized queries for SQL. Never interpolate user input into query strings.',
    rationale: 'Prevents SQL injection, the most common and dangerous database vulnerability.',
    origin: 'baseline',
    externalRefs: ['CWE-89'],
    injectInto: 'both',
    touches: ['database', 'user_input'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Validate, sanitize, and bound all external input before processing. Reject unexpected types, formats, and sizes.',
    rationale: 'Prevents injection attacks, type confusion, and DoS via malformed input.',
    origin: 'baseline',
    externalRefs: ['CWE-20'],
    injectInto: 'both',
    touches: ['user_input'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Never log secrets, credentials, API keys, or PII. Redact or omit sensitive fields.',
    rationale: 'Prevents credential leakage through log aggregation and monitoring systems.',
    origin: 'baseline',
    externalRefs: ['CWE-532'],
    injectInto: 'both',
    touches: ['logging', 'auth'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Require explicit authorization checks before sensitive operations. Never rely on implicit permissions.',
    rationale: 'Prevents privilege escalation and unauthorized access to protected resources.',
    origin: 'baseline',
    externalRefs: ['CWE-862'],
    injectInto: 'both',
    touches: ['auth', 'authz'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Set timeouts on all network calls. No unbounded waits.',
    rationale: 'Prevents resource exhaustion and cascading failures from slow/unresponsive services.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Implement retry with exponential backoff, jitter, and maximum attempt limits.',
    rationale: 'Prevents retry storms and allows graceful degradation during outages.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Use idempotency keys for operations that cannot be safely retried.',
    rationale: 'Prevents duplicate processing and data corruption during network retries.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network', 'database'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Enforce size limits and rate limits on user-provided data and requests.',
    rationale: 'Prevents DoS attacks and resource exhaustion from malicious or buggy clients.',
    origin: 'baseline',
    externalRefs: ['CWE-400'],
    injectInto: 'both',
    touches: ['user_input', 'api'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Require migration plan with rollback strategy for all schema changes.',
    rationale: 'Prevents data loss and enables recovery from failed deployments.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['schema'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Define error contract (status codes, error shapes, error codes) before implementation.',
    rationale: 'Ensures consistent error handling across the system and clear client expectations.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['api'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  // NEW: B11 - Least Privilege
  {
    principle: 'Use least-privilege credentials for DB/service access. Don\'t run migrations/ops with app runtime creds. Scope tokens tightly.',
    rationale: 'Reduces blast radius of credential compromise and limits damage from bugs.',
    origin: 'baseline',
    externalRefs: ['CWE-250'],
    injectInto: 'both',
    touches: ['database', 'auth', 'config'] as Touch[],
    confidence: 0.9,
    status: 'active',
    permanent: true
  }
];

export function seedBaselines(repo: DerivedPrincipleRepository, workspaceId: string): number {
  let seeded = 0;

  for (const baseline of BASELINE_PRINCIPLES) {
    const existing = repo.findByPrinciple(baseline.principle, workspaceId);
    if (!existing) {
      repo.create({
        ...baseline,
        scope: { level: 'workspace', workspaceId }
      });
      seeded++;
    }
  }

  return seeded;
}
```

---

## 8. Tests

### 8.1 Schema Tests

```typescript
// File: tests/schemas/pattern-definition.test.ts
import { describe, it, expect } from 'vitest';
import { PatternDefinitionSchema } from '../../src/schemas';

describe('PatternDefinitionSchema', () => {
  const validPattern = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    // Scope is required - must be project-level
    scope: {
      level: 'project',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222'
    },
    patternKey: 'a'.repeat(64),
    contentHash: 'b'.repeat(64),
    patternContent: 'Use template literals for SQL queries',
    failureMode: 'incorrect',
    findingCategory: 'security',
    severity: 'HIGH',
    severityMax: 'HIGH',
    alternative: 'Always use parameterized queries',
    carrierStage: 'context-pack',
    primaryCarrierQuoteType: 'verbatim',
    technologies: ['sql', 'postgres'],
    taskTypes: ['api'],
    touches: ['database', 'user_input'],
    status: 'active',
    permanent: false,
    createdAt: '2026-01-18T00:00:00.000Z',
    updatedAt: '2026-01-18T00:00:00.000Z'
  };

  it('accepts valid pattern', () => {
    const result = PatternDefinitionSchema.safeParse(validPattern);
    expect(result.success).toBe(true);
  });

  it('accepts decisions category', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      findingCategory: 'decisions'
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid failureMode', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      failureMode: 'invalid_mode'
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid touch', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      touches: ['invalid_touch']
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing patternKey', () => {
    const { patternKey, ...withoutKey } = validPattern;
    const result = PatternDefinitionSchema.safeParse(withoutKey);
    expect(result.success).toBe(false);
  });

  it('rejects missing severityMax', () => {
    const { severityMax, ...withoutMax } = validPattern;
    const result = PatternDefinitionSchema.safeParse(withoutMax);
    expect(result.success).toBe(false);
  });
});
```

### 8.2 Repository Tests

```typescript
// File: tests/storage/pattern-definition.repo.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo';

describe('PatternDefinitionRepository', () => {
  let db: Database.Database;
  let repo: PatternDefinitionRepository;

  // Test scope constants
  const testScope = {
    level: 'project' as const,
    workspaceId: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222'
  };

  beforeEach(() => {
    db = new Database(':memory:');
    // Run full schema creation with scope columns
    db.exec(`
      CREATE TABLE pattern_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        pattern_content TEXT NOT NULL,
        failure_mode TEXT NOT NULL,
        finding_category TEXT NOT NULL,
        severity TEXT NOT NULL,
        severity_max TEXT NOT NULL,
        alternative TEXT NOT NULL,
        consequence_class TEXT,
        carrier_stage TEXT NOT NULL,
        primary_carrier_quote_type TEXT NOT NULL,
        technologies TEXT NOT NULL DEFAULT '[]',
        task_types TEXT NOT NULL DEFAULT '[]',
        touches TEXT NOT NULL DEFAULT '[]',
        aligned_baseline_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        permanent INTEGER NOT NULL DEFAULT 0,
        superseded_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_patterns_scope_key ON pattern_definitions(workspace_id, project_id, pattern_key);
    `);
    repo = new PatternDefinitionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and retrieves pattern with patternKey and scope', () => {
    const created = repo.create({
      scope: testScope,
      patternContent: 'Use template literals for SQL',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Use parameterized queries',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: ['sql'],
      taskTypes: ['api'],
      touches: ['database'],
      status: 'active',
      permanent: false
    });

    expect(created.id).toBeDefined();
    expect(created.patternKey).toHaveLength(64);
    expect(created.severityMax).toBe('HIGH');
    expect(created.scope).toEqual(testScope);

    const retrieved = repo.findById(created.id);
    expect(retrieved).toEqual(created);
  });

  it('deduplicates by patternKey within same scope and updates severityMax', () => {
    const first = repo.create({
      scope: testScope,
      patternContent: 'Duplicate content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'MEDIUM',
      alternative: 'Fix it',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    // Same content, same stage, same category, same scope = same patternKey
    const second = repo.create({
      scope: testScope,
      patternContent: 'Duplicate content',
      failureMode: 'incomplete', // Different mode won't matter
      findingCategory: 'security',
      severity: 'CRITICAL', // Higher severity
      alternative: 'Different alternative',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'inferred',
      technologies: ['postgres'],
      taskTypes: ['database'],
      touches: ['database'],
      status: 'active',
      permanent: true
    });

    // Should return same pattern with updated severityMax
    expect(second.id).toBe(first.id);
    expect(second.patternKey).toBe(first.patternKey);
    expect(second.severityMax).toBe('CRITICAL'); // Updated!
  });

  it('allows same patternKey in different projects', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333' // Different project
    };

    const first = repo.create({
      scope: testScope,
      patternContent: 'Same content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    const second = repo.create({
      scope: otherProjectScope, // Different project
      patternContent: 'Same content',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    // Same patternKey but different IDs (different projects)
    expect(second.patternKey).toBe(first.patternKey);
    expect(second.id).not.toBe(first.id);
  });

  it('findActive filters by scope', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333'
    };

    repo.create({
      scope: testScope,
      patternContent: 'Pattern in project A',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    repo.create({
      scope: otherProjectScope,
      patternContent: 'Pattern in project B',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    // Should only return patterns from testScope
    const results = repo.findActive({ workspaceId: testScope.workspaceId, projectId: testScope.projectId });
    expect(results).toHaveLength(1);
    expect(results[0].patternContent).toBe('Pattern in project A');
  });

  it('findCrossProject returns patterns from other projects', () => {
    const otherProjectScope = {
      level: 'project' as const,
      workspaceId: testScope.workspaceId,
      projectId: '33333333-3333-3333-3333-333333333333'
    };

    repo.create({
      scope: testScope,
      patternContent: 'Pattern in project A',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'HIGH',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    repo.create({
      scope: otherProjectScope,
      patternContent: 'Pattern in project B',
      failureMode: 'incorrect',
      findingCategory: 'security',
      severity: 'CRITICAL',
      alternative: 'Fix',
      carrierStage: 'context-pack',
      primaryCarrierQuoteType: 'verbatim',
      technologies: [],
      taskTypes: [],
      touches: ['api'],
      status: 'active',
      permanent: false
    });

    // Should return patterns from other projects only
    const results = repo.findCrossProject({
      workspaceId: testScope.workspaceId,
      excludeProjectId: testScope.projectId,
      minSeverity: 'HIGH'
    });
    expect(results).toHaveLength(1);
    expect(results[0].patternContent).toBe('Pattern in project B');
  });
});
```

---

## 9. Package Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "uuid": "^10.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/uuid": "^10.0.0",
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

---

## 10. Acceptance Criteria

Phase 1 is complete when:

1. [ ] All Zod schemas defined and exported in `src/schemas/index.ts` (including Scope type and kill switch types)
2. [ ] Database initializes with all tables and indexes (14 tables: workspaces, projects + 10 entity tables + 2 kill switch tables)
3. [ ] All 12 repositories implemented with CRUD operations (including Workspace, Project, and KillSwitch repos)
4. [ ] 11 baseline principles seeded (including B11)
5. [ ] Schema tests pass (valid/invalid data coverage)
6. [ ] Repository tests pass (CRUD, deduplication by patternKey, severityMax updates, kill switch state management)
7. [ ] Types exported for use by other phases
8. [ ] Kill switch repository computes health metrics from attribution outcomes (Section 11)

---

## 11. Handoff to Phase 2

After Phase 1, the following are available:

- `initDatabase()` - Returns configured SQLite database
- `PatternDefinitionRepository` - Pattern CRUD with patternKey deduplication
- `PatternOccurrenceRepository` - Occurrence CRUD with excerptHash
- `DerivedPrincipleRepository` - Principle CRUD (with 11 seeded baselines)
- `ExecutionNoncomplianceRepository` - Noncompliance CRUD
- `DocUpdateRequestRepository` - Doc update CRUD with decisionClass
- `TaggingMissRepository` - Tagging miss CRUD
- `InjectionLogRepository` - Injection log CRUD with alerts
- `ProvisionalAlertRepository` - (NEW) Alert CRUD with expiry
- `SalienceIssueRepository` - (NEW) Salience issue CRUD with upsert
- `KillSwitchRepository` - (NEW - Section 11) Kill switch status, attribution outcomes, health metrics
- All Zod schemas and TypeScript types (including kill switch types)

Phase 2 can now build the Attribution Engine using these data access layers, with the kill switch repository providing health monitoring to determine when pattern creation should be paused.
