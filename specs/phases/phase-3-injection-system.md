# Phase 3: Injection System

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1 (Data Layer)
**Outputs Required By:** Phase 4 (Integration)

---

## Parallel Phase Coordination

**Phase 3 runs in parallel with Phase 2.** Both phases depend on Phase 1 and feed into Phase 4.

### Shared Interfaces (coordinate changes with Phase 2)

| Interface | Defined By | Used By | Notes |
|-----------|-----------|---------|-------|
| `PatternDefinition` | Phase 1 | Both | Pattern storage format |
| `PatternOccurrence` | Phase 1 | Both | Occurrence storage format |
| `TaskProfile` | Phase 1 | Phase 3 | Injection matching |
| `Touch` enum | Phase 1 | Both | Tagging taxonomy |
| `ContextPackMetadata` | Phase 3 (3.1) | Phase 2 (via Phase 4) | **This phase defines it** |

### Coordination Points

1. **ContextPackMetadata contract**: Phase 3 (Section 3.1) defines the `ContextPackMetadata` interface. This is used by Phase 4 to pass data from Context Pack to injection. Coordinate any schema changes.

2. **FindingCategory taxonomy**: Phase 3 uses `findingCategory` for filtering patterns. Phase 2 uses `mapScoutToCategory()` to classify findings into these same categories. Keep the mapping consistent.

3. **patternKey uniqueness**: Phase 3's selector assumes `patternKey` uniquely identifies a pattern within a project scope. Phase 2 computes this key. Don't change the deduplication logic independently.

4. **Severity ordering**: Phase 3 orders warnings by severity (CRITICAL > HIGH > MEDIUM > LOW). Phase 2 assigns these severities. The ranking logic must be consistent.

### Non-Overlapping Concerns

- Phase 2 focuses on **attribution** (evidence extraction, failure mode classification)
- Phase 3 focuses on **injection** (warning selection, formatting, token estimation)

These concerns should not overlap. If you're adding code that crosses this boundary, coordinate with the other phase.

---

## Dependencies & Patterns

**Research Document:** [`ai_docs/phase-3-patterns.md`](../../ai_docs/phase-3-patterns.md)

This phase implements several key patterns documented in the research file:

| Component | Pattern | Source |
|-----------|---------|--------|
| Warning Selection | Weighted priority queue with tiered slots | Section 1.1-1.2 |
| Diversity Sampling | Category caps (security: 3 max) + guaranteed slots | Section 1.3 |
| Deterministic Ordering | Multi-level tie-breaking (severity, recency, id) | Section 1.4 |
| Template Rendering | Markdown sections with structured formatting | Section 2.1-2.2 |
| Token Estimation | Character-based heuristic (3.5 chars/token for Claude) | Section 3.3-3.4 |
| Scope Inheritance | Hierarchical multi-tenant (workspace -> project) | Section 4 |
| Cross-Project Warnings | Security-only with relevance gates | Section 4.3 |

**Key Design Decisions:**
1. **Tiered selection over pure priority:** Guarantees diversity (1 baseline + 1 derived + up to 4 patterns)
2. **Security category priority:** Up to 3 security patterns selected before other categories
3. **Markdown formatting:** GPT-4 prefers markdown; improves accuracy by 10-13% in structured tasks
4. **Simple string interpolation:** Template engines add complexity without benefit for predictable formats
5. **Hierarchical scoping:** Principles at workspace level, patterns at project level

---

## 1. Overview

This phase implements the Injection System that:
- Extracts TaskProfile from Linear issues
- Selects patterns/principles using tiered algorithm
- Formats warnings for agent prompts
- Computes confidence and injection priority

---

## 2. Deliverables Checklist

- [ ] `src/injection/context-pack-metadata.ts` - ContextPackMetadata contract (see 3.1)
- [ ] `src/injection/task-profile-extractor.ts` - TaskProfile from issue & Context Pack
- [ ] `src/injection/selector.ts` - Tiered pattern selection
- [ ] `src/injection/confidence.ts` - Confidence/priority calculation
- [ ] `src/injection/formatter.ts` - Warning markdown generation
- [ ] `tests/injection/task-profile-extractor.test.ts`
- [ ] `tests/injection/selector.test.ts`
- [ ] `tests/injection/confidence.test.ts`

---

## 3. TaskProfile Extraction

### 3.1 Context Pack Metadata Contract

**IMPORTANT:** This section defines the contract that Context Pack generators MUST follow.

The Context Pack metadata is produced by the Context Pack workflow (outside this system) and consumed by the injection system to extract accurate TaskProfiles. This contract ensures interoperability.

```typescript
// File: src/injection/context-pack-metadata.ts
// COORDINATION NOTE: This interface is the source of truth for Context Pack generators.
// If you modify this, coordinate with whoever generates Context Packs.

import { z } from 'zod';
import type { TaskProfile, Touch } from '../schemas';

/**
 * Constraint extracted from context sources.
 * Source can be a file path, URL, or structured reference.
 */
export interface ExtractedConstraint {
  constraint: string;       // The constraint text (e.g., "Must validate user input")
  source: {
    type: 'file' | 'url' | 'linear_doc' | 'inline';
    path?: string;          // For 'file' type
    url?: string;           // For 'url' or 'linear_doc' type
    section?: string;       // Optional section/heading reference
  };
}

export const ExtractedConstraintSchema = z.object({
  constraint: z.string(),
  source: z.object({
    type: z.enum(['file', 'url', 'linear_doc', 'inline']),
    path: z.string().optional(),
    url: z.string().optional(),
    section: z.string().optional()
  })
});

/**
 * Context Pack Metadata - The contract for Context Pack → Injection System interop.
 *
 * The Context Pack workflow should output this metadata alongside the Context Pack content.
 * This allows the injection system to:
 * 1. Extract accurate TaskProfile for pattern matching
 * 2. Determine which warnings are relevant to the task
 *
 * GENERATION REQUIREMENTS:
 * - If the Context Pack generator can determine explicit taskProfile values, include them
 * - If not, constraintsExtracted allows the injection system to infer the profile
 * - At minimum, constraintsExtracted SHOULD be populated for inference fallback
 */
export interface ContextPackMetadata {
  /**
   * Explicit TaskProfile if the Context Pack generator can determine it.
   * This is more accurate than inference and should be provided when possible.
   */
  taskProfile?: Partial<TaskProfile>;

  /**
   * Constraints extracted from architecture docs, README, etc.
   * Used for TaskProfile inference if explicit profile not provided.
   * Each constraint includes its source for traceability.
   */
  constraintsExtracted?: ExtractedConstraint[];

  /**
   * Context Pack version/hash for cache invalidation.
   * Optional but recommended for debugging injection issues.
   */
  contentHash?: string;

  /**
   * Timestamp when Context Pack was generated.
   */
  generatedAt?: string;
}

export const ContextPackMetadataSchema = z.object({
  taskProfile: z.object({
    touches: z.array(z.string()).optional(),
    technologies: z.array(z.string()).optional(),
    taskTypes: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional()
  }).optional(),
  constraintsExtracted: z.array(ExtractedConstraintSchema).optional(),
  contentHash: z.string().optional(),
  generatedAt: z.string().optional()
});
```

**Example Context Pack Metadata:**

```json
{
  "taskProfile": {
    "touches": ["database", "auth"],
    "technologies": ["postgres", "jwt"],
    "taskTypes": ["backend", "api"],
    "confidence": 0.85
  },
  "constraintsExtracted": [
    {
      "constraint": "All database queries must use parameterized statements",
      "source": { "type": "file", "path": "ARCHITECTURE.md", "section": "Security" }
    },
    {
      "constraint": "JWT tokens must be validated on every request",
      "source": { "type": "linear_doc", "url": "https://linear.app/docs/auth-spec" }
    }
  ],
  "contentHash": "sha256:abc123...",
  "generatedAt": "2024-01-15T10:30:00Z"
}
```

---

### 3.2 Extractor Implementation

