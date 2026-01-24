# Pattern Attribution System: Master Implementation Plan

**Spec Version:** v1.0
**Plan Version:** 1.1
**Last Updated:** 2026-01-18

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Implementation Phases Overview](#2-implementation-phases-overview)
3. [Phase 1: Data Layer Foundation](#3-phase-1-data-layer-foundation)
4. [Phase 2: Attribution Engine](#4-phase-2-attribution-engine)
5. [Phase 3: Injection System](#5-phase-3-injection-system)
6. [Phase 4: Integration & Workflow](#6-phase-4-integration--workflow)
7. [Phase 5: Monitoring & Evolution](#7-phase-5-monitoring--evolution)
8. [Technical Architecture](#8-technical-architecture)
9. [Testing Strategy](#9-testing-strategy)
10. [Risk Assessment](#10-risk-assessment)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

### 1.1 What We're Building

A meta-learning feedback loop for the multi-agent software development system that:
1. **Attributes** PR review findings to the guidance that caused them
2. **Stores** patterns with structured evidence and provenance
3. **Injects** warnings into future Context Pack and Spec agent runs
4. **Learns** from whether injected warnings were followed

### 1.2 Key Differentiators from say-your-harmony

| say-your-harmony (Failed) | Our System |
|---------------------------|------------|
| LLM-generated pattern names | Structured IDs with content hashes |
| Only stores sequentialDeps/parallelSuccesses | Stores full guidance content + evidence |
| Query functions never called | Injection is core design requirement |
| No feedback loop | Complete feedback loop with adherence tracking |

### 1.3 Success Criteria

- [ ] All 10 entities implemented with Zod validation
- [ ] Deterministic failureMode resolver passes test suite
- [ ] Injection system selects and formats warnings correctly
- [ ] PR Review workflow triggers attribution automatically
- [ ] Context Pack/Spec workflows load injected warnings
- [ ] Adherence tracking populates after PR Review

---

## 2. Implementation Phases Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION TIMELINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE 1: Data Layer Foundation                                          │
│  ├── 1.1 Schema definitions (Zod)                                       │
│  ├── 1.2 Storage layer (SQLite)                                         │
│  ├── 1.3 Migration from say-your-harmony                                │
│  └── 1.4 Unit tests                                                     │
│                                                                          │
│  PHASE 2: Attribution Engine                                             │
│  ├── 2.1 Attribution Agent prompt design                                │
│  ├── 2.2 EvidenceBundle extraction                                      │
│  ├── 2.3 Deterministic failureMode resolver                            │
│  ├── 2.4 ExecutionNoncompliance detection                              │
│  └── 2.5 Integration tests                                              │
│                                                                          │
│  PHASE 3: Injection System                                               │
│  ├── 3.1 TaskProfile extraction                                         │
│  ├── 3.2 Tiered selection algorithm                                     │
│  ├── 3.3 Warning formatting                                             │
│  ├── 3.4 Baseline principles seeding                                    │
│  └── 3.5 Injection tests                                                │
│                                                                          │
│  PHASE 4: Integration & Workflow                                         │
│  ├── 4.1 PR Review → Attribution trigger                               │
│  ├── 4.2 Context Pack agent injection                                   │
│  ├── 4.3 Spec agent injection                                           │
│  ├── 4.4 InjectionLog tracking                                          │
│  └── 4.5 End-to-end tests                                               │
│                                                                          │
│  PHASE 5: Monitoring & Evolution                                         │
│  ├── 5.1 Adherence tracking                                             │
│  ├── 5.2 TaggingMiss detection                                          │
│  ├── 5.3 Source doc change invalidation                                 │
│  ├── 5.4 Confidence decay                                               │
│  └── 5.5 Metrics dashboard                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Phase Dependencies

```
Phase 1 (Data Layer) ─────────┬──────────────────────────────────┐
                              │                                  │
                              ▼                                  │
Phase 2 (Attribution Engine) ─┼──────────────────┐               │
                              │                  │               │
                              ▼                  │               │
Phase 3 (Injection System) ───┼──────────────────┤               │
                              │                  │               │
                              ▼                  ▼               │
Phase 4 (Integration) ────────┴──────────────────┴───────────────┤
                                                                 │
                                                                 ▼
Phase 5 (Monitoring & Evolution) ────────────────────────────────┘
```

- **Phases 2 and 3** can run in parallel after Phase 1
- **Phase 4** requires both Phases 2 and 3
- **Phase 5** requires Phase 4

---

## 3. Phase 1: Data Layer Foundation

### 3.1 Deliverables

| Deliverable | Description | Est. Complexity |
|-------------|-------------|-----------------|
| `src/schemas/` | Zod schemas for all 10 entities | Medium |
| `src/storage/` | SQLite storage layer with CRUD | High |
| `src/migrations/` | Schema migrations | Low |
| `tests/schemas/` | Schema validation tests | Medium |
| `tests/storage/` | Storage layer tests | Medium |

### 3.2 Entity Schemas (Zod)

**File:** `src/schemas/index.ts`

```typescript
// === Enums ===
export const FailureModeSchema = z.enum([
  'incorrect',
  'incomplete',
  'missing_reference',
  'ambiguous',
  'conflict_unresolved',
  'synthesis_drift'
]);

export const FindingCategorySchema = z.enum([
  'security',
  'correctness',
  'testing',
  'compliance',
  'decisions'  // NEW in v1.0 - maps to Decisions Scout/Judge
]);

export const SeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW'
]);

export const TouchSchema = z.enum([
  'user_input',
  'database',
  'network',
  'auth',
  'authz',
  'caching',
  'schema',
  'logging',
  'config',
  'api'
]);

// === DocFingerprint (Discriminated Union) ===
export const DocFingerprintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('git'),
    repo: z.string(),
    path: z.string(),
    commitSha: z.string().length(40)
  }),
  z.object({
    kind: z.literal('linear'),
    docId: z.string(),
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
    id: z.string(),
    version: z.string().optional()
  })
]);

// === ConflictSignal ===
export const ConflictSignalSchema = z.object({
  docA: z.string(),
  docB: z.string(),
  topic: z.string(),
  excerptA: z.string().optional(),
  excerptB: z.string().optional()
});

// === CarrierInstructionKind (NEW in v1.0) ===
export const CarrierInstructionKindSchema = z.enum([
  'explicitly_harmful',           // Carrier explicitly recommends prohibited mechanism
  'benign_but_missing_guardrails', // Carrier gives valid advice but omits necessary constraints
  'descriptive',                  // Carrier describes behavior without recommending
  'unknown'                       // Could not determine
]);

// === EvidenceBundle ===
export const EvidenceBundleSchema = z.object({
  carrierStage: z.enum(['context-pack', 'spec']),
  carrierQuote: z.string().min(1).max(2000),
  carrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  carrierLocation: z.string(),
  carrierInstructionKind: CarrierInstructionKindSchema, // NEW: For Step E in failureMode resolver
  hasCitation: z.boolean(),
  citedSources: z.array(z.string()),
  sourceRetrievable: z.boolean(),
  sourceAgreesWithCarrier: z.boolean().nullable(),
  mandatoryDocMissing: z.boolean(),
  missingDocId: z.string().optional(),
  vaguenessSignals: z.array(z.string()),
  hasTestableAcceptanceCriteria: z.boolean(),
  conflictSignals: z.array(ConflictSignalSchema)
});

// === PatternDefinition ===
export const PatternDefinitionSchema = z.object({
  id: z.string().uuid(),
  scope: z.object({
    level: z.literal('project'),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid()
  }),
  patternKey: z.string().length(64),        // SHA-256(carrierStage|patternContent|findingCategory)
  contentHash: z.string().length(64),       // SHA-256 of normalized patternContent
  patternContent: z.string().min(1).max(2000),
  failureMode: FailureModeSchema,
  findingCategory: FindingCategorySchema,
  severity: SeveritySchema,
  severityMax: SeveritySchema,              // MAX severity across all active occurrences
  alternative: z.string().min(1).max(2000),
  consequenceClass: z.string().optional(),
  carrierStage: z.enum(['context-pack', 'spec']),
  primaryCarrierQuoteType: z.enum(['verbatim', 'paraphrase', 'inferred']),
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  touches: z.array(TouchSchema),
  alignedBaselineId: z.string().uuid().optional(),
  status: z.enum(['active', 'archived', 'superseded']),
  permanent: z.boolean(),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// === PatternOccurrence ===
export const PatternOccurrenceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  patternId: z.string().uuid(),
  findingId: z.string(),
  issueId: z.string(),
  prNumber: z.number().int().positive(),
  severity: SeveritySchema,                 // Severity of THIS occurrence
  evidence: EvidenceBundleSchema,
  carrierFingerprint: DocFingerprintSchema,
  originFingerprint: DocFingerprintSchema.optional(),
  provenanceChain: z.array(DocFingerprintSchema),
  carrierExcerptHash: z.string().length(64), // SHA-256 of the specific cited excerpt
  originExcerptHash: z.string().length(64).optional(), // SHA-256 of origin excerpt (if traced)
  wasInjected: z.boolean(),
  wasAdheredTo: z.boolean().nullable(),
  status: z.enum(['active', 'inactive']),
  inactiveReason: z.enum([
    'superseded_doc',
    'pattern_archived',
    'false_positive'
  ]).optional(),
  createdAt: z.string().datetime()
});

// === DerivedPrinciple ===
export const DerivedPrincipleSchema = z.object({
  id: z.string().uuid(),
  scope: z.object({
    level: z.literal('workspace'),
    workspaceId: z.string().uuid()
  }),
  principle: z.string().min(1).max(500),
  rationale: z.string().min(1).max(1000),
  origin: z.enum(['baseline', 'derived']),
  derivedFrom: z.array(z.string().uuid()).optional(),
  externalRefs: z.array(z.string()).optional(),
  injectInto: z.enum(['context-pack', 'spec', 'both']),
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()).optional(),
  taskTypes: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['active', 'archived', 'superseded']),
  permanent: z.boolean(),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// === NoncomplianceCause (v1.0: 'ambiguity' removed - guidance problem, not execution) ===
export const NoncomplianceCauseSchema = z.enum([
  'salience',     // Warning wasn't prominent enough
  'formatting',   // Warning format was unclear
  'override'      // Agent intentionally overrode (rare)
]);

// === ExecutionNoncompliance ===
export const ExecutionNoncomplianceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  findingId: z.string(),
  issueId: z.string(),
  prNumber: z.number().int().positive(),
  violatedGuidanceStage: z.enum(['context-pack', 'spec']),
  violatedGuidanceLocation: z.string(),
  violatedGuidanceExcerpt: z.string().min(1).max(2000),
  possibleCauses: z.array(NoncomplianceCauseSchema),
  createdAt: z.string().datetime()
});

// === DocUpdateRequest ===
export const DocUpdateRequestSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  findingId: z.string(),
  issueId: z.string(),
  findingCategory: FindingCategorySchema,
  scoutType: z.string(),
  targetDoc: z.string(),
  updateType: z.enum([
    'add_decision',
    'clarify_guidance',
    'fix_error',
    'add_constraint'
  ]),
  decisionClass: DecisionClassSchema.optional(),  // Required if findingCategory == 'decisions'
  description: z.string().min(1).max(2000),
  suggestedContent: z.string().max(5000).optional(),
  status: z.enum(['pending', 'completed', 'rejected']),
  completedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
  createdAt: z.string().datetime()
});

// === DecisionClass (NEW in v1.0) ===
// Classification for counting decision recurrence
export const DecisionClassSchema = z.enum([
  'caching',           // Caching invalidation, TTLs, strategies
  'retries',           // Retry policies, backoff strategies
  'timeouts',          // Timeout values, circuit breaker thresholds
  'authz_model',       // Permission models, role hierarchies
  'error_contract',    // Error codes, shapes, status codes
  'migrations',        // Schema migration strategies, rollback plans
  'logging_privacy',   // What to log, PII handling
  'backcompat'         // Breaking changes, deprecation policies
]);

export type DecisionClass = z.infer<typeof DecisionClassSchema>;

// === TaskProfile ===
export const TaskProfileSchema = z.object({
  touches: z.array(TouchSchema),
  technologies: z.array(z.string()),
  taskTypes: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

// === TaggingMiss ===
export const TaggingMissSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  findingId: z.string(),
  patternId: z.string().uuid(),
  actualTaskProfile: TaskProfileSchema,
  requiredMatch: z.object({
    touches: z.array(TouchSchema).optional(),
    technologies: z.array(z.string()).optional(),
    taskTypes: z.array(z.string()).optional()
  }),
  missingTags: z.array(z.string()),
  status: z.enum(['pending', 'resolved']),
  resolution: z.enum([
    'broadened_pattern',
    'improved_extraction',
    'false_positive'
  ]).optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional()
});

// === InjectionLog ===
export const InjectionLogSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  issueId: z.string(),
  target: z.enum(['context-pack', 'spec']),
  injectedPatterns: z.array(z.string().uuid()),
  injectedPrinciples: z.array(z.string().uuid()),
  injectedAlerts: z.array(z.string().uuid()),  // NEW in v1.0
  taskProfile: TaskProfileSchema,
  injectedAt: z.string().datetime()
});

// === ProvisionalAlert (NEW in v1.0) ===
// Short-lived alerts for CRITICAL findings that don't meet pattern gate (2+ occurrences).
// TTL: 14 days. Keeps deterministic pattern gate intact while allowing immediate response.
export const ProvisionalAlertSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  findingId: z.string(),
  issueId: z.string(),
  message: z.string().min(1).max(500),         // Short actionable warning
  touches: z.array(TouchSchema),               // For injection filtering
  injectInto: z.enum(['context-pack', 'spec', 'both']),
  expiresAt: z.string().datetime(),            // Default: createdAt + 14 days
  status: z.enum(['active', 'expired', 'promoted']),
  promotedToPatternId: z.string().uuid().optional(), // If promoted to full pattern
  createdAt: z.string().datetime()
});

// === SalienceIssue (NEW in v1.0) ===
// Tracks guidance ignored 3+ times in 30 days. Signals salience problem, not guidance problem.
export const SalienceIssueSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  guidanceLocationHash: z.string().length(64), // SHA-256(stage + location + excerpt)
  guidanceStage: z.enum(['context-pack', 'spec']),
  guidanceLocation: z.string(),                // Section reference
  guidanceExcerpt: z.string().min(1).max(2000),
  occurrenceCount: z.number().int().min(3),    // How many times ignored in windowDays
  windowDays: z.number().int().default(30),    // Default: 30
  noncomplianceIds: z.array(z.string().uuid()), // ExecutionNoncompliance IDs
  status: z.enum(['pending', 'resolved']),
  resolution: z.enum(['reformatted', 'moved_earlier', 'false_positive']).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional()
});

// === Scope (NEW - from spec v1.0) ===
export const ScopeSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('global') }),
  z.object({ level: z.literal('workspace'), workspaceId: z.string().uuid() }),
  z.object({
    level: z.literal('project'),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid()
  })
]);

// === WorkspaceConfig ===
export const WorkspaceConfigSchema = z.object({
  maxInjectedWarnings: z.number().int().min(1).max(20).optional(),
  crossProjectWarningsEnabled: z.boolean().optional()
}).passthrough();

// === Workspace (NEW - from spec v1.0 Section 2.11) ===
export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  config: WorkspaceConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// === ProjectConfig ===
export const ProjectConfigSchema = z.object({
  linearProjectId: z.string().optional(),
  linearTeamId: z.string().optional(),
  defaultTouches: z.array(TouchSchema).optional()
}).passthrough();

// === Project (NEW - from spec v1.0 Section 2.12) ===
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  repoOriginUrl: z.string().min(1),
  repoSubdir: z.string().optional(),
  repoPath: z.string().optional(),
  config: ProjectConfigSchema,
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Type exports
export type FailureMode = z.infer<typeof FailureModeSchema>;
export type FindingCategory = z.infer<typeof FindingCategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Touch = z.infer<typeof TouchSchema>;
export type DocFingerprint = z.infer<typeof DocFingerprintSchema>;
export type ConflictSignal = z.infer<typeof ConflictSignalSchema>;
export type CarrierInstructionKind = z.infer<typeof CarrierInstructionKindSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;
export type PatternOccurrence = z.infer<typeof PatternOccurrenceSchema>;
export type DerivedPrinciple = z.infer<typeof DerivedPrincipleSchema>;
export type NoncomplianceCause = z.infer<typeof NoncomplianceCauseSchema>;
export type ExecutionNoncompliance = z.infer<typeof ExecutionNoncomplianceSchema>;
export type DocUpdateRequest = z.infer<typeof DocUpdateRequestSchema>;
export type TaskProfile = z.infer<typeof TaskProfileSchema>;
export type TaggingMiss = z.infer<typeof TaggingMissSchema>;
export type InjectionLog = z.infer<typeof InjectionLogSchema>;
export type ProvisionalAlert = z.infer<typeof ProvisionalAlertSchema>;
export type SalienceIssue = z.infer<typeof SalienceIssueSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Project = z.infer<typeof ProjectSchema>;
```

### 3.3 Storage Layer (SQLite)

**File:** `src/storage/db.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), '.claude', 'meta', 'patterns.db');

export function initDatabase(): Database.Database {
  const db = new Database(DB_PATH);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 20000');

  // Create tables
  db.exec(`
    -- Workspaces (NEW - from spec v1.0)
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      config TEXT NOT NULL,  -- JSON
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Projects (NEW - from spec v1.0)
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      repo_origin_url TEXT NOT NULL,
      repo_subdir TEXT,
      repo_path TEXT,
      config TEXT NOT NULL,  -- JSON
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_identity
      ON projects(workspace_id, repo_origin_url, repo_subdir);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    -- Pattern Definitions
    CREATE TABLE IF NOT EXISTS pattern_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      pattern_key TEXT NOT NULL,              -- SHA-256(carrierStage|patternContent|findingCategory)
      content_hash TEXT NOT NULL,           -- SHA-256 of normalized patternContent
      pattern_content TEXT NOT NULL,
      failure_mode TEXT NOT NULL,
      finding_category TEXT NOT NULL,
      severity TEXT NOT NULL,
      severity_max TEXT NOT NULL,           -- MAX severity across all active occurrences
      alternative TEXT NOT NULL,
      consequence_class TEXT,
      carrier_stage TEXT NOT NULL,
      primary_carrier_quote_type TEXT NOT NULL,
      technologies TEXT NOT NULL, -- JSON array
      task_types TEXT NOT NULL,   -- JSON array
      touches TEXT NOT NULL,      -- JSON array
      aligned_baseline_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (aligned_baseline_id) REFERENCES derived_principles(id),
      FOREIGN KEY (superseded_by) REFERENCES pattern_definitions(id)
    );

    -- Pattern Occurrences
    CREATE TABLE IF NOT EXISTS pattern_occurrences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      severity TEXT NOT NULL,            -- Severity of THIS occurrence
      evidence TEXT NOT NULL,            -- JSON
      carrier_fingerprint TEXT NOT NULL, -- JSON
      origin_fingerprint TEXT,           -- JSON
      provenance_chain TEXT NOT NULL,    -- JSON array
      carrier_excerpt_hash TEXT NOT NULL, -- SHA-256 of the specific cited excerpt
      origin_excerpt_hash TEXT,          -- SHA-256 of origin excerpt (if traced)
      was_injected INTEGER NOT NULL DEFAULT 0,
      was_adhered_to INTEGER,            -- NULL, 0, or 1
      status TEXT NOT NULL DEFAULT 'active',
      inactive_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (pattern_id) REFERENCES pattern_definitions(id)
    );

    -- Derived Principles
    CREATE TABLE IF NOT EXISTS derived_principles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      principle TEXT NOT NULL,
      rationale TEXT NOT NULL,
      origin TEXT NOT NULL,
      derived_from TEXT,          -- JSON array
      external_refs TEXT,         -- JSON array
      inject_into TEXT NOT NULL,
      touches TEXT NOT NULL,      -- JSON array
      technologies TEXT,          -- JSON array
      task_types TEXT,            -- JSON array
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      permanent INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (superseded_by) REFERENCES derived_principles(id)
    );

    -- Execution Noncompliance
    CREATE TABLE IF NOT EXISTS execution_noncompliance (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      violated_guidance_stage TEXT NOT NULL,
      violated_guidance_location TEXT NOT NULL,
      violated_guidance_excerpt TEXT NOT NULL,
      possible_causes TEXT NOT NULL, -- JSON array
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Doc Update Requests
    CREATE TABLE IF NOT EXISTS doc_update_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      finding_category TEXT NOT NULL,
      scout_type TEXT NOT NULL,
      target_doc TEXT NOT NULL,
      update_type TEXT NOT NULL,
      decision_class TEXT,  -- Required if finding_category == 'decisions'
      description TEXT NOT NULL,
      suggested_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Tagging Misses
    CREATE TABLE IF NOT EXISTS tagging_misses (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      actual_task_profile TEXT NOT NULL, -- JSON
      required_match TEXT NOT NULL,       -- JSON
      missing_tags TEXT NOT NULL,         -- JSON array
      status TEXT NOT NULL DEFAULT 'pending',
      resolution TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (pattern_id) REFERENCES pattern_definitions(id)
    );

    -- Injection Logs
    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      target TEXT NOT NULL,
      injected_patterns TEXT NOT NULL,   -- JSON array
      injected_principles TEXT NOT NULL, -- JSON array
      injected_alerts TEXT NOT NULL,     -- JSON array (NEW in v1.0)
      task_profile TEXT NOT NULL,        -- JSON
      injected_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Provisional Alerts (NEW in v1.0)
    CREATE TABLE IF NOT EXISTS provisional_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      message TEXT NOT NULL,
      touches TEXT NOT NULL,             -- JSON array
      inject_into TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      promoted_to_pattern_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (promoted_to_pattern_id) REFERENCES pattern_definitions(id)
    );

    -- Salience Issues (NEW in v1.0)
    CREATE TABLE IF NOT EXISTS salience_issues (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      guidance_location_hash TEXT UNIQUE NOT NULL, -- SHA-256(stage + location + excerpt)
      guidance_stage TEXT NOT NULL,
      guidance_location TEXT NOT NULL,
      guidance_excerpt TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL,
      window_days INTEGER NOT NULL DEFAULT 30,
      noncompliance_ids TEXT NOT NULL,   -- JSON array
      status TEXT NOT NULL DEFAULT 'pending',
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON pattern_definitions(status);
    CREATE INDEX IF NOT EXISTS idx_patterns_carrier_stage ON pattern_definitions(carrier_stage);
    CREATE INDEX IF NOT EXISTS idx_patterns_finding_category ON pattern_definitions(finding_category);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_scope_key
      ON pattern_definitions(workspace_id, project_id, pattern_key);
    CREATE INDEX IF NOT EXISTS idx_occurrences_pattern_id ON pattern_occurrences(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_issue_id ON pattern_occurrences(issue_id);
    CREATE INDEX IF NOT EXISTS idx_occurrences_status ON pattern_occurrences(status);
    CREATE INDEX IF NOT EXISTS idx_principles_status ON derived_principles(status);
    CREATE INDEX IF NOT EXISTS idx_principles_origin ON derived_principles(origin);
    CREATE INDEX IF NOT EXISTS idx_injection_logs_issue_id ON injection_logs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_status ON provisional_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_provisional_alerts_expires_at ON provisional_alerts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_salience_issues_status ON salience_issues(status);
  `);

  return db;
}
```

### 3.4 Repository Pattern

**File:** `src/storage/repositories/pattern-definition.repo.ts`

```typescript
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { PatternDefinition, Touch } from '../../schemas';
import { PatternDefinitionSchema } from '../../schemas';

export class PatternDefinitionRepository {
  constructor(private db: Database) {}

  findById(id: string): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE id = ?'
    ).get(id);
    return row ? this.rowToEntity(row) : null;
  }

  findByPatternKey(patternKey: string): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE pattern_key = ?'
    ).get(patternKey);
    return row ? this.rowToEntity(row) : null;
  }

  findByContentHash(contentHash: string): PatternDefinition | null {
    const row = this.db.prepare(
      'SELECT * FROM pattern_definitions WHERE content_hash = ?'
    ).get(contentHash);
    return row ? this.rowToEntity(row) : null;
  }

  findActive(options?: {
    carrierStage?: 'context-pack' | 'spec';
    touches?: Touch[];
    technologies?: string[];
    taskTypes?: string[];
    findingCategory?: string;
  }): PatternDefinition[] {
    let sql = 'SELECT * FROM pattern_definitions WHERE status = ?';
    const params: unknown[] = ['active'];

    if (options?.carrierStage) {
      sql += ' AND carrier_stage = ?';
      params.push(options.carrierStage);
    }

    if (options?.findingCategory) {
      sql += ' AND finding_category = ?';
      params.push(options.findingCategory);
    }

    const rows = this.db.prepare(sql).all(...params);
    let patterns = rows.map(row => this.rowToEntity(row));

    // Filter by touches/technologies/taskTypes in memory
    // (JSON array filtering is complex in SQLite)
    if (options?.touches?.length) {
      patterns = patterns.filter(p =>
        p.touches.some(t => options.touches!.includes(t))
      );
    }

    if (options?.technologies?.length) {
      patterns = patterns.filter(p =>
        p.technologies.some(t => options.technologies!.includes(t))
      );
    }

    if (options?.taskTypes?.length) {
      patterns = patterns.filter(p =>
        p.taskTypes.some(t => options.taskTypes!.includes(t))
      );
    }

    return patterns;
  }

  create(data: Omit<PatternDefinition, 'id' | 'patternKey' | 'contentHash' | 'createdAt' | 'updatedAt'>): PatternDefinition {
    const now = new Date().toISOString();
    const normalizedContent = data.patternContent.replace(/\s+/g, ' ').trim();
    const contentHash = createHash('sha256')
      .update(normalizedContent)
      .digest('hex');

    // patternKey = SHA-256(carrierStage|patternContent|findingCategory)
    const patternKey = createHash('sha256')
      .update(`${data.carrierStage}|${normalizedContent}|${data.findingCategory}`)
      .digest('hex');

    // Check for existing pattern with same patternKey (v1.0 deduplication)
    const existing = this.findByPatternKey(patternKey);
    if (existing) {
      return existing; // Deduplication by patternKey
    }

    const pattern: PatternDefinition = {
      id: uuidv4(),
      patternKey,
      contentHash,
      severityMax: data.severity, // Initialize severityMax to initial severity
      createdAt: now,
      updatedAt: now,
      ...data
    };

    // Validate with Zod
    PatternDefinitionSchema.parse(pattern);

    this.db.prepare(`
      INSERT INTO pattern_definitions (
        id, pattern_key, content_hash, pattern_content, failure_mode, finding_category,
        severity, severity_max, alternative, consequence_class, carrier_stage,
        primary_carrier_quote_type, technologies, task_types, touches,
        aligned_baseline_id, status, permanent, superseded_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pattern.id,
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
      JSON.stringify(pattern.technologies),
      JSON.stringify(pattern.taskTypes),
      JSON.stringify(pattern.touches),
      pattern.alignedBaselineId ?? null,
      pattern.status,
      pattern.permanent ? 1 : 0,
      pattern.supersededBy ?? null,
      pattern.createdAt,
      pattern.updatedAt
    );

    return pattern;
  }

  update(id: string, data: Partial<PatternDefinition>): PatternDefinition | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: PatternDefinition = {
      ...existing,
      ...data,
      id: existing.id, // Never change ID
      patternKey: existing.patternKey, // Never change patternKey (identity)
      contentHash: existing.contentHash, // Never change hash
      createdAt: existing.createdAt, // Never change creation time
      updatedAt: new Date().toISOString()
    };

    // Validate
    PatternDefinitionSchema.parse(updated);

    this.db.prepare(`
      UPDATE pattern_definitions SET
        pattern_content = ?,
        failure_mode = ?,
        finding_category = ?,
        severity = ?,
        severity_max = ?,
        alternative = ?,
        consequence_class = ?,
        carrier_stage = ?,
        primary_carrier_quote_type = ?,
        technologies = ?,
        task_types = ?,
        touches = ?,
        aligned_baseline_id = ?,
        status = ?,
        permanent = ?,
        superseded_by = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updated.patternContent,
      updated.failureMode,
      updated.findingCategory,
      updated.severity,
      updated.severityMax,
      updated.alternative,
      updated.consequenceClass ?? null,
      updated.carrierStage,
      updated.primaryCarrierQuoteType,
      JSON.stringify(updated.technologies),
      JSON.stringify(updated.taskTypes),
      JSON.stringify(updated.touches),
      updated.alignedBaselineId ?? null,
      updated.status,
      updated.permanent ? 1 : 0,
      updated.supersededBy ?? null,
      updated.updatedAt,
      id
    );

    return updated;
  }

  private rowToEntity(row: unknown): PatternDefinition {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      patternKey: r.pattern_key as string,
      contentHash: r.content_hash as string,
      patternContent: r.pattern_content as string,
      failureMode: r.failure_mode as PatternDefinition['failureMode'],
      findingCategory: r.finding_category as PatternDefinition['findingCategory'],
      severity: r.severity as PatternDefinition['severity'],
      severityMax: r.severity_max as PatternDefinition['severityMax'],
      alternative: r.alternative as string,
      consequenceClass: r.consequence_class as string | undefined,
      carrierStage: r.carrier_stage as PatternDefinition['carrierStage'],
      primaryCarrierQuoteType: r.primary_carrier_quote_type as PatternDefinition['primaryCarrierQuoteType'],
      technologies: JSON.parse(r.technologies as string),
      taskTypes: JSON.parse(r.task_types as string),
      touches: JSON.parse(r.touches as string),
      alignedBaselineId: r.aligned_baseline_id as string | undefined,
      status: r.status as PatternDefinition['status'],
      permanent: r.permanent === 1,
      supersededBy: r.superseded_by as string | undefined,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  }
}
```

### 3.5 Baseline Principles Seeding

**File:** `src/storage/seed/baselines.ts`

```typescript
import type { DerivedPrinciple } from '../../schemas';
import { v4 as uuidv4 } from 'uuid';

export const BASELINE_PRINCIPLES: Omit<DerivedPrinciple, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    principle: 'Always use parameterized queries for SQL. Never interpolate user input into query strings.',
    rationale: 'Prevents SQL injection, the most common and dangerous database vulnerability.',
    origin: 'baseline',
    externalRefs: ['CWE-89'],
    injectInto: 'both',
    touches: ['database', 'user_input'],
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
    touches: ['user_input'],
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
    touches: ['logging', 'auth'],
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
    touches: ['auth', 'authz'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Set timeouts on all network calls. No unbounded waits.',
    rationale: 'Prevents resource exhaustion and cascading failures from slow/unresponsive services.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Implement retry with exponential backoff, jitter, and maximum attempt limits.',
    rationale: 'Prevents retry storms and allows graceful degradation during outages.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Use idempotency keys for operations that cannot be safely retried.',
    rationale: 'Prevents duplicate processing and data corruption during network retries.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['network', 'database'],
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
    touches: ['user_input', 'api'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Require migration plan with rollback strategy for all schema changes.',
    rationale: 'Prevents data loss and enables recovery from failed deployments.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['schema'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Define error contract (status codes, error shapes, error codes) before implementation.',
    rationale: 'Ensures consistent error handling across the system and clear client expectations.',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['api'],
    confidence: 0.9,
    status: 'active',
    permanent: true
  },
  {
    principle: 'Use least-privilege credentials for DB/service access. Don\'t run migrations/ops with app runtime creds. Scope tokens tightly.',
    rationale: 'Reduces blast radius of credential compromise and limits damage from bugs.',
    origin: 'baseline',
    externalRefs: ['CWE-250'],
    injectInto: 'both',
    touches: ['database', 'auth', 'config'],
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

### 3.6 Tests

**File:** `tests/schemas/pattern-definition.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { PatternDefinitionSchema } from '../../src/schemas';

describe('PatternDefinitionSchema', () => {
  const validPattern = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    contentHash: 'a'.repeat(64),
    patternContent: 'Use template literals for SQL queries',
    failureMode: 'incorrect',
    findingCategory: 'security',
    severity: 'HIGH',
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

  it('rejects content hash wrong length', () => {
    const result = PatternDefinitionSchema.safeParse({
      ...validPattern,
      contentHash: 'tooshort'
    });
    expect(result.success).toBe(false);
  });
});
```

---

## 4. Phase 2: Attribution Engine

### 4.1 Deliverables

| Deliverable | Description | Est. Complexity |
|-------------|-------------|-----------------|
| `src/attribution/agent.ts` | Attribution Agent prompt and runner | High |
| `src/attribution/evidence-extractor.ts` | EvidenceBundle construction | High |
| `src/attribution/failure-mode-resolver.ts` | Deterministic decision tree | Medium |
| `src/attribution/noncompliance-checker.ts` | ExecutionNoncompliance detection | Medium |
| `tests/attribution/` | Attribution tests | High |

### 4.2 Attribution Agent Prompt

**File:** `src/attribution/prompts/attribution-agent.ts`

```typescript
export const ATTRIBUTION_AGENT_SYSTEM_PROMPT = `
You are the Attribution Agent. Your job is to analyze confirmed PR review findings
and extract structured evidence about what guidance caused the problem.

## Your Task

For each confirmed finding, you will:
1. Search the Context Pack and Spec for the guidance that led to this problem
2. Extract structured evidence (not free-form judgment)
3. Trace provenance if the guidance cites sources

## Output Format

You MUST output a valid JSON object matching this schema:

\`\`\`json
{
  "carrierStage": "context-pack" | "spec",
  "carrierQuote": "The exact or paraphrased guidance text",
  "carrierQuoteType": "verbatim" | "paraphrase" | "inferred",
  "carrierLocation": "Section X.Y or line reference",
  "hasCitation": true | false,
  "citedSources": ["source1.md", "source2.md"],
  "sourceRetrievable": true | false,
  "sourceAgreesWithCarrier": true | false | null,
  "mandatoryDocMissing": true | false,
  "missingDocId": "SECURITY.md" | null,
  "vaguenessSignals": ["appropriately", "robust", ...],
  "hasTestableAcceptanceCriteria": true | false,
  "conflictSignals": [
    {
      "docA": "source1.md",
      "docB": "source2.md",
      "topic": "SQL query construction",
      "excerptA": "...",
      "excerptB": "..."
    }
  ]
}
\`\`\`

## Field Definitions

### carrierQuoteType
- **verbatim**: You found the exact text in the document
- **paraphrase**: You found text that conveys the same meaning
- **inferred**: You couldn't find explicit text, but the guidance is implied by what's missing

### mandatoryDocMissing
Set to true if a document that MUST be referenced for this task type was not cited.
Mandatory docs by task type:
- auth/authz tasks → SECURITY.md
- database tasks → DB_PATTERNS.md, MIGRATIONS.md
- api tasks → API_DESIGN.md

### vaguenessSignals
Look for words like: "appropriately", "robust", "as needed", "consider", "may",
"should consider", "it depends", "typically", "usually", "might"

### hasTestableAcceptanceCriteria
Does the guidance include specific, verifiable acceptance criteria?
NOT testable: "Handle errors appropriately"
Testable: "Return 400 status code with error body matching ErrorResponse schema"

## Important

- Do NOT determine failureMode. That's done by a deterministic resolver.
- Do NOT make subjective judgments. Extract evidence.
- If you can't find guidance, set carrierQuoteType to "inferred" and explain what's missing.
- Always check if the guidance cites sources, and if so, whether those sources agree.
`;

export const ATTRIBUTION_AGENT_USER_PROMPT = (params: {
  finding: {
    title: string;
    description: string;
    scoutType: string;
    severity: string;
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: string;
  spec: string;
}) => `
## Confirmed Finding

**Title:** ${params.finding.title}
**Scout:** ${params.finding.scoutType}
**Severity:** ${params.finding.severity}
**Location:** ${params.finding.location.file}${params.finding.location.line ? `:${params.finding.location.line}` : ''}

**Description:**
${params.finding.description}

**Evidence:**
${params.finding.evidence}

---

## Context Pack Content

${params.contextPack}

---

## Spec Content

${params.spec}

---

## Your Task

Analyze this finding and extract the EvidenceBundle. Output ONLY valid JSON.
`;
```

### 4.3 Deterministic FailureMode Resolver

**File:** `src/attribution/failure-mode-resolver.ts`

```typescript
import type { EvidenceBundle, FailureMode } from '../schemas';

interface ResolverResult {
  failureMode: FailureMode;
  confidenceModifier: number;
  flags: {
    suspectedSynthesisDrift: boolean;
  };
}

/**
 * Deterministic decision tree for resolving failureMode from evidence.
 * See Spec Section 3.3.
 */
export function resolveFailureMode(evidence: EvidenceBundle): ResolverResult {
  const result: ResolverResult = {
    failureMode: 'incomplete', // Default
    confidenceModifier: 0,
    flags: {
      suspectedSynthesisDrift: false
    }
  };

  // STEP A: Can we prove synthesis drift?
  if (evidence.hasCitation && evidence.sourceRetrievable) {
    if (evidence.sourceAgreesWithCarrier === false) {
      // Source disagrees with carrier - synthesis drift proven
      result.failureMode = 'synthesis_drift';
      return result;
    }
  }

  if (evidence.hasCitation && !evidence.sourceRetrievable) {
    // Can't retrieve source - might be drift, lower confidence
    result.failureMode = 'incorrect';
    result.flags.suspectedSynthesisDrift = true;
    result.confidenceModifier = -0.15;
    return result;
  }

  // STEP B: Is mandatory doc missing?
  if (evidence.mandatoryDocMissing) {
    result.failureMode = 'missing_reference';
    return result;
  }

  // STEP C: Are there unresolved conflicts?
  if (evidence.conflictSignals.length > 0) {
    // For v1, we don't check for resolution sections - assume unresolved
    result.failureMode = 'conflict_unresolved';
    return result;
  }

  // STEP D: Ambiguous vs Incomplete
  const ambiguityScore = calculateAmbiguityScore(evidence);
  const incompletenessScore = calculateIncompletenessScore(evidence);

  if (ambiguityScore > incompletenessScore) {
    result.failureMode = 'ambiguous';
    return result;
  }

  if (incompletenessScore > ambiguityScore) {
    result.failureMode = 'incomplete';
    return result;
  }

  // STEP E: Incorrect vs Incomplete (using carrierInstructionKind - v1.0 fix)
  // CHANGED: No longer assumes "quote exists → incorrect"
  // Uses structured classification from Attribution Agent
  if (evidence.carrierQuoteType === 'verbatim' || evidence.carrierQuoteType === 'paraphrase') {
    switch (evidence.carrierInstructionKind) {
      case 'explicitly_harmful':
        // Carrier explicitly recommends prohibited mechanism
        // e.g., "Use template literals for SQL queries"
        result.failureMode = 'incorrect';
        return result;

      case 'benign_but_missing_guardrails':
        // Carrier gives valid advice but omits constraints
        // e.g., "Retry failed requests" (no max/backoff)
        result.failureMode = 'incomplete';
        return result;

      case 'descriptive':
        // Carrier describes without recommending
        // e.g., "The system uses string concatenation"
        result.failureMode = 'incomplete';
        return result;

      case 'unknown':
      default:
        // Conservative default
        result.failureMode = 'incomplete';
        return result;
    }
  }

  // carrierQuoteType is 'inferred' — no direct quote found
  result.failureMode = 'incomplete';  // Conservative default
  return result;
}

function calculateAmbiguityScore(evidence: EvidenceBundle): number {
  let score = 0;

  // Multiple vagueness signals indicate ambiguity
  if (evidence.vaguenessSignals.length >= 2) {
    score += 2;
  } else if (evidence.vaguenessSignals.length === 1) {
    score += 1;
  }

  // No testable acceptance criteria
  if (!evidence.hasTestableAcceptanceCriteria) {
    score += 1;
  }

  return score;
}

function calculateIncompletenessScore(evidence: EvidenceBundle): number {
  let score = 0;

  // Inferred quote type suggests missing guidance
  if (evidence.carrierQuoteType === 'inferred') {
    score += 2;
  }

  // Has citations but they don't cover the issue
  if (evidence.hasCitation && evidence.citedSources.length > 0) {
    // Guidance exists but is incomplete
    score += 1;
  }

  return score;
}
```

### 4.4 ExecutionNoncompliance Detection

**File:** `src/attribution/noncompliance-checker.ts`

```typescript
import type { EvidenceBundle, ExecutionNoncompliance, NoncomplianceCause } from '../schemas';

interface NoncomplianceCheckResult {
  isNoncompliance: boolean;
  noncompliance?: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>;
}

/**
 * Before creating a Pattern with failureMode='incomplete' or 'missing_reference',
 * search the full Context Pack and Spec for the allegedly missing guidance.
 */
export async function checkForNoncompliance(params: {
  evidence: EvidenceBundle;
  resolvedFailureMode: string;
  contextPack: string;
  spec: string;
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
  };
}): Promise<NoncomplianceCheckResult> {
  // Only check for incomplete/missing_reference failure modes
  if (params.resolvedFailureMode !== 'incomplete' &&
      params.resolvedFailureMode !== 'missing_reference') {
    return { isNoncompliance: false };
  }

  // Extract keywords from the finding
  const keywords = extractKeywords(params.finding.title, params.finding.description);

  // Search both documents
  const contextPackMatch = searchDocument(params.contextPack, keywords);
  const specMatch = searchDocument(params.spec, keywords);

  if (contextPackMatch || specMatch) {
    // Guidance exists! This is execution noncompliance, not a pattern.
    const match = contextPackMatch || specMatch;
    const causes = analyzePossibleCauses(match!, params.evidence);

    return {
      isNoncompliance: true,
      noncompliance: {
        findingId: params.finding.id,
        issueId: params.finding.issueId,
        prNumber: params.finding.prNumber,
        violatedGuidanceStage: contextPackMatch ? 'context-pack' : 'spec',
        violatedGuidanceLocation: match!.location,
        violatedGuidanceExcerpt: match!.excerpt,
        possibleCauses: causes
      }
    };
  }

  return { isNoncompliance: false };
}

interface DocumentMatch {
  location: string;
  excerpt: string;
  relevanceScore: number;
}

function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();

  // Extract meaningful keywords (skip common words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'can', 'and', 'but',
    'or', 'if', 'this', 'that', 'these', 'those', 'it', 'its']);

  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

function searchDocument(doc: string, keywords: string[]): DocumentMatch | null {
  const lines = doc.split('\n');
  let bestMatch: DocumentMatch | null = null;
  let bestScore = 0;

  // Sliding window search (5 lines at a time)
  for (let i = 0; i < lines.length - 4; i++) {
    const window = lines.slice(i, i + 5).join('\n').toLowerCase();
    const score = keywords.reduce((sum, kw) =>
      sum + (window.includes(kw) ? 1 : 0), 0);

    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = {
        location: `Lines ${i + 1}-${i + 5}`,
        excerpt: lines.slice(i, i + 5).join('\n').slice(0, 500),
        relevanceScore: score / keywords.length
      };
    }
  }

  // Require at least 30% keyword match
  if (bestMatch && bestMatch.relevanceScore < 0.3) {
    return null;
  }

  return bestMatch;
}

function analyzePossibleCauses(
  match: DocumentMatch,
  evidence: EvidenceBundle
): NoncomplianceCause[] {
  const causes: NoncomplianceCause[] = [];

  // If the guidance was in a different section than where attribution looked
  if (evidence.carrierLocation !== match.location) {
    causes.push('salience'); // Not prominent enough
  }

  // NOTE: 'ambiguity' was removed from NoncomplianceCause in v1.0
  // If guidance was ambiguous, that's a guidance problem (Pattern with failureMode='ambiguous')
  // not an execution problem. See spec Section 2.4 note.

  // Default to formatting if no other cause identified
  if (causes.length === 0) {
    causes.push('formatting');
  }

  return causes;
}
```

### 4.5 Attribution Orchestrator

**File:** `src/attribution/orchestrator.ts`

```typescript
import type {
  PatternDefinition,
  PatternOccurrence,
  ExecutionNoncompliance,
  DocUpdateRequest,
  EvidenceBundle,
  DocFingerprint
} from '../schemas';
import { resolveFailureMode } from './failure-mode-resolver';
import { checkForNoncompliance } from './noncompliance-checker';
import { runAttributionAgent } from './agent';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo';
import { DocUpdateRequestRepository } from '../storage/repositories/doc-update-request.repo';

interface AttributionInput {
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
    scoutType: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: {
    content: string;
    fingerprint: DocFingerprint;
  };
  spec: {
    content: string;
    fingerprint: DocFingerprint;
  };
}

interface AttributionResult {
  type: 'pattern' | 'noncompliance' | 'doc_update_only';
  pattern?: PatternDefinition;
  occurrence?: PatternOccurrence;
  noncompliance?: ExecutionNoncompliance;
  docUpdateRequest?: DocUpdateRequest;
}

export class AttributionOrchestrator {
  constructor(
    private patternRepo: PatternDefinitionRepository,
    private occurrenceRepo: PatternOccurrenceRepository,
    private noncomplianceRepo: ExecutionNoncomplianceRepository,
    private docUpdateRepo: DocUpdateRequestRepository
  ) {}

  async attributeFinding(input: AttributionInput): Promise<AttributionResult> {
    // Step 1: Run Attribution Agent to extract evidence
    const evidence = await runAttributionAgent({
      finding: input.finding,
      contextPack: input.contextPack.content,
      spec: input.spec.content
    });

    // Step 2: Resolve failureMode deterministically
    const { failureMode, confidenceModifier, flags } = resolveFailureMode(evidence);

    // Step 3: Check for ExecutionNoncompliance before creating pattern
    const noncomplianceCheck = await checkForNoncompliance({
      evidence,
      resolvedFailureMode: failureMode,
      contextPack: input.contextPack.content,
      spec: input.spec.content,
      finding: input.finding
    });

    if (noncomplianceCheck.isNoncompliance) {
      // Don't create pattern - this is execution noncompliance
      const noncompliance = this.noncomplianceRepo.create(noncomplianceCheck.noncompliance!);
      return { type: 'noncompliance', noncompliance };
    }

    // Step 4: Handle Decisions findings specially
    if (input.finding.scoutType === 'decisions') {
      return this.handleDecisionsFinding(input, evidence, failureMode);
    }

    // Step 5: Create or update pattern
    const { pattern, occurrence } = await this.createPatternAndOccurrence(
      input, evidence, failureMode, confidenceModifier, flags
    );

    return { type: 'pattern', pattern, occurrence };
  }

  private async handleDecisionsFinding(
    input: AttributionInput,
    evidence: EvidenceBundle,
    failureMode: string
  ): Promise<AttributionResult> {
    // Decisions findings always create DocUpdateRequest
    const docUpdateRequest = this.docUpdateRepo.create({
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      findingCategory: 'compliance',
      scoutType: 'decisions',
      targetDoc: this.inferTargetDoc(evidence),
      updateType: 'add_decision',
      description: input.finding.description,
      status: 'pending'
    });

    // Only create pattern if recurring (3+) or high-risk
    const shouldCreatePattern = await this.shouldCreatePatternForDecision(
      evidence,
      input.finding.severity
    );

    if (!shouldCreatePattern) {
      return { type: 'doc_update_only', docUpdateRequest };
    }

    // Create pattern as well
    const { pattern, occurrence } = await this.createPatternAndOccurrence(
      input, evidence, failureMode, 0, { suspectedSynthesisDrift: false }
    );

    return { type: 'pattern', pattern, occurrence, docUpdateRequest };
  }

  private async createPatternAndOccurrence(
    input: AttributionInput,
    evidence: EvidenceBundle,
    failureMode: string,
    confidenceModifier: number,
    flags: { suspectedSynthesisDrift: boolean }
  ): Promise<{ pattern: PatternDefinition; occurrence: PatternOccurrence }> {
    // Check for existing pattern with same content
    const patternContent = evidence.carrierQuote;
    const existingPattern = this.patternRepo.findByContentHash(
      require('crypto').createHash('sha256').update(patternContent).digest('hex')
    );

    let pattern: PatternDefinition;
    if (existingPattern) {
      pattern = existingPattern;
      // Update primaryCarrierQuoteType if this evidence is better
      if (this.isBetterEvidence(evidence.carrierQuoteType, existingPattern.primaryCarrierQuoteType)) {
        pattern = this.patternRepo.update(pattern.id, {
          primaryCarrierQuoteType: evidence.carrierQuoteType
        })!;
      }
    } else {
      pattern = this.patternRepo.create({
        patternContent,
        failureMode: failureMode as PatternDefinition['failureMode'],
        findingCategory: this.mapScoutToCategory(input.finding.scoutType),
        severity: input.finding.severity,
        alternative: this.generateAlternative(evidence, failureMode),
        carrierStage: evidence.carrierStage,
        primaryCarrierQuoteType: evidence.carrierQuoteType,
        technologies: this.extractTechnologies(input),
        taskTypes: this.extractTaskTypes(input),
        touches: this.extractTouches(input),
        status: 'active',
        permanent: false
      });
    }

    // Create occurrence
    const occurrence = this.occurrenceRepo.create({
      patternId: pattern.id,
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      prNumber: input.finding.prNumber,
      evidence,
      carrierFingerprint: evidence.carrierStage === 'context-pack'
        ? input.contextPack.fingerprint
        : input.spec.fingerprint,
      originFingerprint: evidence.hasCitation && evidence.citedSources.length > 0
        ? this.resolveSourceFingerprint(evidence.citedSources[0])
        : undefined,
      provenanceChain: this.buildProvenanceChain(evidence, input),
      wasInjected: false, // Will be updated by injection tracking
      wasAdheredTo: null,
      status: 'active'
    });

    return { pattern, occurrence };
  }

  private isBetterEvidence(
    newType: 'verbatim' | 'paraphrase' | 'inferred',
    existingType: 'verbatim' | 'paraphrase' | 'inferred'
  ): boolean {
    const rank = { verbatim: 3, paraphrase: 2, inferred: 1 };
    return rank[newType] > rank[existingType];
  }

  private mapScoutToCategory(scoutType: string): PatternDefinition['findingCategory'] {
    const mapping: Record<string, PatternDefinition['findingCategory']> = {
      adversarial: 'security',
      security: 'security',
      bugs: 'correctness',
      tests: 'testing',
      docs: 'compliance',
      spec: 'compliance',
      decisions: 'compliance'
    };
    return mapping[scoutType] || 'correctness';
  }

  private generateAlternative(evidence: EvidenceBundle, failureMode: string): string {
    // This would be enhanced with LLM in production
    // For now, generate based on failure mode
    switch (failureMode) {
      case 'incorrect':
        return `Do NOT: "${evidence.carrierQuote.slice(0, 50)}..." Instead, follow security best practices.`;
      case 'incomplete':
        return 'Ensure all edge cases and security considerations are explicitly addressed.';
      case 'missing_reference':
        return `Reference ${evidence.missingDocId || 'the relevant documentation'} before proceeding.`;
      case 'ambiguous':
        return 'Clarify requirements with specific, testable acceptance criteria.';
      case 'conflict_unresolved':
        return 'Resolve conflicting guidance before implementation.';
      case 'synthesis_drift':
        return 'Verify that synthesized guidance accurately reflects source documentation.';
      default:
        return 'Review and improve guidance clarity.';
    }
  }

  private extractTechnologies(input: AttributionInput): string[] {
    // Extract from finding evidence and location
    const text = `${input.finding.evidence} ${input.finding.location.file}`.toLowerCase();
    const techs: string[] = [];

    if (text.includes('sql') || text.includes('query')) techs.push('sql');
    if (text.includes('postgres')) techs.push('postgres');
    if (text.includes('redis')) techs.push('redis');
    if (text.includes('mongodb') || text.includes('mongo')) techs.push('mongodb');
    if (text.includes('graphql')) techs.push('graphql');
    if (text.includes('rest')) techs.push('rest');

    return techs;
  }

  private extractTaskTypes(input: AttributionInput): string[] {
    const text = `${input.finding.description} ${input.finding.location.file}`.toLowerCase();
    const types: string[] = [];

    if (text.includes('api') || text.includes('endpoint')) types.push('api');
    if (text.includes('database') || text.includes('query')) types.push('database');
    if (text.includes('migration')) types.push('migration');
    if (text.includes('auth')) types.push('auth');

    return types;
  }

  private extractTouches(input: AttributionInput): PatternDefinition['touches'] {
    const text = `${input.finding.description} ${input.finding.evidence}`.toLowerCase();
    const touches: PatternDefinition['touches'] = [];

    if (text.includes('user input') || text.includes('user-provided') ||
        text.includes('request body') || text.includes('query param')) {
      touches.push('user_input');
    }
    if (text.includes('database') || text.includes('sql') || text.includes('query')) {
      touches.push('database');
    }
    if (text.includes('network') || text.includes('http') || text.includes('api call')) {
      touches.push('network');
    }
    if (text.includes('auth')) touches.push('auth');
    if (text.includes('permission') || text.includes('authz')) touches.push('authz');
    if (text.includes('cache')) touches.push('caching');
    if (text.includes('schema') || text.includes('migration')) touches.push('schema');
    if (text.includes('log')) touches.push('logging');
    if (text.includes('config')) touches.push('config');
    if (text.includes('api') || text.includes('endpoint')) touches.push('api');

    return touches.length > 0 ? touches : ['api']; // Default
  }

  private inferTargetDoc(evidence: EvidenceBundle): string {
    // Infer which doc needs updating based on evidence
    if (evidence.missingDocId) return evidence.missingDocId;
    if (evidence.carrierStage === 'context-pack') return 'ARCHITECTURE.md';
    return 'DECISIONS.md';
  }

  private async shouldCreatePatternForDecision(
    evidence: EvidenceBundle,
    severity: string
  ): Promise<boolean> {
    // High-risk decisions always create patterns
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      return true;
    }

    // Check for recurrence (3+ similar findings)
    // This would query existing patterns for similarity
    // Simplified for now
    return false;
  }

  private resolveSourceFingerprint(source: string): DocFingerprint | undefined {
    // Resolve source string to DocFingerprint
    if (source.endsWith('.md')) {
      return {
        kind: 'git',
        repo: 'current',
        path: source,
        commitSha: 'HEAD' // Would resolve to actual commit
      };
    }
    return undefined;
  }

  private buildProvenanceChain(
    evidence: EvidenceBundle,
    input: AttributionInput
  ): DocFingerprint[] {
    const chain: DocFingerprint[] = [];

    // Add carrier
    chain.push(
      evidence.carrierStage === 'context-pack'
        ? input.contextPack.fingerprint
        : input.spec.fingerprint
    );

    // Add cited sources
    for (const source of evidence.citedSources) {
      const fp = this.resolveSourceFingerprint(source);
      if (fp) chain.push(fp);
    }

    return chain;
  }
}
```

---

## 5. Phase 3: Injection System

### 5.1 Deliverables

| Deliverable | Description | Est. Complexity |
|-------------|-------------|-----------------|
| `src/injection/task-profile-extractor.ts` | TaskProfile extraction from issue | Medium |
| `src/injection/selector.ts` | Tiered pattern selection | High |
| `src/injection/formatter.ts` | Warning markdown generation | Low |
| `src/injection/confidence.ts` | Confidence/priority calculation | Medium |
| `tests/injection/` | Injection system tests | High |

### 5.2 TaskProfile Extraction

**File:** `src/injection/task-profile-extractor.ts`

```typescript
import type { TaskProfile, Touch } from '../schemas';

interface IssueData {
  title: string;
  description: string;
  labels: string[];
}

/**
 * Extract TaskProfile from Linear issue data.
 * Used for preliminary injection before Context Pack exists.
 */
export function extractTaskProfileFromIssue(issue: IssueData): TaskProfile {
  const text = `${issue.title} ${issue.description}`.toLowerCase();
  const labels = issue.labels.map(l => l.toLowerCase());

  const touches = extractTouches(text, labels);
  const technologies = extractTechnologies(text, labels);
  const taskTypes = extractTaskTypes(text, labels);

  // Confidence based on how much we could extract
  const confidence = calculateConfidence(touches, technologies, taskTypes);

  return {
    touches,
    technologies,
    taskTypes,
    confidence
  };
}

function extractTouches(text: string, labels: string[]): Touch[] {
  const touches: Touch[] = [];
  const combined = `${text} ${labels.join(' ')}`;

  const touchPatterns: [RegExp, Touch][] = [
    [/\b(user.?input|form|request.?body|query.?param|payload)\b/i, 'user_input'],
    [/\b(database|sql|query|postgres|mysql|mongo|db)\b/i, 'database'],
    [/\b(network|http|api.?call|fetch|request|external.?service)\b/i, 'network'],
    [/\b(auth|login|session|token|jwt|oauth)\b/i, 'auth'],
    [/\b(permission|role|access.?control|rbac|authz)\b/i, 'authz'],
    [/\b(cache|redis|memcache|caching)\b/i, 'caching'],
    [/\b(schema|migration|alter|ddl)\b/i, 'schema'],
    [/\b(log|logging|trace|audit)\b/i, 'logging'],
    [/\b(config|env|environment|setting)\b/i, 'config'],
    [/\b(api|endpoint|route|rest|graphql)\b/i, 'api']
  ];

  for (const [pattern, touch] of touchPatterns) {
    if (pattern.test(combined) && !touches.includes(touch)) {
      touches.push(touch);
    }
  }

  return touches;
}

function extractTechnologies(text: string, labels: string[]): string[] {
  const techs: string[] = [];
  const combined = `${text} ${labels.join(' ')}`;

  const techPatterns: [RegExp, string][] = [
    [/\bpostgres(ql)?\b/i, 'postgres'],
    [/\bmysql\b/i, 'mysql'],
    [/\bmongo(db)?\b/i, 'mongodb'],
    [/\bredis\b/i, 'redis'],
    [/\bsql\b/i, 'sql'],
    [/\bgraphql\b/i, 'graphql'],
    [/\brest\b/i, 'rest'],
    [/\bgrpc\b/i, 'grpc'],
    [/\bwebsocket\b/i, 'websocket'],
    [/\breact\b/i, 'react'],
    [/\bnode(js)?\b/i, 'nodejs'],
    [/\btypescript\b/i, 'typescript']
  ];

  for (const [pattern, tech] of techPatterns) {
    if (pattern.test(combined) && !techs.includes(tech)) {
      techs.push(tech);
    }
  }

  return techs;
}

function extractTaskTypes(text: string, labels: string[]): string[] {
  const types: string[] = [];
  const combined = `${text} ${labels.join(' ')}`;

  const typePatterns: [RegExp, string][] = [
    [/\b(api|endpoint|route)\b/i, 'api'],
    [/\b(database|query|data.?layer)\b/i, 'database'],
    [/\b(migration|schema.?change)\b/i, 'migration'],
    [/\b(ui|frontend|component|page)\b/i, 'ui'],
    [/\b(auth|login|signup)\b/i, 'auth'],
    [/\b(background|job|worker|queue)\b/i, 'background-job'],
    [/\b(test|testing|spec)\b/i, 'testing'],
    [/\b(refactor|cleanup|tech.?debt)\b/i, 'refactor'],
    [/\b(bug|fix|issue)\b/i, 'bugfix'],
    [/\b(feature|new)\b/i, 'feature']
  ];

  for (const [pattern, type] of typePatterns) {
    if (pattern.test(combined) && !types.includes(type)) {
      types.push(type);
    }
  }

  return types;
}

function calculateConfidence(
  touches: Touch[],
  technologies: string[],
  taskTypes: string[]
): number {
  // Base confidence
  let confidence = 0.3;

  // More extracted info = higher confidence
  if (touches.length > 0) confidence += 0.2;
  if (touches.length > 2) confidence += 0.1;
  if (technologies.length > 0) confidence += 0.15;
  if (taskTypes.length > 0) confidence += 0.15;
  if (taskTypes.length > 1) confidence += 0.1;

  return Math.min(confidence, 1.0);
}
```

### 5.3 Tiered Pattern Selector

**File:** `src/injection/selector.ts`

```typescript
import type { PatternDefinition, DerivedPrinciple, TaskProfile, Touch } from '../schemas';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { computeInjectionPriority, computePatternStats } from './confidence';

interface InjectedWarning {
  type: 'pattern' | 'principle';
  id: string;
  priority: number;
  content: PatternDefinition | DerivedPrinciple;
}

/**
 * Select warnings for injection using tiered algorithm.
 * See Spec Section 5.1.
 */
export async function selectWarningsForInjection(
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  maxTotal: number = 6,
  patternRepo: PatternDefinitionRepository,
  principleRepo: DerivedPrincipleRepository
): Promise<InjectedWarning[]> {
  const selected: InjectedWarning[] = [];

  // STEP 1: Select baseline principles (max 2)
  const eligiblePrinciples = principleRepo.findActive({
    origin: 'baseline',
    injectInto: target === 'both' ? undefined : target,
    touches: taskProfile.touches
  });

  const selectedPrinciples = eligiblePrinciples
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, taskProfile.confidence < 0.5 ? 3 : 2); // Extra principle if low confidence

  for (const principle of selectedPrinciples) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle
    });
  }

  // STEP 2: Select learned patterns
  const eligiblePatterns = patternRepo.findActive({
    carrierStage: target
  }).filter(p => matchesTaskProfile(p, taskProfile));

  // Apply inferred gate
  const gatedPatterns = eligiblePatterns.filter(p => meetsInferredGate(p, patternRepo));

  // Compute injection priority for each
  const patternsWithPriority = gatedPatterns.map(p => ({
    pattern: p,
    priority: computeInjectionPriority(p, taskProfile, patternRepo)
  }));

  // STEP 3: Select with security priority
  const securityPatterns = patternsWithPriority
    .filter(({ pattern }) => pattern.findingCategory === 'security')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  for (const { pattern, priority } of securityPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern
    });
  }

  // Remaining slots for non-security patterns
  const remainingSlots = maxTotal - selected.length;
  const otherPatterns = patternsWithPriority
    .filter(({ pattern }) => pattern.findingCategory !== 'security')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, remainingSlots);

  for (const { pattern, priority } of otherPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern
    });
  }

  // STEP 4: Low-confidence fallback
  if (taskProfile.confidence < 0.5 && selected.length < maxTotal) {
    const globalHighSeverity = patternRepo.findActive()
      .filter(p => p.severity === 'CRITICAL' || p.severity === 'HIGH')
      .sort((a, b) => {
        const statsA = computePatternStats(a.id, patternRepo);
        const statsB = computePatternStats(b.id, patternRepo);
        return statsB.activeOccurrences - statsA.activeOccurrences;
      })
      .slice(0, 2);

    for (const pattern of globalHighSeverity) {
      if (!selected.find(s => s.id === pattern.id)) {
        selected.push({
          type: 'pattern',
          id: pattern.id,
          priority: 0.5, // Lower priority for global patterns
          content: pattern
        });
        if (selected.length >= maxTotal) break;
      }
    }
  }

  return selected;
}

