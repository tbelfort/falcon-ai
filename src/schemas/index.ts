/**
 * Zod schemas and type exports for the Pattern Attribution System.
 *
 * This file defines all 14+ entity schemas used across the system:
 * - Scope types (global, workspace, project)
 * - Workspace and Project
 * - PatternDefinition and PatternOccurrence
 * - DerivedPrinciple
 * - ExecutionNoncompliance
 * - DocUpdateRequest
 * - TaggingMiss
 * - InjectionLog
 * - ProvisionalAlert
 * - SalienceIssue
 * - Kill switch types (PatternCreationState, AttributionHealthMetrics, KillSwitchStatus, AttributionOutcome)
 */

import { z } from 'zod';

// ============================================
// SCOPE TYPES
// ============================================

/**
 * Scope - Hierarchical scoping for data isolation.
 * Uses discriminatedUnion for efficient parsing.
 */
export const ScopeSchema = z.discriminatedUnion('level', [
  z.object({
    level: z.literal('global'),
  }),
  z.object({
    level: z.literal('workspace'),
    workspaceId: z.string().uuid(),
  }),
  z.object({
    level: z.literal('project'),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
  }),
]);

export type Scope = z.infer<typeof ScopeSchema>;

// ============================================
// WORKSPACE AND PROJECT
// ============================================

/**
 * WorkspaceConfig - Extensible configuration for workspaces.
 */
export const WorkspaceConfigSchema = z
  .object({
    maxInjectedWarnings: z.number().int().positive().optional(),
    crossProjectWarningsEnabled: z.boolean().optional(),
    autoPromotionEnabled: z.boolean().optional(),
  })
  .passthrough(); // Allow additional settings

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * Workspace - Groups related projects.
 */
export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(50),
  config: WorkspaceConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * ProjectConfig - Extensible configuration for projects.
 */
export const ProjectConfigSchema = z
  .object({
    linearProjectId: z.string().optional(),
    linearTeamId: z.string().optional(),
    defaultTouches: z.array(z.string()).optional(),
  })
  .passthrough(); // Allow additional settings

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Project - Corresponds to a code repository.
 */
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  repoOriginUrl: z.string().min(1), // Canonical git remote URL
  repoSubdir: z.string().optional(), // For monorepos
  repoPath: z.string().optional(), // Local hint (informational)
  config: ProjectConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

// ============================================
// ENUMS
// ============================================

/**
 * FailureMode - How guidance failed.
 */
export const FailureModeSchema = z.enum([
  'incorrect', // Guidance explicitly said to do the wrong thing
  'incomplete', // Guidance omitted a necessary constraint/guardrail
  'missing_reference', // Didn't cite a mandatory doc that was relevant
  'ambiguous', // Guidance admits multiple reasonable interpretations
  'conflict_unresolved', // Contradictory guidance not reconciled
  'synthesis_drift', // Carrier distorted the source meaning
]);

export type FailureMode = z.infer<typeof FailureModeSchema>;

/**
 * FindingCategory - Maps to scout types.
 */
export const FindingCategorySchema = z.enum([
  'security', // Led to vulnerability (Security Scout)
  'correctness', // Led to bug (Bug Scout)
  'testing', // Led to weak tests (Test Scout)
  'compliance', // Led to doc/spec deviation (Docs/Spec Scout)
  'decisions', // Missing/undocumented decisions (Decisions Scout)
]);

export type FindingCategory = z.infer<typeof FindingCategorySchema>;

/**
 * Severity - Impact level.
 */
export const SeveritySchema = z.enum([
  'CRITICAL', // System-breaking, security breach, data loss
  'HIGH', // Significant impact, must fix before merge
  'MEDIUM', // Should fix, but not blocking
  'LOW', // Minor issue, nice to fix
]);

export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Touch - System interaction categories (used for filtering).
 */
export const TouchSchema = z.enum([
  'user_input', // Handles external/user-provided data
  'database', // Interacts with database
  'network', // Makes network calls
  'auth', // Handles authentication
  'authz', // Handles authorization
  'caching', // Implements caching
  'schema', // Modifies data schemas
  'logging', // Writes logs
  'config', // Handles configuration
  'api', // Exposes or consumes APIs
]);

export type Touch = z.infer<typeof TouchSchema>;

/**
 * NoncomplianceCause - Why agent ignored correct guidance.
 * Note: 'ambiguity' removed - ambiguity is a guidance problem, not execution.
 */
export const NoncomplianceCauseSchema = z.enum([
  'salience', // Warning wasn't prominent enough
  'formatting', // Warning format was unclear
  'override', // Agent intentionally overrode
]);

export type NoncomplianceCause = z.infer<typeof NoncomplianceCauseSchema>;

