# Phase 3: Injection System

**Parent Document:** `specs/implementation-plan-master.md` (v1.0)
**Dependencies:** Phase 1 (Data Layer)
**Outputs Required By:** Phase 4 (Integration)

---

## 1. Overview

This phase implements the Injection System that:
- Extracts TaskProfile from Linear issues
- Selects patterns/principles using tiered algorithm
- Formats warnings for agent prompts
- Computes confidence and injection priority

---

## 2. Deliverables Checklist

- [ ] `src/injection/task-profile-extractor.ts` - TaskProfile from issue
- [ ] `src/injection/selector.ts` - Tiered pattern selection
- [ ] `src/injection/confidence.ts` - Confidence/priority calculation
- [ ] `src/injection/formatter.ts` - Warning markdown generation
- [ ] `tests/injection/task-profile-extractor.test.ts`
- [ ] `tests/injection/selector.test.ts`
- [ ] `tests/injection/confidence.test.ts`

---

## 3. TaskProfile Extraction

### 3.1 Extractor Implementation

```typescript
// File: src/injection/task-profile-extractor.ts
import type { TaskProfile, Touch } from '../schemas';

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
 */
export function extractTaskProfileFromContextPack(metadata: {
  taskProfile?: Partial<TaskProfile>;
  constraintsExtracted?: Array<{ constraint: string; source: unknown }>;
}): TaskProfile {
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
  pattern: PatternDefinition,
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

  // Use severityMax for injection priority (v1.0: reflects worst observed impact)
  return attributionConfidence
    * severityWeight[pattern.severityMax]
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
 * 1. Select up to 2 baseline principles (3 if low confidence taskProfile)
 * 2. Select up to 3 security patterns
 * 3. Fill remaining slots with highest-priority non-security patterns
 * 4. Cap at 6 total for warnings
 * 5. Low-confidence fallback
 * 6. v1.0: Add provisional alerts (ADDITIVE - do not count against maxTotal)
 */
export function selectWarningsForInjection(
  db: Database,
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  maxTotal: number = 6
): InjectionResult {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const alertRepo = new ProvisionalAlertRepository(db);

  const selected: InjectedWarning[] = [];
  const selectedAlerts: InjectedAlert[] = [];

  // ========================================
  // STEP 1: Select baseline principles
  // ========================================

  const maxPrinciples = taskProfile.confidence < 0.5 ? 3 : 2;

  const eligiblePrinciples = principleRepo.findActive({ origin: 'baseline' })
    .filter(p =>
      (p.injectInto === target || p.injectInto === 'both') &&
      p.touches.some(t => taskProfile.touches.includes(t as typeof taskProfile.touches[number]))
    );

  // v1.0: Deterministic tie-breaking for baselines
  // Sort by: touchOverlapCount DESC, id ASC
  const selectedPrinciples = eligiblePrinciples
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
    .slice(0, maxPrinciples)
    .map(x => x.principle);

  for (const principle of selectedPrinciples) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle
    });
  }

  // ========================================
  // STEP 2: Get eligible patterns
  // ========================================

  const allPatterns = patternRepo.findActive({ carrierStage: target });

  // Filter by task profile match
  const matchingPatterns = allPatterns.filter(p =>
    p.touches.some(t => taskProfile.touches.includes(t)) ||
    p.technologies.some(t => taskProfile.technologies.includes(t)) ||
    p.taskTypes.some(t => taskProfile.taskTypes.includes(t))
  );

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
  // STEP 5: Low-confidence fallback
  // ========================================

  if (taskProfile.confidence < 0.5 && selected.length < maxTotal) {
    // Add global high-severity patterns regardless of match
    const globalHighSeverity = allPatterns
      .filter(p =>
        (p.severity === 'CRITICAL' || p.severity === 'HIGH') &&
        !selected.find(s => s.id === p.id)
      )
      .slice(0, 2);

    for (const pattern of globalHighSeverity) {
      if (selected.length >= maxTotal) break;
      const stats = computePatternStats(pattern.id, occurrenceRepo);
      selected.push({
        type: 'pattern',
        id: pattern.id,
        priority: computeInjectionPriority(pattern, taskProfile, stats) * 0.8, // Lower priority
        content: pattern
      });
    }
  }

  // ========================================
  // STEP 6: Add provisional alerts (v1.0)
  // ========================================
  // Alerts are ADDITIVE - they do NOT count against maxTotal
  // This ensures critical real-time warnings are always surfaced
  // NOTE: v1.0 ProvisionalAlert only has 'touches' for filtering (no technologies field)

  const activeAlerts = alertRepo.findActive()
    .filter(alert =>
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
 * See Spec Section 4.3.
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
 * v1.0: InjectionLog records what was injected into a prompt.
 * Used for tracking, debugging, and adherence analysis.
 *
 * NOTE: This schema matches spec-pattern-attribution-v1.0.md Section 2.8
 */
export interface InjectionLog {
  id: string;                           // UUID
  issueId: string;                      // CON-123 (Linear issue ID)
  target: 'context-pack' | 'spec';
  injectedPatterns: string[];           // PatternDefinition IDs
  injectedPrinciples: string[];         // DerivedPrinciple IDs
  injectedAlerts: string[];             // ProvisionalAlert IDs (v1.0)
  taskProfile: TaskProfile;             // Profile used for selection
  injectedAt: string;                   // ISO 8601
}

/**
 * Create an InjectionLog from an injection result (v1.0 schema).
 */
export function createInjectionLog(
  issueId: string,
  target: 'context-pack' | 'spec',
  taskProfile: TaskProfile,
  result: InjectionResult
): InjectionLog {
  return {
    id: crypto.randomUUID(),
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

## 8. Acceptance Criteria

Phase 3 is complete when:

1. [ ] TaskProfile extracted from issue text and labels
2. [ ] Confidence calculation follows spec formula
3. [ ] Injection priority includes severity, relevance, recency
4. [ ] Tiered selection: 2 baseline + up to 4 patterns, capped at 6
5. [ ] Inferred pattern gate enforced
6. [ ] Low-confidence fallback adds global high-severity
7. [ ] Formatted output is readable markdown
8. [ ] v1.0: Provisional alerts included additively (not counted against maxTotal)
9. [ ] v1.0: Conflict precedence enforced (security > privacy > backcompat > correctness)
10. [ ] v1.0: Deterministic tie-breaking implemented
11. [ ] v1.0: InjectionLog includes injectedAlerts array
12. [ ] All tests pass

---

## 9. Handoff to Phase 4

After Phase 3, the following are available:

- `extractTaskProfileFromIssue()` - Extract from Linear issue
- `extractTaskProfileFromContextPack()` - Extract from metadata
- `selectWarningsForInjection()` - Tiered selection (returns `InjectionResult`)
- `formatInjectionForPrompt()` - v1.0: Markdown output with alerts section
- `formatWarningsForInjection()` - Legacy markdown output (deprecated)
- `computeInjectionPriority()` - Priority calculation
- `computePatternStats()` - Pattern statistics
- `resolveConflicts()` - v1.0: Conflict precedence resolution
- `createInjectionLog()` - v1.0: Create log with injectedAlerts

Phase 4 (Integration) will wire these into the workflow hooks.
