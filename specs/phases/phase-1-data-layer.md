# Phase 1: Data Layer Foundation

**Parent Document:** `specs/spec-pattern-attribution-v1.0.md`
**Dependencies:** None (this is the foundation)
**Outputs Required By:** Phase 2, Phase 3, Phase 4, Phase 5

---

## 1. Overview

This phase establishes the data layer for the Pattern Attribution System. It includes:
- Zod schemas for all 10 entities (8 original + 2 new: ProvisionalAlert, SalienceIssue)
- SQLite database with better-sqlite3
- Repository pattern for data access
- Baseline principles seeding (11 baselines including B11: Least Privilege)
- Unit tests

---

## 2. Deliverables Checklist

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
- [ ] `src/storage/seed/baselines.ts` - 11 baseline principles
- [ ] `tests/schemas/*.test.ts` - Schema validation tests
- [ ] `tests/storage/*.test.ts` - Repository tests

---

## 3. Entity Definitions

### 3.1 Scope Type

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

### 3.2 Enums

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

### 3.2 DocFingerprint (Discriminated Union)

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

### 3.3 EvidenceBundle

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

### 3.4 PatternDefinition

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

### 3.5 PatternOccurrence

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

  // Timestamps
  createdAt: z.string().datetime()
});
```

### 3.6 DerivedPrinciple

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

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

### 3.7 ExecutionNoncompliance

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

### 3.8 DocUpdateRequest

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

### 3.9 TaskProfile

```typescript
// TaskProfile - Classification of task interactions
export const TaskProfileSchema = z.object({
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});
```

### 3.10 TaggingMiss

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

### 3.11 InjectionLog

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

### 3.12 ProvisionalAlert (NEW)

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

### 3.13 SalienceIssue (NEW)

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

### 3.14 Type Exports

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
```

---

## 4. Database Schema (SQLite)

### 4.1 Database Initialization

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
      created_at TEXT NOT NULL
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
  `);
}

export function getDatabase(): Database.Database {
  return initDatabase();
}
```

---

## 5. Repository Implementation

### 5.1 Base Repository Pattern

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

### 5.2 PatternDefinitionRepository

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
  findByPatternKey(
    scope: { workspaceId: string; projectId: string },
    patternKey: string
  ): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND pattern_key = ?'
    ).get(scope.workspaceId, scope.projectId, patternKey) as Record<string, unknown> | undefined;

    return row ? this.rowToEntity(row) : null;
  }

  findActive(
    scope: { workspaceId: string; projectId: string },
    options?: {
      carrierStage?: 'context-pack' | 'spec';
      findingCategory?: PatternDefinition['findingCategory'];
    }
  ): PatternDefinition[] {
    let sql = 'SELECT * FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = ?';
    const params: unknown[] = [scope.workspaceId, scope.projectId, 'active'];

    if (options?.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options?.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToEntity(row));
  }

  findByTouches(scope: { workspaceId: string; projectId: string }, touches: Touch[]): PatternDefinition[] {
    // Get all active patterns and filter in memory
    const all = this.findActive(scope);
    return all.filter(p =>
      p.touches.some(t => touches.includes(t))
    );
  }

  // NEW: Find patterns from OTHER projects in same workspace (for cross-project warnings)
  findCrossProject(options: {
    workspaceId: string;
    excludeProjectId: string;
    carrierStage?: 'context-pack' | 'spec';
    minSeverity?: Severity;
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
    const existing = this.findByPatternKey({ workspaceId, projectId }, patternKey);
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

### 5.3 ProvisionalAlertRepository (NEW)

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

### 5.4 SalienceIssueRepository (NEW)

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

### 5.5 DerivedPrincipleRepository (KEY METHODS)

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

  // v1.2: Find active principles for injection (workspace-scoped)
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

---

## 6. Baseline Principles

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

export function seedBaselines(repo: DerivedPrincipleRepository): number {
  let seeded = 0;

  for (const baseline of BASELINE_PRINCIPLES) {
    const existing = repo.findByPrinciple(baseline.principle);
    if (!existing) {
      repo.create(baseline);
      seeded++;
    }
  }

  return seeded;
}
```

---

## 7. Tests

### 7.1 Schema Tests

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

### 7.2 Repository Tests

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

## 8. Dependencies

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

## 9. Acceptance Criteria

Phase 1 is complete when:

1. [ ] All Zod schemas defined and exported in `src/schemas/index.ts` (including Scope type)
2. [ ] Database initializes with all tables and indexes (12 tables: workspaces, projects + 10 entity tables)
3. [ ] All 11 repositories implemented with CRUD operations (including Workspace and Project repos)
4. [ ] 11 baseline principles seeded (including B11)
5. [ ] Schema tests pass (valid/invalid data coverage)
6. [ ] Repository tests pass (CRUD, deduplication by patternKey, severityMax updates)
7. [ ] Types exported for use by other phases

---

## 10. Handoff to Phase 2

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
- All Zod schemas and TypeScript types

Phase 2 can now build the Attribution Engine using these data access layers.