```typescript
// File: src/injection/task-profile-extractor.ts
import type { TaskProfile, Touch } from '../schemas';
import type { ContextPackMetadata } from './context-pack-metadata';

export interface IssueData {
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
  const labelText = issue.labels.map(l => l.toLowerCase()).join(' ');
  const combined = `${text} ${labelText}`;

  const touches = extractTouches(combined);
  const technologies = extractTechnologies(combined);
  const taskTypes = extractTaskTypes(combined);
  const confidence = calculateConfidence(touches, technologies, taskTypes);

  return {
    touches,
    technologies,
    taskTypes,
    confidence
  };
}

/**
 * Extract TaskProfile from Context Pack metadata.
 * More accurate than issue extraction.
 * Uses formal ContextPackMetadata contract from context-pack-metadata.ts.
 */
export function extractTaskProfileFromContextPack(metadata: ContextPackMetadata): TaskProfile {
  // If Context Pack provides explicit taskProfile, use it
  if (metadata.taskProfile) {
    return {
      touches: metadata.taskProfile.touches || [],
      technologies: metadata.taskProfile.technologies || [],
      taskTypes: metadata.taskProfile.taskTypes || [],
      confidence: metadata.taskProfile.confidence || 0.8
    };
  }

  // Otherwise, infer from constraints
  const constraintText = metadata.constraintsExtracted
    ?.map(c => c.constraint)
    .join(' ')
    .toLowerCase() || '';

  return {
    touches: extractTouches(constraintText),
    technologies: extractTechnologies(constraintText),
    taskTypes: extractTaskTypes(constraintText),
    confidence: 0.6 // Lower confidence when inferring
  };
}

function extractTouches(text: string): Touch[] {
  const touches: Touch[] = [];

  const patterns: [RegExp, Touch][] = [
    // user_input
    [/\b(user.?input|form|request.?body|query.?param|payload|user.?data|input.?valid)/i, 'user_input'],
    // database
    [/\b(database|sql|query|postgres|mysql|mongo|db|crud|insert|update|delete|select)/i, 'database'],
    // network
    [/\b(network|http|api.?call|fetch|request|external.?service|webhook|client)/i, 'network'],
    // auth
    [/\b(auth|login|logout|session|token|jwt|oauth|password|credential)/i, 'auth'],
    // authz
    [/\b(permission|role|access.?control|rbac|authz|authorize|privilege|acl)/i, 'authz'],
    // caching
    [/\b(cache|redis|memcache|caching|ttl|invalidat)/i, 'caching'],
    // schema
    [/\b(schema|migration|alter|ddl|table|column|index|constraint)/i, 'schema'],
    // logging
    [/\b(log|logging|trace|audit|monitor|telemetry|metric)/i, 'logging'],
    // config
    [/\b(config|env|environment|setting|feature.?flag|toggle)/i, 'config'],
    // api
    [/\b(api|endpoint|route|rest|graphql|handler|controller)/i, 'api']
  ];

  for (const [pattern, touch] of patterns) {
    if (pattern.test(text) && !touches.includes(touch)) {
      touches.push(touch);
    }
  }

  return touches;
}

function extractTechnologies(text: string): string[] {
  const techs: string[] = [];

  const patterns: [RegExp, string][] = [
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
    [/\bvue\b/i, 'vue'],
    [/\bnode(js)?\b/i, 'nodejs'],
    [/\btypescript\b/i, 'typescript'],
    [/\bpython\b/i, 'python'],
    [/\bjava\b/i, 'java'],
    [/\bkafka\b/i, 'kafka'],
    [/\brabbitmq\b/i, 'rabbitmq'],
    [/\belasticsearch\b/i, 'elasticsearch'],
    [/\bs3\b/i, 's3'],
    [/\bdocker\b/i, 'docker'],
    [/\bkubernetes\b/i, 'kubernetes']
  ];

  for (const [pattern, tech] of patterns) {
    if (pattern.test(text) && !techs.includes(tech)) {
      techs.push(tech);
    }
  }

  return techs;
}

function extractTaskTypes(text: string): string[] {
  const types: string[] = [];

  const patterns: [RegExp, string][] = [
    [/\b(api|endpoint|route)\b/i, 'api'],
    [/\b(database|query|data.?layer)\b/i, 'database'],
    [/\b(migration|schema.?change)\b/i, 'migration'],
    [/\b(ui|frontend|component|page|view)\b/i, 'ui'],
    [/\b(auth|login|signup|session)\b/i, 'auth'],
    [/\b(background|job|worker|queue|async)\b/i, 'background-job'],
    [/\b(test|testing|spec|unit|integration)\b/i, 'testing'],
    [/\b(refactor|cleanup|tech.?debt)\b/i, 'refactor'],
    [/\b(bug|fix|hotfix|patch)\b/i, 'bugfix'],
    [/\b(feature|new|implement|add)\b/i, 'feature'],
    [/\b(deploy|release|ci|cd)\b/i, 'deployment'],
    [/\b(doc|documentation|readme)\b/i, 'documentation']
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(text) && !types.includes(type)) {
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
  let confidence = 0.3; // Base

  // More extracted info = higher confidence
  if (touches.length > 0) confidence += 0.2;
  if (touches.length > 2) confidence += 0.1;
  if (technologies.length > 0) confidence += 0.15;
  if (technologies.length > 1) confidence += 0.05;
  if (taskTypes.length > 0) confidence += 0.15;
  if (taskTypes.length > 1) confidence += 0.05;

  return Math.min(confidence, 1.0);
}
```

### 3.2 TaskProfile Tests

```typescript
// File: tests/injection/task-profile-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { extractTaskProfileFromIssue } from '../../src/injection/task-profile-extractor';

describe('extractTaskProfileFromIssue', () => {
  it('extracts database touches from SQL description', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Add user search endpoint',
      description: 'Implement SQL query to search users by name',
      labels: ['feature', 'api']
    });

    expect(profile.touches).toContain('database');
    expect(profile.touches).toContain('api');
    expect(profile.technologies).toContain('sql');
  });

  it('extracts auth touches', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Implement OAuth login',
      description: 'Add OAuth2 authentication with JWT tokens',
      labels: ['auth']
    });

    expect(profile.touches).toContain('auth');
    expect(profile.taskTypes).toContain('auth');
  });

  it('extracts multiple touches', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Add Redis caching for user API',
      description: 'Cache user queries in Redis with TTL',
      labels: ['performance']
    });

    expect(profile.touches).toContain('caching');
    expect(profile.touches).toContain('api');
    expect(profile.technologies).toContain('redis');
  });

  it('calculates confidence based on extraction', () => {
    const richProfile = extractTaskProfileFromIssue({
      title: 'Add PostgreSQL user search with Redis caching',
      description: 'Implement API endpoint with database query and caching',
      labels: ['api', 'database', 'caching']
    });

    const sparseProfile = extractTaskProfileFromIssue({
      title: 'Fix bug',
      description: 'Something is broken',
      labels: []
    });

    expect(richProfile.confidence).toBeGreaterThan(sparseProfile.confidence);
  });

  it('returns default api touch when nothing found', () => {
    const profile = extractTaskProfileFromIssue({
      title: 'Misc task',
      description: 'Do something',
      labels: []
    });

    // Should still have some base confidence
    expect(profile.confidence).toBeGreaterThanOrEqual(0.3);
  });
});
```

---

## 4. Confidence and Priority Calculation

### 4.1 Implementation