/**
 * DocUpdateType - Type of documentation update needed.
 */
export const DocUpdateTypeSchema = z.enum([
  'add_decision', // Document an undocumented decision
  'clarify_guidance', // Make ambiguous guidance clearer
  'fix_error', // Correct incorrect guidance
  'add_constraint', // Add missing constraint/guardrail
]);

export type DocUpdateType = z.infer<typeof DocUpdateTypeSchema>;

/**
 * DecisionClass - Category of undocumented decisions for recurrence counting.
 */
export const DecisionClassSchema = z.enum([
  'caching', // Caching invalidation, TTLs, strategies
  'retries', // Retry policies, backoff strategies
  'timeouts', // Timeout values, circuit breaker thresholds
  'authz_model', // Permission models, role hierarchies
  'error_contract', // Error codes, shapes, status codes
  'migrations', // Schema migration strategies, rollback plans
  'logging_privacy', // What to log, PII handling
  'backcompat', // Breaking changes, deprecation policies
]);

export type DecisionClass = z.infer<typeof DecisionClassSchema>;

/**
 * CarrierInstructionKind - Classification for Step E in failureMode resolver.
 */
export const CarrierInstructionKindSchema = z.enum([
  'explicitly_harmful', // Carrier explicitly recommends prohibited mechanism
  'benign_but_missing_guardrails', // Carrier gives valid advice but omits necessary constraints
  'descriptive', // Carrier describes behavior without recommending
  'unknown', // Could not determine
]);

export type CarrierInstructionKind = z.infer<typeof CarrierInstructionKindSchema>;

// ============================================
// DOC FINGERPRINT
// ============================================

/**
 * DocFingerprint - Universal document versioning across source types.
 * Uses discriminatedUnion for efficient parsing.
 */
export const DocFingerprintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('git'),
    repo: z.string().min(1),
    path: z.string().min(1),
    commitSha: z.string().length(40),
  }),
  z.object({
    kind: z.literal('linear'),
    docId: z.string().min(1),
    updatedAt: z.string().datetime(),
    contentHash: z.string().length(64),
  }),
  z.object({
    kind: z.literal('web'),
    url: z.string().url(),
    retrievedAt: z.string().datetime(),
    excerptHash: z.string().length(64),
  }),
  z.object({
    kind: z.literal('external'),
    id: z.string().min(1),
    version: z.string().optional(),
  }),
]);

export type DocFingerprint = z.infer<typeof DocFingerprintSchema>;

// ============================================
// EVIDENCE BUNDLE
// ============================================

/**
 * ConflictSignal - Detected conflict between sources.
 */
export const ConflictSignalSchema = z.object({
  docA: z.string().min(1),
  docB: z.string().min(1),
  topic: z.string().min(1),
  excerptA: z.string().optional(),
  excerptB: z.string().optional(),
});

export type ConflictSignal = z.infer<typeof ConflictSignalSchema>;

/**
 * EvidenceBundle - Structured output from Attribution Agent.
 */