function matchesTaskProfile(pattern: PatternDefinition, taskProfile: TaskProfile): boolean {
  // Match if any of touches, technologies, or taskTypes overlap
  const touchOverlap = pattern.touches.some(t => taskProfile.touches.includes(t));
  const techOverlap = pattern.technologies.some(t => taskProfile.technologies.includes(t));
  const typeOverlap = pattern.taskTypes.some(t => taskProfile.taskTypes.includes(t));

  return touchOverlap || techOverlap || typeOverlap;
}

function meetsInferredGate(
  pattern: PatternDefinition,
  patternRepo: PatternDefinitionRepository
): boolean {
  // Non-inferred patterns always pass
  if (pattern.primaryCarrierQuoteType !== 'inferred') {
    return true;
  }

  // Inferred patterns need: 2+ occurrences OR (high severity + baseline alignment) OR missing_reference
  const stats = computePatternStats(pattern.id, patternRepo);

  if (stats.activeOccurrences >= 2) return true;
  if ((pattern.severity === 'HIGH' || pattern.severity === 'CRITICAL') &&
      pattern.alignedBaselineId) return true;
  if (pattern.failureMode === 'missing_reference') return true;

  return false;
}
```

### 5.4 Confidence and Priority Calculation

**File:** `src/injection/confidence.ts`

```typescript
import type { PatternDefinition, TaskProfile, Touch } from '../schemas';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';