```typescript
// File: src/injection/confidence.ts
import type { PatternDefinition, TaskProfile, Touch } from '../schemas';

export interface PatternStats {
  totalOccurrences: number;
  activeOccurrences: number;
  lastSeenActive: string | null;
  injectionCount: number;
  adherenceRate: number | null;
}

/**
 * Compute statistics for a pattern.
 * These are NEVER stored - always computed from occurrences.
 */
export function computePatternStats(
  patternId: string,
  occurrenceRepo: { findByPatternId(id: string): Array<{
    status: string;
    createdAt: string;
    wasInjected: boolean;
    wasAdheredTo: boolean | null;
  }> }
): PatternStats {
  const occurrences = occurrenceRepo.findByPatternId(patternId);

  const activeOccurrences = occurrences.filter(o => o.status === 'active');
  const injectedOccurrences = occurrences.filter(o => o.wasInjected);
  const adheredOccurrences = injectedOccurrences.filter(o => o.wasAdheredTo === true);

  const lastActive = activeOccurrences
    .map(o => new Date(o.createdAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    totalOccurrences: occurrences.length,
    activeOccurrences: activeOccurrences.length,
    lastSeenActive: lastActive?.toISOString() || null,
    injectionCount: injectedOccurrences.length,
    adherenceRate: injectedOccurrences.length > 0
      ? adheredOccurrences.length / injectedOccurrences.length
      : null
  };
}

/**
 * Compute attribution confidence for a pattern.
 * See Spec Section 4.1.
 *
 * attributionConfidence = CLAMP(
 *   evidenceQualityBase
 *   + occurrenceBoost
 *   - decayPenalty
 *   + confidenceModifiers,
 *   0.0, 1.0
 * )
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

  // Occurrence boost: min((activeOccurrenceCount - 1), 5) * 0.05
  // First occurrence = no boost, max boost = 0.25 at 6+ occurrences
  const occurrenceBoost = Math.min(stats.activeOccurrences - 1, 5) * 0.05;
  confidence += occurrenceBoost;

  // Decay penalty (only if not permanent)
  if (!pattern.permanent && stats.lastSeenActive) {
    const daysSince = daysSinceDate(stats.lastSeenActive);
    // 90-day half-life, max penalty = 0.15
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
 *
 * injectionPriority =
 *   attributionConfidence
 *   * severityWeight
 *   * relevanceWeight
 *   * recencyWeight
 */
export function computeInjectionPriority(
  pattern: PatternDefinition & { _crossProjectPenalty?: boolean },
  taskProfile: TaskProfile,
  stats: PatternStats,
  flags?: { suspectedSynthesisDrift?: boolean }
): number {
  const attributionConfidence = computeAttributionConfidence(pattern, stats, flags);

  // Severity weight
  const severityWeight: Record<string, number> = {
    CRITICAL: 1.0,
    HIGH: 0.9,
    MEDIUM: 0.7,
    LOW: 0.5
  };

  // Relevance weight (capped linear)
  // v1.0: touches weighted higher than tech overlaps
  const touchOverlaps = pattern.touches.filter(t =>
    taskProfile.touches.includes(t)
  ).length;
  const techOverlaps = pattern.technologies.filter(t =>
    taskProfile.technologies.includes(t)
  ).length;
  const relevanceWeight = Math.min(
    1.0 + 0.15 * touchOverlaps + 0.05 * techOverlaps,
    1.5
  );

  // Recency weight
  const recencyWeight = stats.lastSeenActive
    ? computeRecencyWeight(stats.lastSeenActive)
    : 0.8;

  // v1.2: Cross-project penalty - patterns from other projects are slightly downweighted
  // Main spec Section 5.1: crossProjectPenalty = 0.05, applied as (1 - 0.05) = 0.95x
  const crossProjectPenalty = pattern._crossProjectPenalty ? 0.95 : 1.0;

  // Use severityMax for injection priority (v1.0: reflects worst observed impact)
  return attributionConfidence
    * severityWeight[pattern.severityMax]
    * relevanceWeight
    * recencyWeight
    * crossProjectPenalty;
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

### 4.2 Confidence Tests

```typescript
// File: tests/injection/confidence.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeAttributionConfidence,
  computeInjectionPriority,
  type PatternStats
} from '../../src/injection/confidence';
import type { PatternDefinition, TaskProfile } from '../../src/schemas';

const basePattern: PatternDefinition = {
  id: 'test-id',
  contentHash: 'a'.repeat(64),
  patternContent: 'Test pattern',
  failureMode: 'incorrect',
  findingCategory: 'security',
  severity: 'HIGH',
  alternative: 'Do this instead',
  carrierStage: 'context-pack',
  primaryCarrierQuoteType: 'verbatim',
  technologies: ['sql'],
  taskTypes: ['api'],
  touches: ['database', 'user_input'],
  status: 'active',
  permanent: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const baseStats: PatternStats = {
  totalOccurrences: 1,
  activeOccurrences: 1,
  lastSeenActive: new Date().toISOString(),
  injectionCount: 0,
  adherenceRate: null
};

const baseTaskProfile: TaskProfile = {
  touches: ['database', 'api'],
  technologies: ['sql', 'postgres'],
  taskTypes: ['api'],
  confidence: 0.8
};

describe('computeAttributionConfidence', () => {
  it('returns 0.75 base for verbatim quote', () => {
    const confidence = computeAttributionConfidence(basePattern, baseStats);
    expect(confidence).toBeCloseTo(0.75, 2);
  });

  it('returns 0.55 base for paraphrase quote', () => {
    const pattern = { ...basePattern, primaryCarrierQuoteType: 'paraphrase' as const };
    const confidence = computeAttributionConfidence(pattern, baseStats);
    expect(confidence).toBeCloseTo(0.55, 2);
  });

  it('returns 0.40 base for inferred quote', () => {
    const pattern = { ...basePattern, primaryCarrierQuoteType: 'inferred' as const };
    const confidence = computeAttributionConfidence(pattern, baseStats);
    expect(confidence).toBeCloseTo(0.40, 2);
  });

  it('adds occurrence boost', () => {
    const stats = { ...baseStats, activeOccurrences: 3 };
    const confidenceWith1 = computeAttributionConfidence(basePattern, baseStats);
    const confidenceWith3 = computeAttributionConfidence(basePattern, stats);
    expect(confidenceWith3).toBeGreaterThan(confidenceWith1);
    expect(confidenceWith3 - confidenceWith1).toBeCloseTo(0.1, 2); // 2 extra * 0.05
  });

  it('caps occurrence boost at 5 extra', () => {
    const stats6 = { ...baseStats, activeOccurrences: 6 };
    const stats10 = { ...baseStats, activeOccurrences: 10 };
    const confidence6 = computeAttributionConfidence(basePattern, stats6);
    const confidence10 = computeAttributionConfidence(basePattern, stats10);
    expect(confidence6).toBe(confidence10); // Both capped
  });

  it('applies decay penalty', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45); // 45 days ago
    const statsOld = { ...baseStats, lastSeenActive: oldDate.toISOString() };

    const confidenceNew = computeAttributionConfidence(basePattern, baseStats);
    const confidenceOld = computeAttributionConfidence(basePattern, statsOld);
    expect(confidenceOld).toBeLessThan(confidenceNew);
  });

  it('skips decay for permanent patterns', () => {
    const permanentPattern = { ...basePattern, permanent: true };
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 180);
    const statsOld = { ...baseStats, lastSeenActive: oldDate.toISOString() };

    const confidenceNew = computeAttributionConfidence(permanentPattern, baseStats);
    const confidenceOld = computeAttributionConfidence(permanentPattern, statsOld);
    expect(confidenceNew).toBe(confidenceOld);
  });

  it('applies suspected drift penalty', () => {
    const confidenceNormal = computeAttributionConfidence(basePattern, baseStats);
    const confidenceDrift = computeAttributionConfidence(
      basePattern,
      baseStats,
      { suspectedSynthesisDrift: true }
    );
    expect(confidenceDrift).toBe(confidenceNormal - 0.15);
  });
});

describe('computeInjectionPriority', () => {
  it('increases with severity', () => {
    const criticalPattern = { ...basePattern, severity: 'CRITICAL' as const };
    const lowPattern = { ...basePattern, severity: 'LOW' as const };

    const priorityCritical = computeInjectionPriority(criticalPattern, baseTaskProfile, baseStats);
    const priorityLow = computeInjectionPriority(lowPattern, baseTaskProfile, baseStats);

    expect(priorityCritical).toBeGreaterThan(priorityLow);
  });

  it('increases with touch overlap', () => {
    const matchingProfile = { ...baseTaskProfile, touches: ['database', 'user_input'] as const };
    const noMatchProfile = { ...baseTaskProfile, touches: ['logging'] as const };

    const priorityMatch = computeInjectionPriority(basePattern, matchingProfile, baseStats);
    const priorityNoMatch = computeInjectionPriority(basePattern, noMatchProfile, baseStats);

    expect(priorityMatch).toBeGreaterThan(priorityNoMatch);
  });
});
```

---

## 5. Tiered Pattern Selector

### 5.1 Implementation

```typescript
// File: src/injection/selector.ts
import type { Database } from 'better-sqlite3';
import type { PatternDefinition, DerivedPrinciple, TaskProfile, ProvisionalAlert } from '../schemas';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo';
import { ProjectRepository } from '../storage/repositories/project.repo';  // v1.2 FIX: For status check
import { computeInjectionPriority, computePatternStats } from './confidence';