export const EvidenceBundleSchema = z.object({
  // Carrier identification
  carrierStage: z.enum(['context-pack', 'spec']),
  carrierQuote: z.string().min(1).max(2000),
  carrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  carrierLocation: z.string().min(1),

  // Carrier instruction classification for Step E
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
  conflictSignals: z.array(ConflictSignalSchema),
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

// ============================================
// TASK PROFILE
// ============================================

/**
 * TaskProfile - Classification of task interactions.
 */
export const TaskProfileSchema = z.object({
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type TaskProfile = z.infer<typeof TaskProfileSchema>;

// ============================================
// PATTERN DEFINITION
// ============================================

/**
 * PatternDefinition - Reusable pattern representing bad guidance.
 * Scope MUST be project-level.
 */
export const PatternDefinitionSchema = z.object({
  id: z.string().uuid(),
  scope: ScopeSchema.refine((s) => s.level === 'project', {
    message: 'PatternDefinition must have project-level scope',
  }),
  patternKey: z.string().length(64), // Deterministic uniqueness key
  contentHash: z.string().length(64), // SHA-256 of normalized patternContent

  // What was wrong (patternContent is IMMUTABLE)
  patternContent: z.string().min(1).max(2000),
  failureMode: FailureModeSchema,
  findingCategory: FindingCategorySchema,
  severity: SeveritySchema, // Inherited from original finding
  severityMax: SeveritySchema, // MAX severity across all active occurrences

  // What to do instead
  alternative: z.string().min(1).max(2000),
  consequenceClass: z.string().optional(), // CWE-89, etc.

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
  updatedAt: z.string().datetime(),
});

export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;

// ============================================
// PATTERN OCCURRENCE
// ============================================

/**
 * PatternOccurrence - Specific instance of pattern attribution (append-only).
 */
export const PatternOccurrenceSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string().uuid(),

  // Scope (denormalized for query efficiency)
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source finding
  findingId: z.string().min(1),
  issueId: z.string().min(1), // Linear issue key (e.g., PROJ-123)
  prNumber: z.number().int().positive(),
  severity: SeveritySchema, // Severity of THIS occurrence

  // Evidence
  evidence: EvidenceBundleSchema,

  // Provenance chain
  carrierFingerprint: DocFingerprintSchema,
  originFingerprint: DocFingerprintSchema.optional(),
  provenanceChain: z.array(DocFingerprintSchema),

  // Section anchors for change detection
  carrierExcerptHash: z.string().length(64), // SHA-256 of the specific cited excerpt
  originExcerptHash: z.string().length(64).optional(), // SHA-256 of origin excerpt (if traced)

  // Injection tracking
  wasInjected: z.boolean(),
  wasAdheredTo: z.boolean().nullable(),

  // Lifecycle
  status: z.enum(['active', 'inactive']),
  inactiveReason: z
    .enum(['superseded_doc', 'pattern_archived', 'false_positive'])
    .optional(),

  // ProvisionalAlert link (for promotion tracking)
  provisionalAlertId: z.string().uuid().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
});

export type PatternOccurrence = z.infer<typeof PatternOccurrenceSchema>;

// ============================================
// DERIVED PRINCIPLE
// ============================================

/**
 * DerivedPrinciple - General principle (baseline or derived from patterns).
 * Scope MUST be workspace-level.
 */
export const DerivedPrincipleSchema = z.object({
  id: z.string().uuid(),
  scope: ScopeSchema.refine((s) => s.level === 'workspace', {
    message: 'DerivedPrinciple must have workspace-level scope',
  }),

  // Content
  principle: z.string().min(1).max(500),
  rationale: z.string().min(1).max(1000),

  // Origin
  origin: z.enum(['baseline', 'derived']),
  derivedFrom: z.array(z.string().uuid()).optional(),
  externalRefs: z.array(z.string()).optional(), // CWE-89, OWASP-A03

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

  // Promotion tracking for idempotency and rollback
  promotionKey: z.string().optional(), // Hash of sorted source pattern IDs

  // Rollback/archive tracking fields
  archivedReason: z.string().optional(),
  archivedAt: z.string().datetime().optional(),
  archivedBy: z.string().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DerivedPrinciple = z.infer<typeof DerivedPrincipleSchema>;

// ============================================
// EXECUTION NONCOMPLIANCE
// ============================================

/**
 * ExecutionNoncompliance - Agent ignored correct guidance.
 */
export const ExecutionNoncomplianceSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source finding
  findingId: z.string().min(1),
  issueId: z.string().min(1), // Linear issue key
  prNumber: z.number().int().positive(),

  // What was ignored
  violatedGuidanceStage: z.enum(['context-pack', 'spec']),
  violatedGuidanceLocation: z.string().min(1),
  violatedGuidanceExcerpt: z.string().min(1).max(2000),

  // Analysis (no 'ambiguity' - that's a guidance problem)
  possibleCauses: z.array(NoncomplianceCauseSchema),

  // Timestamps
  createdAt: z.string().datetime(),
});

export type ExecutionNoncompliance = z.infer<typeof ExecutionNoncomplianceSchema>;

// ============================================
// DOC UPDATE REQUEST
// ============================================

/**
 * DocUpdateRequest - Documentation update needed.
 */
export const DocUpdateRequestSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  findingId: z.string().min(1),
  issueId: z.string().min(1), // Linear issue key
  findingCategory: FindingCategorySchema,
  scoutType: z.string().min(1),
  decisionClass: DecisionClassSchema.optional(), // Required if findingCategory == 'decisions'

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
  createdAt: z.string().datetime(),
});

export type DocUpdateRequest = z.infer<typeof DocUpdateRequestSchema>;

// ============================================
// TAGGING MISS
// ============================================

/**
 * TaggingMiss - Pattern should have matched but wasn't injected.
 */
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
    taskTypes: z.array(z.string()).optional(),
  }),
  missingTags: z.array(z.string()),

  // Resolution
  status: z.enum(['pending', 'resolved']),
  resolution: z
    .enum(['broadened_pattern', 'improved_extraction', 'false_positive'])
    .optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

export type TaggingMiss = z.infer<typeof TaggingMissSchema>;

// ============================================
// INJECTION LOG
// ============================================

/**
 * InjectionLog - Record of what was injected.
 */