export interface PatternStats {
  totalOccurrences: number;
  activeOccurrences: number;
  lastSeenActive: string | null;
  injectionCount: number;
  adherenceRate: number | null;
}

/**
 * Compute statistics for a pattern (never stored, always computed).
 */
export function computePatternStats(
  patternId: string,
  patternRepo: PatternDefinitionRepository,
  occurrenceRepo?: PatternOccurrenceRepository
): PatternStats {
  // This would query occurrences in real implementation
  // Simplified for now
  return {
    totalOccurrences: 1,
    activeOccurrences: 1,
    lastSeenActive: new Date().toISOString(),
    injectionCount: 0,
    adherenceRate: null
  };
}

/**
 * Compute attribution confidence for a pattern.
 * See Spec Section 4.1.
 */
export function computeAttributionConfidence(
  pattern: PatternDefinition,
  stats: PatternStats,
  flags?: { suspectedSynthesisDrift?: boolean }
): number {
  // Evidence quality base
  let confidence: number;
  switch (pattern.primaryCarrierQuoteType) {
    case 'verbatim':
      confidence = 0.75;
      break;
    case 'paraphrase':
      confidence = 0.55;
      break;
    case 'inferred':
      confidence = 0.40;
      break;
  }

  // Occurrence boost (max 0.25 at 6+ occurrences)
  const occurrenceBoost = Math.min((stats.activeOccurrences - 1), 5) * 0.05;
  confidence += occurrenceBoost;

  // Decay penalty (only if not permanent)
  if (!pattern.permanent && stats.lastSeenActive) {
    const daysSince = daysSinceDate(stats.lastSeenActive);
    const decayPenalty = Math.min(daysSince / 90, 1.0) * 0.15;
    confidence -= decayPenalty;
  }

  // Confidence modifiers
  if (flags?.suspectedSynthesisDrift) {
    confidence -= 0.15;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Compute injection priority for a pattern.
 * See Spec Section 4.2.
 */
export function computeInjectionPriority(
  pattern: PatternDefinition,
  taskProfile: TaskProfile,
  patternRepo: PatternDefinitionRepository
): number {
  const stats = computePatternStats(pattern.id, patternRepo);
  const attributionConfidence = computeAttributionConfidence(pattern, stats);

  // Severity weight
  const severityWeight: Record<string, number> = {
    CRITICAL: 1.0,
    HIGH: 0.9,
    MEDIUM: 0.7,
    LOW: 0.5
  };

  // Relevance weight
  const touchOverlaps = pattern.touches.filter(t =>
    taskProfile.touches.includes(t as Touch)
  ).length;
  const techOverlaps = pattern.technologies.filter(t =>
    taskProfile.technologies.includes(t)
  ).length;
  const relevanceWeight = Math.min(1.0 + 0.1 * touchOverlaps + 0.1 * techOverlaps, 1.5);

  // Recency weight
  const recencyWeight = stats.lastSeenActive
    ? computeRecencyWeight(stats.lastSeenActive)
    : 0.8;

  return attributionConfidence
    * severityWeight[pattern.severity]
    * relevanceWeight
    * recencyWeight;
}

function computeRecencyWeight(lastSeen: string): number {
  const days = daysSinceDate(lastSeen);
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.95;
  if (days <= 90) return 0.9;
  return 0.8;
}

function daysSinceDate(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
```

### 5.5 Warning Formatter

**File:** `src/injection/formatter.ts`

```typescript
import type { PatternDefinition, DerivedPrinciple } from '../schemas';

interface InjectedWarning {
  type: 'pattern' | 'principle';
  id: string;
  priority: number;
  content: PatternDefinition | DerivedPrinciple;
}

/**
 * Format warnings for injection into agent prompts.
 * See Spec Section 5.2.
 */
export function formatWarningsForInjection(warnings: InjectedWarning[]): string {
  if (warnings.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Warnings from Past Issues (auto-generated)',
    ''
  ];

  for (const warning of warnings) {
    if (warning.type === 'pattern') {
      lines.push(formatPattern(warning.content as PatternDefinition));
    } else {
      lines.push(formatPrinciple(warning.content as DerivedPrinciple));
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatPattern(pattern: PatternDefinition): string {
  const categoryUpper = pattern.findingCategory.toUpperCase();
  const failureModeFormatted = pattern.failureMode.replace('_', ' ');

  const lines = [
    `### [${categoryUpper}][${failureModeFormatted}][${pattern.severity}] ${truncate(pattern.patternContent, 50)}`,
    `**Bad guidance:** "${pattern.patternContent}"`,
    `**Observed result:** ${pattern.findingCategory} issue.`,
    `**Do instead:** ${pattern.alternative}`,
    `**Applies when:** touches=${pattern.touches.join(',')}${pattern.technologies.length > 0 ? `; tech=${pattern.technologies.join(',')}` : ''}`
  ];

  if (pattern.consequenceClass) {
    lines.push(`**Reference:** ${pattern.consequenceClass}`);
  }

  return lines.join('\n');
}

function formatPrinciple(principle: DerivedPrinciple): string {
  const lines = [
    `### [BASELINE] ${truncate(principle.principle, 50)}`,
    `**Principle:** ${principle.principle}`,
    `**Rationale:** ${principle.rationale}`,
    `**Applies when:** touches=${principle.touches.join(',')}`
  ];

  if (principle.externalRefs?.length) {
    lines.push(`**Reference:** ${principle.externalRefs.join(', ')}`);
  }

  return lines.join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
```

---

## 6. Phase 4: Integration & Workflow

### 6.1 Deliverables

| Deliverable | Description | Est. Complexity |
|-------------|-------------|-----------------|
| `src/workflow/pr-review-hook.ts` | PR Review → Attribution trigger | Medium |
| `src/workflow/context-pack-hook.ts` | Context Pack injection | Medium |
| `src/workflow/spec-hook.ts` | Spec agent injection | Medium |
| `src/workflow/injection-log-tracker.ts` | InjectionLog management | Low |
| `tests/workflow/` | End-to-end workflow tests | High |

### 6.2 PR Review Hook

**File:** `src/workflow/pr-review-hook.ts`

```typescript
import type { Database } from 'better-sqlite3';
import { AttributionOrchestrator } from '../attribution/orchestrator';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo';
import { DocUpdateRequestRepository } from '../storage/repositories/doc-update-request.repo';

interface PRReviewResult {
  prNumber: number;
  issueId: string;
  verdict: 'PASS' | 'FAIL';
  confirmedFindings: ConfirmedFinding[];
}

interface ConfirmedFinding {
  id: string;
  scoutType: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string;
  location: { file: string; line?: number };
}

/**
 * Hook called after PR Review completes.
 * Triggers attribution for all confirmed findings.
 */
export async function onPRReviewComplete(
  db: Database,
  result: PRReviewResult,
  contextPack: { content: string; path: string; commitSha: string },
  spec: { content: string; path: string; commitSha: string }
): Promise<void> {
  // Initialize repositories
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const noncomplianceRepo = new ExecutionNoncomplianceRepository(db);
  const docUpdateRepo = new DocUpdateRequestRepository(db);

  // Initialize orchestrator
  const orchestrator = new AttributionOrchestrator(
    patternRepo,
    occurrenceRepo,
    noncomplianceRepo,
    docUpdateRepo
  );

  // Process each confirmed finding
  for (const finding of result.confirmedFindings) {
    try {
      const attributionResult = await orchestrator.attributeFinding({
        finding: {
          ...finding,
          issueId: result.issueId,
          prNumber: result.prNumber
        },
        contextPack: {
          content: contextPack.content,
          fingerprint: {
            kind: 'git',
            repo: 'current',
            path: contextPack.path,
            commitSha: contextPack.commitSha
          }
        },
        spec: {
          content: spec.content,
          fingerprint: {
            kind: 'git',
            repo: 'current',
            path: spec.path,
            commitSha: spec.commitSha
          }
        }
      });

      console.log(`Attribution for finding ${finding.id}: ${attributionResult.type}`);
    } catch (error) {
      console.error(`Failed to attribute finding ${finding.id}:`, error);
    }
  }

  // Update InjectionLog adherence tracking
  await updateAdherenceTracking(db, result);
}

async function updateAdherenceTracking(
  db: Database,
  result: PRReviewResult
): Promise<void> {
  // Find InjectionLog for this issue
  const injectionLogRepo = new InjectionLogRepository(db);
  const logs = injectionLogRepo.findByIssueId(result.issueId);

  for (const log of logs) {
    // For each injected pattern, check if there's a finding
    for (const patternId of log.injectedPatterns) {
      const occurrenceRepo = new PatternOccurrenceRepository(db);
      const occurrence = occurrenceRepo.findByPatternAndIssue(patternId, result.issueId);

      if (occurrence) {
        // Pattern was injected but finding still occurred - not adhered to
        occurrenceRepo.update(occurrence.id, {
          wasInjected: true,
          wasAdheredTo: false
        });
      }
      // If no occurrence, pattern was adhered to (no finding for this pattern)
    }
  }
}
```

### 6.3 Context Pack Hook

**File:** `src/workflow/context-pack-hook.ts`

```typescript
import type { Database } from 'better-sqlite3';
import { extractTaskProfileFromIssue } from '../injection/task-profile-extractor';
import { selectWarningsForInjection } from '../injection/selector';
import { formatWarningsForInjection } from '../injection/formatter';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { v4 as uuidv4 } from 'uuid';

interface IssueData {
  id: string;
  title: string;
  description: string;
  labels: string[];
}

/**
 * Hook called before Context Pack agent runs.
 * Returns warnings to inject into the agent prompt.
 */
export async function beforeContextPackAgent(
  db: Database,
  issue: IssueData
): Promise<{ warningsMarkdown: string; taskProfile: TaskProfile }> {
  // Extract preliminary taskProfile from issue
  const taskProfile = extractTaskProfileFromIssue({
    title: issue.title,
    description: issue.description,
    labels: issue.labels
  });

  // Initialize repositories
  const patternRepo = new PatternDefinitionRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const injectionLogRepo = new InjectionLogRepository(db);

  // Select warnings
  const warnings = await selectWarningsForInjection(
    'context-pack',
    taskProfile,
    6,
    patternRepo,
    principleRepo
  );

  // Format for injection
  const warningsMarkdown = formatWarningsForInjection(warnings);

  // Log injection
  injectionLogRepo.create({
    id: uuidv4(),
    issueId: issue.id,
    target: 'context-pack',
    injectedPatterns: warnings.filter(w => w.type === 'pattern').map(w => w.id),
    injectedPrinciples: warnings.filter(w => w.type === 'principle').map(w => w.id),
    taskProfile,
    injectedAt: new Date().toISOString()
  });

  return { warningsMarkdown, taskProfile };
}
```

### 6.4 Spec Agent Hook

**File:** `src/workflow/spec-hook.ts`

```typescript
import type { Database } from 'better-sqlite3';
import type { TaskProfile } from '../schemas';
import { selectWarningsForInjection } from '../injection/selector';
import { formatWarningsForInjection } from '../injection/formatter';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { v4 as uuidv4 } from 'uuid';

interface ContextPackMetadata {
  issueId: string;
  taskProfile: TaskProfile;
}

/**
 * Hook called before Spec agent runs.
 * Uses the refined taskProfile from Context Pack metadata.
 */
export async function beforeSpecAgent(
  db: Database,
  metadata: ContextPackMetadata
): Promise<string> {
  // Initialize repositories
  const patternRepo = new PatternDefinitionRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const injectionLogRepo = new InjectionLogRepository(db);

  // Use refined taskProfile from Context Pack
  const warnings = await selectWarningsForInjection(
    'spec',
    metadata.taskProfile,
    6,
    patternRepo,
    principleRepo
  );

  // Format for injection
  const warningsMarkdown = formatWarningsForInjection(warnings);

  // Log injection
  injectionLogRepo.create({
    id: uuidv4(),
    issueId: metadata.issueId,
    target: 'spec',
    injectedPatterns: warnings.filter(w => w.type === 'pattern').map(w => w.id),
    injectedPrinciples: warnings.filter(w => w.type === 'principle').map(w => w.id),
    taskProfile: metadata.taskProfile,
    injectedAt: new Date().toISOString()
  });

  return warningsMarkdown;
}
```

---

## 7. Phase 5: Monitoring & Evolution

### 7.1 Deliverables

| Deliverable | Description | Est. Complexity |
|-------------|-------------|-----------------|
| `src/evolution/adherence-tracker.ts` | Track wasAdheredTo after reviews | Medium |
| `src/evolution/tagging-miss-detector.ts` | Detect filter misses | Medium |
| `src/evolution/doc-change-watcher.ts` | Invalidate on doc changes | Medium |
| `src/evolution/decay-processor.ts` | Apply confidence decay | Low |
| `src/metrics/dashboard.ts` | Metrics collection | Medium |

### 7.2 Source Doc Change Detection

**File:** `src/evolution/doc-change-watcher.ts`

```typescript
import type { Database } from 'better-sqlite3';
import { createHash } from 'crypto';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';

interface DocChange {
  path: string;
  oldCommitSha: string;
  newCommitSha: string;
  newContent: string;
}

/**
 * Handle document changes and invalidate affected occurrences.
 * See Spec Section 7.2.
 */
export async function onDocumentChange(
  db: Database,
  change: DocChange
): Promise<{ invalidatedOccurrences: number; affectedPatterns: string[] }> {
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  // Find occurrences citing this document
  const affectedOccurrences = occurrenceRepo.findByDocPath(change.path);

  let invalidatedCount = 0;
  const affectedPatternIds = new Set<string>();

  for (const occurrence of affectedOccurrences) {
    // Check if the specific cited section changed
    const sectionChanged = await checkSectionChanged(
      occurrence,
      change.newContent
    );

    if (sectionChanged) {
      // Invalidate occurrence
      occurrenceRepo.update(occurrence.id, {
        status: 'inactive',
        inactiveReason: 'superseded_doc'
      });
      invalidatedCount++;
      affectedPatternIds.add(occurrence.patternId);
    }
  }

  // Recompute stats for affected patterns
  for (const patternId of affectedPatternIds) {
    const stats = computePatternStats(patternId, patternRepo, occurrenceRepo);

    // Archive pattern if no active occurrences remain
    const pattern = patternRepo.findById(patternId);
    if (pattern && !pattern.permanent && stats.activeOccurrences === 0) {
      patternRepo.update(patternId, { status: 'archived' });
    }
  }

  return {
    invalidatedOccurrences: invalidatedCount,
    affectedPatterns: Array.from(affectedPatternIds)
  };
}

async function checkSectionChanged(
  occurrence: PatternOccurrence,
  newContent: string
): Promise<boolean> {
  // Extract the section that was cited
  const evidence = occurrence.evidence;
  const oldQuote = evidence.carrierQuote;

  // Check if the quote still exists in the new content
  if (evidence.carrierQuoteType === 'verbatim') {
    return !newContent.includes(oldQuote);
  }

  // For paraphrase/inferred, use fuzzy matching
  // Simplified: check if the section location still exists
  const location = evidence.carrierLocation;
  const sectionMatch = newContent.match(new RegExp(location, 'i'));

  return !sectionMatch;
}
```

### 7.3 Tagging Miss Detector

**File:** `src/evolution/tagging-miss-detector.ts`

```typescript
import type { Database } from 'better-sqlite3';
import type { PatternDefinition, TaskProfile, TaggingMiss } from '../schemas';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo';
import { v4 as uuidv4 } from 'uuid';

/**
 * Check if a pattern should have been injected but wasn't due to taskProfile mismatch.
 * See Spec Section 8.
 */
export async function checkForTaggingMiss(
  db: Database,
  finding: { id: string; issueId: string },
  pattern: PatternDefinition,
  taskProfile: TaskProfile
): Promise<TaggingMiss | null> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const taggingMissRepo = new TaggingMissRepository(db);

  // Check if pattern was injected for this issue
  const logs = injectionLogRepo.findByIssueId(finding.issueId);
  const wasInjected = logs.some(log =>
    log.injectedPatterns.includes(pattern.id)
  );

  if (wasInjected) {
    // Pattern was injected - not a tagging miss
    return null;
  }

  // Check what would have been needed to match
  const requiredMatch = computeRequiredMatch(pattern, taskProfile);
  const missingTags = computeMissingTags(pattern, taskProfile);

  if (missingTags.length === 0) {
    // Pattern should have matched - might be a selection algorithm issue
    return null;
  }

  // Create tagging miss record
  const taggingMiss = taggingMissRepo.create({
    id: uuidv4(),
    findingId: finding.id,
    patternId: pattern.id,
    actualTaskProfile: taskProfile,
    requiredMatch,
    missingTags,
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  return taggingMiss;
}

function computeRequiredMatch(
  pattern: PatternDefinition,
  taskProfile: TaskProfile
): TaggingMiss['requiredMatch'] {
  return {
    touches: pattern.touches.length > 0 ? pattern.touches : undefined,
    technologies: pattern.technologies.length > 0 ? pattern.technologies : undefined,
    taskTypes: pattern.taskTypes.length > 0 ? pattern.taskTypes : undefined
  };
}

function computeMissingTags(
  pattern: PatternDefinition,
  taskProfile: TaskProfile
): string[] {
  const missing: string[] = [];

  // Check touches
  const touchOverlap = pattern.touches.some(t =>
    taskProfile.touches.includes(t)
  );
  if (!touchOverlap && pattern.touches.length > 0) {
    missing.push(...pattern.touches.map(t => `touch:${t}`));
  }

  // Check technologies
  const techOverlap = pattern.technologies.some(t =>
    taskProfile.technologies.includes(t)
  );
  if (!techOverlap && pattern.technologies.length > 0) {
    missing.push(...pattern.technologies.map(t => `tech:${t}`));
  }

  // Check taskTypes
  const typeOverlap = pattern.taskTypes.some(t =>
    taskProfile.taskTypes.includes(t)
  );
  if (!typeOverlap && pattern.taskTypes.length > 0) {
    missing.push(...pattern.taskTypes.map(t => `type:${t}`));
  }

  return missing;
}
```

---

## 8. Technical Architecture

### 8.1 Directory Structure

```
src/
├── schemas/
│   ├── index.ts              # All Zod schemas and types
│   └── validators.ts         # Custom validation helpers
│
├── storage/
│   ├── db.ts                 # Database initialization
│   ├── migrations/
│   │   └── 001_initial.sql   # Initial schema
│   └── repositories/
│       ├── pattern-definition.repo.ts
│       ├── pattern-occurrence.repo.ts
│       ├── derived-principle.repo.ts
│       ├── execution-noncompliance.repo.ts
│       ├── doc-update-request.repo.ts
│       ├── tagging-miss.repo.ts
│       └── injection-log.repo.ts
│
├── attribution/
│   ├── prompts/
│   │   └── attribution-agent.ts
│   ├── agent.ts              # Attribution Agent runner
│   ├── evidence-extractor.ts
│   ├── failure-mode-resolver.ts
│   ├── noncompliance-checker.ts
│   └── orchestrator.ts
│
├── injection/
│   ├── task-profile-extractor.ts
│   ├── selector.ts
│   ├── formatter.ts
│   └── confidence.ts
│
├── workflow/
│   ├── pr-review-hook.ts
│   ├── context-pack-hook.ts
│   ├── spec-hook.ts
│   └── injection-log-tracker.ts
│
├── evolution/
│   ├── adherence-tracker.ts
│   ├── tagging-miss-detector.ts
│   ├── doc-change-watcher.ts
│   └── decay-processor.ts
│
├── metrics/
│   └── dashboard.ts
│
└── index.ts                  # Main exports
```

### 8.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Linear Issue                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────┐                                                         │
│  │ TaskProfile     │◄─── extractTaskProfileFromIssue()                      │
│  │ Extraction      │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                                 │
│  │ Pattern/        │───►│ InjectionLog    │                                 │
│  │ Principle       │    │                 │                                 │
│  │ Selection       │    └─────────────────┘                                 │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Warning         │──────────────────────────────────────────┐              │
│  │ Formatting      │                                          │              │
│  └────────┬────────┘                                          │              │
│           │                                                   │              │
│           ▼                                                   ▼              │
│  ┌─────────────────┐                                ┌─────────────────┐      │
│  │ Context Pack    │───────────────────────────────►│ Spec Agent      │      │
│  │ Agent           │                                │                 │      │
│  └────────┬────────┘                                └────────┬────────┘      │
│           │                                                  │              │
│           ▼                                                  ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Implementation Agent                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           PR Review                                  │    │
│  └────────┬────────────────────────────────────────────────────────────┘    │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Confirmed       │                                                         │
│  │ Findings        │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ Attribution     │───►│ Pattern or      │───►│ Adherence       │          │
│  │ Agent           │    │ Noncompliance   │    │ Tracking        │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing Strategy

### 9.1 Test Categories

| Category | Coverage Target | Tools |
|----------|-----------------|-------|
| Unit Tests | 80%+ | Vitest |
| Integration Tests | Key flows | Vitest + SQLite in-memory |
| E2E Tests | Happy paths | Vitest + mock agents |

### 9.2 Key Test Scenarios

**Phase 1: Data Layer**
- Schema validation (valid/invalid data)
- Repository CRUD operations
- Deduplication by contentHash
- JSON array storage/retrieval

**Phase 2: Attribution**
- FailureMode resolver decision tree (all branches)
- ExecutionNoncompliance detection
- Evidence extraction from mock Context Pack/Spec

**Phase 3: Injection**
- TaskProfile extraction accuracy
- Tiered selection algorithm
- Inferred pattern gate
- Warning formatting

**Phase 4: Integration**
- PR Review → Attribution flow
- Context Pack injection
- Spec injection
- InjectionLog tracking

**Phase 5: Evolution**
- Doc change invalidation
- Tagging miss detection
- Confidence decay

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Attribution Agent hallucinations | Medium | Structured output validation, fallback to 'inferred' |
| SQLite performance at scale | Low | WAL mode, indexes, consider PostgreSQL for >10k patterns |
| False positive patterns | Medium | ExecutionNoncompliance check, 2+ occurrence gate for inferred |
| Token budget exceeded | Medium | Cap at 6 warnings, compress format |

### 10.2 Integration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Workflow hooks not called | High | Integration tests, monitoring |
| Linear API rate limits | Low | Caching, batch operations |
| GitHub API changes | Low | Abstract API layer |

---

## 11. Appendices

### 11.1 Reference Documents

- **Spec:** `specs/spec-pattern-attribution-v0.9.md`
- **Research:** `ai_docs/research-technologies.md`
- **say-your-harmony Analysis:** `ai_docs/say-your-harmony-deep-analysis.md`
- **PR Review Workflow:** `CORE/TASKS/WORKFLOW/PR_REVIEW.md`

### 11.2 External Resources

- [Linear API Documentation](https://linear.app/developers)
- [Zod Documentation](https://zod.dev/)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [OWASP LLM Top 10](https://genai.owasp.org/)

### 11.3 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-18 | Initial implementation plan |