export interface InjectedWarning {
  type: 'pattern' | 'principle';
  id: string;
  priority: number;
  content: PatternDefinition | DerivedPrinciple;
}

// v1.0: Separate type for injected alerts
export interface InjectedAlert {
  type: 'alert';
  id: string;
  priority: number;
  content: ProvisionalAlert;
}

export interface InjectionResult {
  warnings: InjectedWarning[];
  alerts: InjectedAlert[];  // v1.0: Additive, don't count against maxTotal
}

/**
 * Select warnings for injection using tiered algorithm.
 * See Spec Section 5.1.
 *
 * Algorithm:
 * 1. Select baseline principles from WORKSPACE level
 * 2. Select derived principles from WORKSPACE level
 * 3. Select learned patterns from PROJECT level
 * 4. Optional: Cross-project patterns (if enabled)
 * 5. Select ProvisionalAlerts (project-scoped)
 * 6. Cap at 6 total for warnings
 * 7. Low-confidence fallback
 *
 * v1.1: Updated for hierarchical scoping (workspace → project)
 */
// v1.2 FIX: Changed to options object to match Phase 4 calling convention
export function selectWarningsForInjection(
  db: Database,
  options: {
    workspaceId: string;
    projectId: string;
    target: 'context-pack' | 'spec';
    taskProfile: TaskProfile;
    maxWarnings?: number;
    crossProjectWarnings?: boolean;
  }
): InjectionResult {
  const {
    workspaceId,
    projectId,
    target,
    taskProfile,
    maxWarnings: maxTotal = 6,
    crossProjectWarnings = false
  } = options;
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const alertRepo = new ProvisionalAlertRepository(db);
  const projectRepo = new ProjectRepository(db);  // v1.2 FIX: For status check

  const selected: InjectedWarning[] = [];
  const selectedAlerts: InjectedAlert[] = [];

  // ========================================
  // PRE-CHECK: Verify project is active
  // v1.2 FIX: Skip injection entirely for archived projects
  // ========================================
  const project = projectRepo.findById({ workspaceId, id: projectId });
  if (!project || project.status === 'archived') {
    // Return empty result for archived/missing projects
    return { warnings: [], alerts: [] };
  }

  // ========================================
  // STEP 1: Select baseline principles (WORKSPACE level)
  // v1.1 CHANGED: Guarantee 1 baseline slot (not 2), to give derived principles airtime
  // ========================================

  // v1.1: Take exactly 1 baseline (or 2 if low confidence fallback)
  const maxBaselines = taskProfile.confidence < 0.5 ? 2 : 1;

  // v1.1: Query baseline principles at workspace level
  const eligibleBaselines = principleRepo.findActive({
    workspaceId,
    origin: 'baseline'
  }).filter(p =>
    (p.injectInto === target || p.injectInto === 'both') &&
    p.touches.some(t => taskProfile.touches.includes(t as typeof taskProfile.touches[number]))
  );

  // v1.0: Deterministic tie-breaking for baselines
  // Sort by: touchOverlapCount DESC, id ASC
  const selectedBaselines = eligibleBaselines
    .map(p => ({
      principle: p,
      touchOverlapCount: p.touches.filter(t =>
        taskProfile.touches.includes(t as typeof taskProfile.touches[number])
      ).length
    }))
    .sort((a, b) => {
      // Primary: touchOverlapCount DESC
      if (b.touchOverlapCount !== a.touchOverlapCount) {
        return b.touchOverlapCount - a.touchOverlapCount;
      }
      // Tie-breaker: id ASC (deterministic)
      return a.principle.id.localeCompare(b.principle.id);
    })
    .slice(0, maxBaselines)
    .map(x => x.principle);

  for (const principle of selectedBaselines) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle
    });
  }

  // ========================================
  // STEP 1.5: Select derived principles (WORKSPACE level)
  // v1.1 CHANGED: Derived principles get their own GUARANTEED slot
  // ========================================

  // v1.1: Query derived principles at workspace level
  const derivedPrinciples = principleRepo.findActive({
    workspaceId,
    origin: 'derived'
  }).filter(p =>
    (p.injectInto === target || p.injectInto === 'both') &&
    p.touches.some(t => taskProfile.touches.includes(t as typeof taskProfile.touches[number]))
  );

  // v1.1 CHANGED: Derived principles get guaranteed slot (not leftovers)
  // Sort by: touchOverlap DESC, confidence DESC, updatedAt DESC, id ASC
  const selectedDerived = derivedPrinciples
    .map(p => ({
      principle: p,
      touchOverlapCount: p.touches.filter(t =>
        taskProfile.touches.includes(t as typeof taskProfile.touches[number])
      ).length
    }))
    .sort((a, b) => {
      // Primary: touchOverlapCount DESC
      if (b.touchOverlapCount !== a.touchOverlapCount) {
        return b.touchOverlapCount - a.touchOverlapCount;
      }
      // Secondary: confidence DESC
      if (b.principle.confidence !== a.principle.confidence) {
        return b.principle.confidence - a.principle.confidence;
      }
      // Tertiary: updatedAt DESC (more recent first)
      const aTime = new Date(a.principle.updatedAt).getTime();
      const bTime = new Date(b.principle.updatedAt).getTime();
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      // Tie-breaker: id ASC (stable)
      return a.principle.id.localeCompare(b.principle.id);
    })
    .slice(0, 1)  // v1.1: Take exactly 1 derived (guaranteed slot)
    .map(x => x.principle);

  for (const principle of selectedDerived) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle
    });
  }

  // ========================================
  // STEP 2: Get eligible patterns (PROJECT level)
  // ========================================

  // v1.1: Query patterns at project level
  const allPatterns = patternRepo.findActive({
    workspaceId,
    projectId,
    carrierStage: target
  });

  // Filter by task profile match
  let matchingPatterns = allPatterns.filter(p =>
    p.touches.some(t => taskProfile.touches.includes(t)) ||
    p.technologies.some(t => taskProfile.technologies.includes(t)) ||
    p.taskTypes.some(t => taskProfile.taskTypes.includes(t))
  );

  // ========================================
  // STEP 2.5: Optional cross-project patterns
  // v1.2: Added relevance gate (touchOverlap >= 2) and deduplication
  // ========================================

  if (crossProjectWarnings) {
    // v1.1: Query HIGH/CRITICAL patterns from other projects in same workspace
    // v1.2 FIX: Only include SECURITY patterns for cross-project warnings (reduce noise)
    const crossProjectPatterns = patternRepo.findCrossProject({
      workspaceId,
      excludeProjectId: projectId,
      carrierStage: target,
      minSeverity: 'HIGH',
      findingCategory: 'security'  // v1.2: Only security patterns cross project boundaries
    });

    // v1.2: Relevance gate - require touchOverlap >= 2 OR techOverlap >= 1 to reduce noise
    // This allows patterns to match if they share 2+ touches OR at least 1 technology
    const relevantCrossPatterns = crossProjectPatterns.filter(p => {
      const touchOverlap = p.touches.filter(t => taskProfile.touches.includes(t)).length;
      const techOverlap = p.technologies.filter(t => taskProfile.technologies.includes(t)).length;
      return touchOverlap >= 2 || techOverlap >= 1;
    });

    // v1.2: Deduplication - if same patternKey exists in current project, skip cross-project version
    const existingPatternKeys = new Set(matchingPatterns.map(p => p.patternKey));
    const deduplicatedCrossPatterns = relevantCrossPatterns.filter(p =>
      !existingPatternKeys.has(p.patternKey)
    );

    // v1.2: Mark as cross-project for penalty in priority calculation
    const markedCrossPatterns = deduplicatedCrossPatterns.map(p => ({
      ...p,
      _crossProjectPenalty: true  // Used in computeInjectionPriority
    }));

    // Add cross-project patterns to matching pool (they'll be prioritized in steps 3-4)
    matchingPatterns = [...matchingPatterns, ...markedCrossPatterns];
  }

  // Apply inferred gate
  const gatedPatterns = matchingPatterns.filter(p =>
    meetsInferredGate(p, occurrenceRepo)
  );

  // Compute priorities and stats for deterministic sorting
  const patternsWithPriority = gatedPatterns.map(p => {
    const stats = computePatternStats(p.id, occurrenceRepo);
    return {
      pattern: p,
      priority: computeInjectionPriority(p, taskProfile, stats),
      stats
    };
  });

  // ========================================
  // STEP 3: Select security patterns first
  // ========================================

  // v1.0: Deterministic tie-breaking for patterns
  // Sort by: severity DESC, daysSinceLastSeen ASC, id ASC
  const severityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  const securityPatterns = patternsWithPriority
    .filter(({ pattern }) => pattern.findingCategory === 'security')
    .sort((a, b) => {
      // Primary: priority DESC
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Tie-breaker 1: severityMax DESC (v1.0: use worst observed impact)
      const sevDiff = severityOrder[b.pattern.severityMax] - severityOrder[a.pattern.severityMax];
      if (sevDiff !== 0) return sevDiff;
      // Tie-breaker 2: daysSinceLastSeen ASC (more recent = lower days = higher priority)
      const aDays = a.stats.lastSeenActive ? daysSinceDate(a.stats.lastSeenActive) : Infinity;
      const bDays = b.stats.lastSeenActive ? daysSinceDate(b.stats.lastSeenActive) : Infinity;
      if (aDays !== bDays) return aDays - bDays;
      // Tie-breaker 3: id ASC (deterministic)
      return a.pattern.id.localeCompare(b.pattern.id);
    })
    .slice(0, 3);

  for (const { pattern, priority } of securityPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern
    });
  }

  // ========================================
  // STEP 4: Fill remaining with non-security
  // ========================================

  const remainingSlots = maxTotal - selected.length;
  const selectedPatternIds = new Set(selected.filter(s => s.type === 'pattern').map(s => s.id));

  const otherPatterns = patternsWithPriority
    .filter(({ pattern }) =>
      pattern.findingCategory !== 'security' &&
      !selectedPatternIds.has(pattern.id)
    )
    .sort((a, b) => {
      // Primary: priority DESC
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Tie-breaker 1: severityMax DESC (v1.0: use worst observed impact)
      const sevDiff = severityOrder[b.pattern.severityMax] - severityOrder[a.pattern.severityMax];
      if (sevDiff !== 0) return sevDiff;
      // Tie-breaker 2: daysSinceLastSeen ASC
      const aDays = a.stats.lastSeenActive ? daysSinceDate(a.stats.lastSeenActive) : Infinity;
      const bDays = b.stats.lastSeenActive ? daysSinceDate(b.stats.lastSeenActive) : Infinity;
      if (aDays !== bDays) return aDays - bDays;
      // Tie-breaker 3: id ASC (deterministic)
      return a.pattern.id.localeCompare(b.pattern.id);
    })
    .slice(0, remainingSlots);

  for (const { pattern, priority } of otherPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern
    });
  }

  // ========================================
  // STEP 5: Low-confidence fallback (project-wide patterns)
  // v1.2 FIX: Renamed from "global" to "project-wide" (matches scoping model)
  // v1.2 FIX: Use severityMax instead of severity (worst observed impact)
  // ========================================

  if (taskProfile.confidence < 0.5 && selected.length < maxTotal) {
    // Add project-wide high-severity patterns regardless of match
    const projectHighSeverity = allPatterns
      .filter(p =>
        (p.severityMax === 'CRITICAL' || p.severityMax === 'HIGH') &&  // v1.2 FIX: Use severityMax
        !selected.find(s => s.id === p.id)
      )
      .slice(0, 2);

    for (const pattern of projectHighSeverity) {
      if (selected.length >= maxTotal) break;
      const stats = computePatternStats(pattern.id, occurrenceRepo);
      selected.push({
        type: 'pattern',
        id: pattern.id,
        priority: computeInjectionPriority(pattern, taskProfile, stats) * 0.8, // Lower priority for fallback
        content: pattern
      });
    }
  }

  // ========================================
  // STEP 6: Add provisional alerts (PROJECT level)
  // ========================================
  // Alerts are ADDITIVE - they do NOT count against maxTotal
  // This ensures critical real-time warnings are always surfaced
  // NOTE: v1.0 ProvisionalAlert only has 'touches' for filtering (no technologies field)

  // v1.1: Query alerts at project level
  // v1.2 FIX: Explicitly check expiresAt > now() to filter out expired alerts
  const now = new Date().toISOString();
  const activeAlerts = alertRepo.findActive({
    workspaceId,
    projectId
  }).filter(alert =>
    // v1.2 FIX: Ensure alert is not expired
    alert.expiresAt > now &&
    // Match by touches only (v1.0 schema doesn't include technologies)
    alert.touches.some(t => taskProfile.touches.includes(t)) &&
    // Match injection target
    (alert.injectInto === target || alert.injectInto === 'both')
  );

  // Sort by creation time for deterministic ordering (more recent first)
  // NOTE: v1.0 ProvisionalAlert doesn't have severity - alerts are all HIGH/CRITICAL by definition
  const sortedAlerts = activeAlerts.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const alert of sortedAlerts) {
    selectedAlerts.push({
      type: 'alert',
      id: alert.id,
      priority: 0.9, // High priority - alerts are by definition HIGH/CRITICAL security issues
      content: alert
    });
  }

  return { warnings: selected, alerts: selectedAlerts };
}