export const InjectionLogSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // What was injected
  issueId: z.string().min(1), // Linear issue key
  target: z.enum(['context-pack', 'spec']),

  // Injected items
  injectedPatterns: z.array(z.string().uuid()),
  injectedPrinciples: z.array(z.string().uuid()),
  injectedAlerts: z.array(z.string().uuid()), // ProvisionalAlert IDs

  // Context
  taskProfile: TaskProfileSchema,

  // Timestamps
  injectedAt: z.string().datetime(),
});

export type InjectionLog = z.infer<typeof InjectionLogSchema>;

// ============================================
// PROVISIONAL ALERT
// ============================================

/**
 * ProvisionalAlert - Short-lived alerts for CRITICAL findings that don't meet pattern gate.
 */
export const ProvisionalAlertSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  findingId: z.string().min(1),
  issueId: z.string().min(1), // Linear issue key

  // Content
  message: z.string().min(1).max(500), // Short actionable warning
  touches: z.array(TouchSchema), // For injection filtering

  // Where to inject
  injectInto: z.enum(['context-pack', 'spec', 'both']),

  // Lifecycle
  expiresAt: z.string().datetime(), // Default: createdAt + 14 days
  status: z.enum(['active', 'expired', 'promoted']),
  promotedToPatternId: z.string().uuid().optional(), // If promoted to full pattern

  // Timestamps
  createdAt: z.string().datetime(),
});

export type ProvisionalAlert = z.infer<typeof ProvisionalAlertSchema>;

// ============================================
// SALIENCE ISSUE
// ============================================

/**
 * SalienceIssue - Tracks guidance that is repeatedly ignored.
 */
export const SalienceIssueSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // What's being ignored
  guidanceLocationHash: z.string().length(64), // SHA-256 of (stage + location + excerpt)
  guidanceStage: z.enum(['context-pack', 'spec']),
  guidanceLocation: z.string().min(1),
  guidanceExcerpt: z.string().min(1).max(2000),

  // Tracking
  occurrenceCount: z.number().int().positive(), // How many times ignored in windowDays
  windowDays: z.number().int().default(30),
  noncomplianceIds: z.array(z.string().uuid()), // ExecutionNoncompliance IDs

  // Resolution
  status: z.enum(['pending', 'resolved']),
  resolution: z.enum(['reformatted', 'moved_earlier', 'false_positive']).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

export type SalienceIssue = z.infer<typeof SalienceIssueSchema>;

// ============================================
// KILL SWITCH TYPES (Section 11)
// ============================================

/**
 * PatternCreationState - Kill switch states for pattern creation.
 */
export const PatternCreationStateSchema = z.enum([
  'active', // Normal operation: all patterns created
  'inferred_paused', // Only verbatim/paraphrase patterns created
  'fully_paused', // No new patterns created; injection continues for existing
]);

export type PatternCreationState = z.infer<typeof PatternCreationStateSchema>;

/**
 * KillSwitchStatus - Current state of the kill switch per project.
 */
export const KillSwitchStatusSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Current state
  state: PatternCreationStateSchema,
  reason: z.string().nullable(), // Why we entered this state
  enteredAt: z.string().datetime().nullable(), // When we entered this state
  autoResumeAt: z.string().datetime().nullable(), // Scheduled re-evaluation time

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type KillSwitchStatus = z.infer<typeof KillSwitchStatusSchema>;

/**
 * AttributionHealthMetrics - Rolling 30-day metrics per project.
 */
export const AttributionHealthMetricsSchema = z.object({
  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Rolling window metrics (last 30 days)
  totalAttributions: z.number().int().nonnegative(),
  verbatimAttributions: z.number().int().nonnegative(),
  paraphraseAttributions: z.number().int().nonnegative(),
  inferredAttributions: z.number().int().nonnegative(),

  // Outcome tracking (requires PR review after injection)
  injectionsWithoutRecurrence: z.number().int().nonnegative(),
  injectionsWithRecurrence: z.number().int().nonnegative(),

  // Computed health scores
  attributionPrecisionScore: z.number().min(0).max(1), // verbatim / total
  inferredRatio: z.number().min(0).max(1), // inferred / total
  observedImprovementRate: z.number().min(0).max(1), // (without recurrence) / total

  // Window metadata
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  computedAt: z.string().datetime(),
});

export type AttributionHealthMetrics = z.infer<typeof AttributionHealthMetricsSchema>;

/**
 * AttributionOutcome - Record of each attribution result for health tracking.
 */
export const AttributionOutcomeSchema = z.object({
  id: z.string().uuid(),

  // Scope
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),

  // Source
  issueKey: z.string().min(1), // Linear issue key

  // Attribution details
  carrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  patternCreated: z.boolean(),
  injectionOccurred: z.boolean(),
  recurrenceObserved: z.boolean().nullable(), // null if not yet known

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AttributionOutcome = z.infer<typeof AttributionOutcomeSchema>;