/**
 * Check if pattern meets inferred gate for injection.
 * See Spec Section 4.4 (Special Rules for Inferred Patterns).
 *
 * Inferred patterns require:
 * - 2+ active occurrences, OR
 * - HIGH/CRITICAL severity AND aligned baseline, OR
 * - failureMode == 'missing_reference'
 */
function meetsInferredGate(
  pattern: PatternDefinition,
  occurrenceRepo: PatternOccurrenceRepository
): boolean {
  // Non-inferred always pass
  if (pattern.primaryCarrierQuoteType !== 'inferred') {
    return true;
  }

  // Check conditions
  const stats = computePatternStats(pattern.id, occurrenceRepo);

  // 2+ occurrences
  if (stats.activeOccurrences >= 2) {
    return true;
  }

  // High severityMax + baseline alignment (v1.0: use worst observed impact)
  if ((pattern.severityMax === 'HIGH' || pattern.severityMax === 'CRITICAL') &&
      pattern.alignedBaselineId) {
    return true;
  }

  // missing_reference failure mode
  if (pattern.failureMode === 'missing_reference') {
    return true;
  }

  return false;
}

/**
 * v1.0: Conflict Precedence Resolution
 *
 * When multiple patterns or alerts conflict (e.g., contradictory guidance),
 * resolve using this precedence order:
 *   security > privacy > backcompat > correctness > everything else
 *
 * Higher precedence items are kept; lower precedence conflicting items are dropped.
 */
const CATEGORY_PRECEDENCE: Record<string, number> = {
  security: 5,
  privacy: 4,
  backcompat: 3,
  correctness: 2,
  // All other categories default to 1
};

export function getCategoryPrecedence(category: string): number {
  return CATEGORY_PRECEDENCE[category] ?? 1;
}

/**
 * Resolve conflicts between warnings/alerts with contradictory guidance.
 * Returns the filtered list with lower-precedence conflicts removed.
 */
export function resolveConflicts<T extends { id: string; content: { findingCategory?: string } }>(
  items: T[],
  getConflictKey: (item: T) => string | null
): T[] {
  const conflictGroups = new Map<string, T[]>();
  const nonConflicting: T[] = [];

  for (const item of items) {
    const conflictKey = getConflictKey(item);
    if (conflictKey === null) {
      nonConflicting.push(item);
    } else {
      const group = conflictGroups.get(conflictKey) || [];
      group.push(item);
      conflictGroups.set(conflictKey, group);
    }
  }

  const resolved: T[] = [...nonConflicting];

  for (const group of conflictGroups.values()) {
    // Sort by precedence DESC, keep highest
    const sorted = group.sort((a, b) => {
      const precA = getCategoryPrecedence(a.content.findingCategory || '');
      const precB = getCategoryPrecedence(b.content.findingCategory || '');
      return precB - precA;
    });
    resolved.push(sorted[0]); // Keep only highest precedence
  }

  return resolved;
}
```

### 5.2 Selector Tests

**File:** `tests/injection/selector.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectWarningsForInjection } from '../../src/injection/selector';
import { PatternDefinitionRepository } from '../../src/storage/repositories/pattern-definition.repo';
import { DerivedPrincipleRepository } from '../../src/storage/repositories/derived-principle.repo';
import { ProvisionalAlertRepository } from '../../src/storage/repositories/provisional-alert.repo';
import { ProjectRepository } from '../../src/storage/repositories/project.repo';

describe('selectWarningsForInjection', () => {
  let patternRepo: PatternDefinitionRepository;
  let principleRepo: DerivedPrincipleRepository;
  let alertRepo: ProvisionalAlertRepository;
  let projectRepo: ProjectRepository;

  const workspaceId = 'ws-123';
  const projectId = 'proj-456';

  beforeEach(() => {
    patternRepo = {
      findActive: vi.fn(),
      findCrossProject: vi.fn().mockReturnValue([])
    } as unknown as PatternDefinitionRepository;

    principleRepo = {
      findForInjection: vi.fn()
    } as unknown as DerivedPrincipleRepository;

    alertRepo = {
      findActive: vi.fn().mockReturnValue([])
    } as unknown as ProvisionalAlertRepository;

    projectRepo = {
      findById: vi.fn().mockReturnValue({ id: projectId, status: 'active' })
    } as unknown as ProjectRepository;
  });

  describe('tiered selection', () => {
    it('selects 1 baseline + 1 derived + up to 4 patterns (maxTotal=6)', async () => {
      const baseline = createPrinciple({ origin: 'baseline', touches: ['database'] });
      const derived = createPrinciple({ origin: 'derived', touches: ['database'] });
      const patterns = [
        createPattern({ findingCategory: 'security', severityMax: 'HIGH' }),
        createPattern({ findingCategory: 'security', severityMax: 'MEDIUM' }),
        createPattern({ findingCategory: 'correctness', severityMax: 'HIGH' }),
        createPattern({ findingCategory: 'correctness', severityMax: 'MEDIUM' }),
        createPattern({ findingCategory: 'testing', severityMax: 'LOW' })
      ];

      vi.mocked(principleRepo.findForInjection).mockReturnValue([baseline, derived]);
      vi.mocked(patternRepo.findActive).mockReturnValue(patterns);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      expect(result.warnings.length).toBeLessThanOrEqual(6);
      expect(result.warnings.filter(w => w.type === 'baseline').length).toBe(1);
      expect(result.warnings.filter(w => w.type === 'derived').length).toBe(1);
    });

    it('prioritizes security patterns (up to 3)', async () => {
      const patterns = [
        createPattern({ findingCategory: 'security', severityMax: 'CRITICAL', id: 'sec-1' }),
        createPattern({ findingCategory: 'security', severityMax: 'HIGH', id: 'sec-2' }),
        createPattern({ findingCategory: 'security', severityMax: 'MEDIUM', id: 'sec-3' }),
        createPattern({ findingCategory: 'security', severityMax: 'LOW', id: 'sec-4' }),
        createPattern({ findingCategory: 'correctness', severityMax: 'CRITICAL', id: 'cor-1' })
      ];

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue(patterns);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'spec',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      const securityPatterns = result.warnings.filter(
        w => w.type === 'pattern' && w.content.findingCategory === 'security'
      );
      expect(securityPatterns.length).toBeLessThanOrEqual(3);
    });
  });

  describe('cross-project warnings', () => {
    it('includes cross-project patterns when enabled', async () => {
      const crossProjectPattern = createPattern({
        findingCategory: 'security',
        severityMax: 'HIGH',
        touches: ['database', 'user_input']
      });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([]);
      vi.mocked(patternRepo.findCrossProject).mockReturnValue([crossProjectPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database', 'user_input'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        options: { crossProjectWarnings: true },
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('applies relevance gate (touchOverlap >= 2)', async () => {
      const crossProjectPattern = createPattern({
        findingCategory: 'security',
        severityMax: 'HIGH',
        touches: ['database']  // Only 1 overlap
      });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([]);
      vi.mocked(patternRepo.findCrossProject).mockReturnValue([crossProjectPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        options: { crossProjectWarnings: true },
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      // Should be filtered out due to relevance gate
      const crossProject = result.warnings.filter(w => w._crossProject);
      expect(crossProject.length).toBe(0);
    });

    it('deduplicates by patternKey (local wins)', async () => {
      const patternKey = 'abc123';
      const localPattern = createPattern({ patternKey, id: 'local' });
      const crossPattern = createPattern({ patternKey, id: 'cross' });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([localPattern]);
      vi.mocked(patternRepo.findCrossProject).mockReturnValue([crossPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        options: { crossProjectWarnings: true },
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      const patternIds = result.warnings.filter(w => w.type === 'pattern').map(w => w.id);
      expect(patternIds).toContain('local');
      expect(patternIds).not.toContain('cross');
    });
  });

  describe('low-confidence fallback', () => {
    it('includes project-wide HIGH/CRITICAL patterns when confidence < 0.5', async () => {
      const highSeverityPattern = createPattern({
        findingCategory: 'correctness',
        severityMax: 'CRITICAL',
        touches: ['network']  // Different from taskProfile
      });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([highSeverityPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.3 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      // Should include the pattern even though touches don't match
      expect(result.warnings.some(w => w.id === highSeverityPattern.id)).toBe(true);
    });
  });

  describe('inferred pattern gate', () => {
    it('filters inferred patterns with < 2 occurrences', async () => {
      const inferredPattern = createPattern({
        primaryCarrierQuoteType: 'inferred',
        activeOccurrenceCount: 1
      });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([inferredPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      expect(result.warnings.some(w => w.id === inferredPattern.id)).toBe(false);
    });

    it('allows inferred HIGH/CRITICAL with baseline alignment', async () => {
      const inferredPattern = createPattern({
        primaryCarrierQuoteType: 'inferred',
        activeOccurrenceCount: 1,
        severityMax: 'HIGH',
        alignedBaselineId: 'baseline-123'
      });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue([inferredPattern]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      expect(result.warnings.some(w => w.id === inferredPattern.id)).toBe(true);
    });
  });

  describe('archived project handling', () => {
    it('returns empty result for archived projects', async () => {
      vi.mocked(projectRepo.findById).mockReturnValue({ id: projectId, status: 'archived' });

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      expect(result.warnings).toEqual([]);
      expect(result.alerts).toEqual([]);
    });
  });

  describe('ProvisionalAlerts (additive)', () => {
    it('adds alerts without counting against maxTotal', async () => {
      const patterns = Array(6).fill(null).map((_, i) => createPattern({ id: `p-${i}` }));
      const alert = createAlert({ touches: ['database'] });

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue(patterns);
      vi.mocked(alertRepo.findActive).mockReturnValue([alert]);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      // Should have 6 warnings + 1 alert (alert is additive)
      expect(result.warnings.length).toBe(6);
      expect(result.alerts.length).toBe(1);
    });
  });

  describe('deterministic tie-breaking', () => {
    it('orders patterns by severity DESC, recency ASC, id ASC', async () => {
      const patterns = [
        createPattern({ id: 'c', severityMax: 'HIGH', lastSeenAt: '2026-01-10' }),
        createPattern({ id: 'a', severityMax: 'HIGH', lastSeenAt: '2026-01-15' }),
        createPattern({ id: 'b', severityMax: 'HIGH', lastSeenAt: '2026-01-15' })
      ];

      vi.mocked(principleRepo.findForInjection).mockReturnValue([]);
      vi.mocked(patternRepo.findActive).mockReturnValue(patterns);

      const result = await selectWarningsForInjection({
        workspaceId, projectId,
        target: 'context-pack',
        taskProfile: { touches: ['database'], technologies: [], taskTypes: [], confidence: 0.8 },
        maxTotal: 6,
        patternRepo, principleRepo, alertRepo, projectRepo
      });

      const ids = result.warnings.map(w => w.id);
      // Same severity, 'a' is more recent than 'c', 'a' < 'b' alphabetically
      expect(ids).toEqual(['a', 'b', 'c']);
    });
  });
});

// Helper factories
function createPattern(overrides: Partial<PatternDefinition> = {}): PatternDefinition {
  return {
    id: overrides.id || `pattern-${Math.random().toString(36).slice(2)}`,
    patternKey: overrides.patternKey || `key-${Math.random().toString(36).slice(2)}`,
    contentHash: 'a'.repeat(64),
    patternContent: 'Bad guidance',
    failureMode: 'incorrect',
    findingCategory: 'security',
    severity: 'HIGH',
    severityMax: 'HIGH',
    alternative: 'Do this instead',
    carrierStage: 'context-pack',
    primaryCarrierQuoteType: 'verbatim',
    technologies: [],
    taskTypes: [],
    touches: ['database'],
    status: 'active',
    permanent: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function createPrinciple(overrides: Partial<DerivedPrinciple> = {}): DerivedPrinciple {
  return {
    id: `principle-${Math.random().toString(36).slice(2)}`,
    principle: 'Always do X',
    rationale: 'Because Y',
    origin: 'baseline',
    injectInto: 'both',
    touches: ['database'],
    confidence: 0.9,
    status: 'active',
    permanent: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function createAlert(overrides: Partial<ProvisionalAlert> = {}): ProvisionalAlert {
  return {
    id: `alert-${Math.random().toString(36).slice(2)}`,
    findingId: 'finding-123',
    issueId: 'PROJ-123',
    message: 'Warning message',
    touches: ['database'],
    injectInto: 'both',
    expiresAt: '2026-02-01T00:00:00Z',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}
```

---

## 6. Warning Formatter

### 6.1 Implementation

```typescript
// File: src/injection/formatter.ts
import type { PatternDefinition, DerivedPrinciple, ProvisionalAlert } from '../schemas';
import type { InjectedWarning, InjectedAlert, InjectionResult } from './selector';

/**
 * Format injection result for agent prompts.
 * See Spec Section 5.2.
 *
 * v1.0: Now accepts InjectionResult with separate warnings and alerts.
 * Alerts are rendered in a separate PROVISIONAL ALERT section.
 */
export function formatInjectionForPrompt(result: InjectionResult): string {
  const sections: string[] = [];

  // Format alerts first (v1.0 - high visibility)
  if (result.alerts.length > 0) {
    sections.push(formatAlertsSection(result.alerts));
  }

  // Format warnings
  if (result.warnings.length > 0) {
    sections.push(formatWarningsSection(result.warnings));
  }

  return sections.join('\n\n');
}

/**
 * v1.0: Format provisional alerts section
 */
function formatAlertsSection(alerts: InjectedAlert[]): string {
  const lines: string[] = [
    '## PROVISIONAL ALERTS (auto-generated)',
    '',
    '> These are real-time alerts about known issues. Pay close attention!',
    ''
  ];

  // Sort by priority (highest first)
  const sorted = [...alerts].sort((a, b) => b.priority - a.priority);

  for (const alert of sorted) {
    lines.push(formatAlert(alert.content as ProvisionalAlert));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format warnings section (patterns and principles)
 */
function formatWarningsSection(warnings: InjectedWarning[]): string {
  const lines: string[] = [
    '## Warnings from Past Issues (auto-generated)',
    '',
    'These warnings are based on patterns learned from previous PR reviews.',
    'Pay special attention to these areas to avoid repeating past mistakes.',
    ''
  ];

  // Sort by priority (highest first)
  const sorted = [...warnings].sort((a, b) => b.priority - a.priority);

  for (const warning of sorted) {
    if (warning.type === 'pattern') {
      lines.push(formatPattern(warning.content as PatternDefinition));
    } else {
      lines.push(formatPrinciple(warning.content as DerivedPrinciple));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use formatInjectionForPrompt instead
 */
export function formatWarningsForInjection(warnings: InjectedWarning[]): string {
  return formatWarningsSection(warnings);
}

function formatPattern(pattern: PatternDefinition): string {
  const categoryUpper = pattern.findingCategory.toUpperCase();
  const failureModeFormatted = pattern.failureMode.replace(/_/g, ' ');
  const title = truncate(summarizeContent(pattern.patternContent), 60);

  // Use severityMax for display (v1.0: reflects worst observed impact)
  const lines = [
    `### [${categoryUpper}][${failureModeFormatted}][${pattern.severityMax}] ${title}`,
    '',
    `**Bad guidance:** "${pattern.patternContent}"`,
    '',
    `**Observed result:** This led to a ${pattern.findingCategory} issue.`,
    '',
    `**Do instead:** ${pattern.alternative}`,
    '',
    `**Applies when:** touches=${pattern.touches.join(',')}`
  ];

  if (pattern.technologies.length > 0) {
    lines[lines.length - 1] += `; tech=${pattern.technologies.join(',')}`;
  }

  if (pattern.consequenceClass) {
    lines.push('');
    lines.push(`**Reference:** ${pattern.consequenceClass}`);
  }

  return lines.join('\n');
}

function formatPrinciple(principle: DerivedPrinciple): string {
  const title = truncate(principle.principle, 60);

  const lines = [
    `### [BASELINE] ${title}`,
    '',
    `**Principle:** ${principle.principle}`,
    '',
    `**Rationale:** ${principle.rationale}`,
    '',
    `**Applies when:** touches=${principle.touches.join(',')}`
  ];

  if (principle.externalRefs?.length) {
    lines.push('');
    lines.push(`**Reference:** ${principle.externalRefs.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * v1.0: Format a provisional alert
 *
 * ProvisionalAlert schema (v1.0):
 * - id, findingId, issueId, message, touches, injectInto, expiresAt, status, createdAt
 * - Note: No severity/title/description - these are all HIGH/CRITICAL by definition
 */
function formatAlert(alert: ProvisionalAlert): string {
  // ProvisionalAlerts are by definition HIGH/CRITICAL security issues
  const lines = [
    `### [PROVISIONAL ALERT] ${alert.message}`,
    '',
    `**Issue ID:** ${alert.issueId}`,
  ];

  if (alert.touches.length > 0) {
    lines.push('');
    lines.push(`**Applies when:** touches=${alert.touches.join(',')}`);
  }

  // Show expiration to indicate this is a temporary alert
  const expiresIn = Math.max(0, Math.floor(
    (new Date(alert.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  lines.push('');
  lines.push(`**Expires in:** ${expiresIn} days`);

  return lines.join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function summarizeContent(content: string): string {
  // Extract first meaningful phrase
  const firstSentence = content.split(/[.!?]/)[0];
  return firstSentence.trim();
}

/**
 * Format a compact summary for logging.
 * v1.0: Updated to include alerts count
 */
export function formatWarningsSummary(warnings: InjectedWarning[]): string {
  const patterns = warnings.filter(w => w.type === 'pattern');
  const principles = warnings.filter(w => w.type === 'principle');

  return `Injected ${warnings.length} warnings: ${principles.length} baseline principles, ${patterns.length} learned patterns`;
}

/**
 * v1.0: Format summary including alerts
 */
export function formatInjectionSummary(result: InjectionResult): string {
  const patterns = result.warnings.filter(w => w.type === 'pattern');
  const principles = result.warnings.filter(w => w.type === 'principle');
  const alerts = result.alerts;

  const parts = [
    `${result.warnings.length} warnings (${principles.length} baselines, ${patterns.length} patterns)`
  ];

  if (alerts.length > 0) {
    parts.push(`${alerts.length} provisional alerts`);
  }

  return `Injected: ${parts.join(', ')}`;
}
```

---

## 7. Injection Logging

### 7.1 InjectionLog Schema

```typescript
// File: src/schemas/injection-log.ts

/**
 * v1.1: InjectionLog records what was injected into a prompt.
 * Used for tracking, debugging, and adherence analysis.
 *
 * NOTE: This schema matches spec-pattern-attribution-v1.0.md Section 2.8
 * v1.1: Added workspaceId/projectId for hierarchical scoping
 */
export interface InjectionLog {
  id: string;                           // UUID
  workspaceId: string;                  // v1.1: Workspace scope
  projectId: string;                    // v1.1: Project scope
  issueId: string;                      // Linear issue key (e.g., PROJ-123)
  target: 'context-pack' | 'spec';
  injectedPatterns: string[];           // PatternDefinition IDs
  injectedPrinciples: string[];         // DerivedPrinciple IDs
  injectedAlerts: string[];             // ProvisionalAlert IDs
  taskProfile: TaskProfile;             // Profile used for selection
  injectedAt: string;                   // ISO 8601
}

/**
 * Create an InjectionLog from an injection result.
 * v1.1: Updated to include workspaceId/projectId
 */
export function createInjectionLog(
  workspaceId: string,
  projectId: string,
  issueId: string,
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  result: InjectionResult
): InjectionLog {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    projectId,
    issueId,
    target,
    injectedPatterns: result.warnings
      .filter(w => w.type === 'pattern')
      .map(w => w.id),
    injectedPrinciples: result.warnings
      .filter(w => w.type === 'principle')
      .map(w => w.id),
    injectedAlerts: result.alerts.map(a => a.id),
    taskProfile,
    injectedAt: new Date().toISOString()
  };
}
```

---

## 8. Kill Switch Integration

The Injection System MUST integrate with the kill switch mechanism defined in Spec Section 11.
The kill switch monitors attribution health and may pause pattern/alert creation while keeping
injection active for existing patterns.

### 8.1 Key Principle: Injection Continues During Paused States

**IMPORTANT:** When the kill switch is triggered (INFERRED_PAUSED or FULLY_PAUSED), injection
of existing patterns and principles MUST continue unchanged. The rationale (from Spec Section 11):

> Existing patterns have been vetted by occurrence counts and adherence tracking. Pausing
> injection would lose known-good guidance that has already proven valuable.

Only **new pattern creation** is paused, not the injection of existing patterns.

### 8.2 Behavior by Kill Switch State

| Kill Switch State | Injection Behavior | ProvisionalAlert Creation |
|-------------------|-------------------|---------------------------|
| `ACTIVE` | Full injection (patterns, principles, alerts) | Allowed |
| `INFERRED_PAUSED` | Full injection (patterns, principles, alerts) | **Disabled** |
| `FULLY_PAUSED` | Full injection (patterns, principles, alerts) | **Disabled** |

### 8.3 ProvisionalAlert Creation Gate

The Attribution Agent (Phase 2) is responsible for creating ProvisionalAlerts. However, when
the kill switch state is INFERRED_PAUSED or FULLY_PAUSED, ProvisionalAlert creation MUST be
disabled at the project scope.

The Injection System receives alerts from the repository and does NOT need to check the kill
switch state for injection—it simply injects whatever active alerts exist. The gate is
enforced at creation time (Attribution Agent), not injection time.

### 8.4 Implementation: Kill Switch Status Check

```typescript
// File: src/injection/kill-switch-check.ts
import type { Database } from 'better-sqlite3';
import { KillSwitchRepository } from '../storage/repositories/kill-switch.repo';

export type PatternCreationState = 'active' | 'inferred_paused' | 'fully_paused';

export interface KillSwitchStatus {
  state: PatternCreationState;
  reason: string | null;
  enteredAt: string | null;
  autoResumeAt: string | null;
}

/**
 * Check if ProvisionalAlert creation is allowed for the given project.
 * Returns false if kill switch is in INFERRED_PAUSED or FULLY_PAUSED state.
 *
 * NOTE: This is used by the Attribution Agent (Phase 2), not the Injection System.
 * The Injection System always injects existing alerts regardless of kill switch state.
 */
export function isProvisionalAlertCreationAllowed(
  db: Database,
  workspaceId: string,
  projectId: string
): boolean {
  const killSwitchRepo = new KillSwitchRepository(db);
  const status = killSwitchRepo.getStatus({ workspaceId, projectId });

  // Only ACTIVE state allows new alert creation
  return status.state === 'active';
}

/**
 * Get the current kill switch status for a project.
 * Used for logging and observability.
 */
export function getKillSwitchStatus(
  db: Database,
  workspaceId: string,
  projectId: string
): KillSwitchStatus {
  const killSwitchRepo = new KillSwitchRepository(db);
  return killSwitchRepo.getStatus({ workspaceId, projectId });
}
```

### 8.5 Injection Logging During Paused States

When injecting during INFERRED_PAUSED or FULLY_PAUSED states, the InjectionLog MUST include
the kill switch state for observability. This allows operators to understand system behavior
and verify that injection continues correctly during paused periods.

```typescript
// File: src/schemas/injection-log.ts (UPDATED)

/**
 * v1.2: InjectionLog updated to include kill switch state
 */
export interface InjectionLog {
  id: string;
  workspaceId: string;
  projectId: string;
  issueId: string;
  target: 'context-pack' | 'spec';
  injectedPatterns: string[];
  injectedPrinciples: string[];
  injectedAlerts: string[];
  taskProfile: TaskProfile;
  injectedAt: string;
  // v1.2: Kill switch state at injection time (for observability)
  killSwitchState: PatternCreationState;
}

/**
 * Create an InjectionLog from an injection result.
 * v1.2: Updated to include kill switch state
 */
export function createInjectionLog(
  workspaceId: string,
  projectId: string,
  issueId: string,
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  result: InjectionResult,
  killSwitchState: PatternCreationState = 'active'
): InjectionLog {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    projectId,
    issueId,
    target,
    injectedPatterns: result.warnings
      .filter(w => w.type === 'pattern')
      .map(w => w.id),
    injectedPrinciples: result.warnings
      .filter(w => w.type === 'principle')
      .map(w => w.id),
    injectedAlerts: result.alerts.map(a => a.id),
    taskProfile,
    injectedAt: new Date().toISOString(),
    killSwitchState
  };
}
```

### 8.6 Observability Events

When injection occurs during a paused state, emit an observability log:

```json
{
  "event": "injection_during_paused_state",
  "workspace_id": "ws_123",
  "project_id": "proj_456",
  "issue_id": "PROJ-789",
  "kill_switch_state": "fully_paused",
  "injection_summary": {
    "patterns_injected": 3,
    "principles_injected": 2,
    "alerts_injected": 0
  },
  "note": "Injection continues for existing patterns; only new pattern creation is paused"
}
```

This observability helps operators:
1. Verify injection continues correctly during paused states
2. Track how many injections occur while pattern creation is paused
3. Correlate injection behavior with attribution health metrics

---

## 9. Acceptance Criteria

Phase 3 is complete when:

1. [ ] TaskProfile extracted from issue text and labels
2. [ ] Confidence calculation follows spec formula
3. [ ] Injection priority includes severity, relevance, recency
4. [ ] Tiered selection: 1 baseline + 1 derived + up to 4 patterns, capped at 6
5. [ ] Inferred pattern gate enforced
6. [ ] Low-confidence fallback adds global high-severity
7. [ ] Formatted output is readable markdown
8. [ ] v1.0: Provisional alerts included additively (not counted against maxTotal)
9. [ ] v1.0: Conflict precedence enforced (security > privacy > backcompat > correctness)
10. [ ] v1.0: Deterministic tie-breaking implemented
11. [ ] v1.0: InjectionLog includes injectedAlerts array
12. [ ] v1.1: Hierarchical scoping implemented (workspace→project)
13. [ ] v1.1: Baseline/derived principles queried at workspace level
14. [ ] v1.1: Patterns/alerts queried at project level
15. [ ] v1.1: Optional cross-project patterns support
16. [ ] v1.2: Kill switch integration documented
17. [ ] v1.2: Injection continues during INFERRED_PAUSED and FULLY_PAUSED states
18. [ ] v1.2: ProvisionalAlert creation gate exports isProvisionalAlertCreationAllowed()
19. [ ] v1.2: InjectionLog includes killSwitchState field
20. [ ] v1.2: Observability events emitted for injection during paused states
21. [ ] All tests pass

---

## 10. Handoff to Phase 4

After Phase 3, the following are available:

- `extractTaskProfileFromIssue()` - Extract from Linear issue
- `extractTaskProfileFromContextPack()` - Extract from metadata
- `selectWarningsForInjection(db, options)` - v1.2: Tiered selection with options object containing workspaceId, projectId, target, taskProfile, maxWarnings?, crossProjectWarnings?
- `formatInjectionForPrompt()` - Markdown output with alerts section
- `formatWarningsForInjection()` - Legacy markdown output (deprecated)
- `computeInjectionPriority()` - Priority calculation
- `computePatternStats()` - Pattern statistics
- `resolveConflicts()` - Conflict precedence resolution
- `createInjectionLog(workspaceId, projectId, issueId, target, taskProfile, result, killSwitchState?)` - v1.2: Create log with scope and kill switch state
- `isProvisionalAlertCreationAllowed(db, workspaceId, projectId)` - v1.2: Check if ProvisionalAlert creation is allowed (used by Attribution Agent)
- `getKillSwitchStatus(db, workspaceId, projectId)` - v1.2: Get current kill switch status for logging

Phase 4 (Integration) will wire these into the workflow hooks.
