/**
 * Tiered Warning Selector
 *
 * Implements tiered selection algorithm for injection warnings.
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
 */

import type { Database } from 'better-sqlite3';
import type {
  PatternDefinition,
  DerivedPrinciple,
  TaskProfile,
  ProvisionalAlert,
  Touch,
  Severity,
} from '../schemas/index.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo.js';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo.js';
import { ProjectRepository } from '../storage/repositories/project.repo.js';
import {
  computeInjectionPriority,
  computePatternStats,
  daysSinceDate,
  type PatternStats,
  type PatternWithCrossProjectMarker,
} from './confidence.js';

export interface InjectedWarning {
  type: 'pattern' | 'principle';
  id: string;
  priority: number;
  content: PatternDefinition | DerivedPrinciple;
}

export interface InjectedAlert {
  type: 'alert';
  id: string;
  priority: number;
  content: ProvisionalAlert;
}

export interface InjectionResult {
  warnings: InjectedWarning[];
  alerts: InjectedAlert[];
}

export interface SelectWarningsOptions {
  workspaceId: string;
  projectId: string;
  target: 'context-pack' | 'spec';
  taskProfile: TaskProfile;
  maxWarnings?: number;
  crossProjectWarnings?: boolean;
}

/**
 * Select warnings for injection using tiered algorithm.
 */
export function selectWarningsForInjection(
  db: Database,
  options: SelectWarningsOptions
): InjectionResult {
  const {
    workspaceId,
    projectId,
    target,
    taskProfile,
    maxWarnings: maxTotal = 6,
    crossProjectWarnings = false,
  } = options;

  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const principleRepo = new DerivedPrincipleRepository(db);
  const alertRepo = new ProvisionalAlertRepository(db);
  const projectRepo = new ProjectRepository(db);

  const selected: InjectedWarning[] = [];
  const selectedAlerts: InjectedAlert[] = [];

  // PRE-CHECK: Verify project is active
  const project = projectRepo.findById({ workspaceId, id: projectId });
  if (!project || project.status === 'archived') {
    return { warnings: [], alerts: [] };
  }

  // ========================================
  // STEP 1: Select baseline principles (WORKSPACE level)
  // ========================================
  const maxBaselines = taskProfile.confidence < 0.5 ? 2 : 1;

  const eligibleBaselines = principleRepo
    .findActive({ workspaceId, origin: 'baseline' })
    .filter(
      (p) =>
        (p.injectInto === target || p.injectInto === 'both') &&
        p.touches.some((t) => taskProfile.touches.includes(t as Touch))
    );

  // Deterministic tie-breaking: touchOverlapCount DESC, id ASC
  const selectedBaselines = eligibleBaselines
    .map((p) => ({
      principle: p,
      touchOverlapCount: p.touches.filter((t) =>
        taskProfile.touches.includes(t as Touch)
      ).length,
    }))
    .sort((a, b) => {
      if (b.touchOverlapCount !== a.touchOverlapCount) {
        return b.touchOverlapCount - a.touchOverlapCount;
      }
      return a.principle.id.localeCompare(b.principle.id);
    })
    .slice(0, maxBaselines)
    .map((x) => x.principle);

  for (const principle of selectedBaselines) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle,
    });
  }

  // ========================================
  // STEP 1.5: Select derived principles (WORKSPACE level)
  // ========================================
  const derivedPrinciples = principleRepo
    .findActive({ workspaceId, origin: 'derived' })
    .filter(
      (p) =>
        (p.injectInto === target || p.injectInto === 'both') &&
        p.touches.some((t) => taskProfile.touches.includes(t as Touch))
    );

  // Sort by: touchOverlap DESC, confidence DESC, updatedAt DESC, id ASC
  const selectedDerived = derivedPrinciples
    .map((p) => ({
      principle: p,
      touchOverlapCount: p.touches.filter((t) =>
        taskProfile.touches.includes(t as Touch)
      ).length,
    }))
    .sort((a, b) => {
      if (b.touchOverlapCount !== a.touchOverlapCount) {
        return b.touchOverlapCount - a.touchOverlapCount;
      }
      if (b.principle.confidence !== a.principle.confidence) {
        return b.principle.confidence - a.principle.confidence;
      }
      const aTime = new Date(a.principle.updatedAt).getTime();
      const bTime = new Date(b.principle.updatedAt).getTime();
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      return a.principle.id.localeCompare(b.principle.id);
    })
    .slice(0, 1)
    .map((x) => x.principle);

  for (const principle of selectedDerived) {
    selected.push({
      type: 'principle',
      id: principle.id,
      priority: principle.confidence,
      content: principle,
    });
  }

  // ========================================
  // STEP 2: Get eligible patterns (PROJECT level)
  // ========================================
  const allPatterns = patternRepo.findActive({
    workspaceId,
    projectId,
    carrierStage: target,
  });

  // Filter by task profile match
  let matchingPatterns: PatternWithCrossProjectMarker[] = allPatterns.filter(
    (p) =>
      p.touches.some((t) => taskProfile.touches.includes(t)) ||
      p.technologies.some((t) => taskProfile.technologies.includes(t)) ||
      p.taskTypes.some((t) => taskProfile.taskTypes.includes(t))
  );

  // ========================================
  // STEP 2.5: Optional cross-project patterns
  // ========================================
  if (crossProjectWarnings) {
    const crossProjectPatterns = patternRepo.findCrossProject({
      workspaceId,
      excludeProjectId: projectId,
      carrierStage: target,
      minSeverity: 'HIGH',
      findingCategory: 'security',
    });

    // Relevance gate: require touchOverlap >= 2 OR (touchOverlap >= 1 AND techOverlap >= 1)
    // This prevents cross-project warnings from firing on only tech overlap without any touch context
    const relevantCrossPatterns = crossProjectPatterns.filter((p) => {
      const touchOverlap = p.touches.filter((t) =>
        taskProfile.touches.includes(t)
      ).length;
      const techOverlap = p.technologies.filter((t) =>
        taskProfile.technologies.includes(t)
      ).length;
      return touchOverlap >= 2 || (touchOverlap >= 1 && techOverlap >= 1);
    });

    // Deduplication: if same patternKey exists in current project, skip
    const existingPatternKeys = new Set(matchingPatterns.map((p) => p.patternKey));
    const deduplicatedCrossPatterns = relevantCrossPatterns.filter(
      (p) => !existingPatternKeys.has(p.patternKey)
    );

    // Mark as cross-project for penalty in priority calculation
    const markedCrossPatterns = deduplicatedCrossPatterns.map((p) => ({
      ...p,
      _crossProjectPenalty: true as const,
    }));

    matchingPatterns = [...matchingPatterns, ...markedCrossPatterns];
  }

  // Apply inferred gate
  const gatedPatterns = matchingPatterns.filter((p) =>
    meetsInferredGate(p, workspaceId, occurrenceRepo)
  );

  // Compute priorities and stats for deterministic sorting
  const patternsWithPriority = gatedPatterns.map((p) => {
    const stats = computePatternStatsForPattern(p.id, workspaceId, occurrenceRepo);
    return {
      pattern: p,
      priority: computeInjectionPriority(p, taskProfile, stats),
      stats,
    };
  });

  // ========================================
  // STEP 3: Select security patterns first
  // ========================================
  const severityOrder: Record<Severity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const securityPatterns = patternsWithPriority
    .filter(({ pattern }) => pattern.findingCategory === 'security')
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const sevDiff =
        severityOrder[b.pattern.severityMax] - severityOrder[a.pattern.severityMax];
      if (sevDiff !== 0) return sevDiff;
      const aDays = a.stats.lastSeenActive
        ? daysSinceDate(a.stats.lastSeenActive)
        : Infinity;
      const bDays = b.stats.lastSeenActive
        ? daysSinceDate(b.stats.lastSeenActive)
        : Infinity;
      if (aDays !== bDays) return aDays - bDays;
      return a.pattern.id.localeCompare(b.pattern.id);
    })
    .slice(0, 3);

  for (const { pattern, priority } of securityPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern,
    });
  }

  // ========================================
  // STEP 4: Fill remaining with non-security
  // ========================================
  const remainingSlots = maxTotal - selected.length;
  const selectedPatternIds = new Set(
    selected.filter((s) => s.type === 'pattern').map((s) => s.id)
  );

  const otherPatterns = patternsWithPriority
    .filter(
      ({ pattern }) =>
        pattern.findingCategory !== 'security' && !selectedPatternIds.has(pattern.id)
    )
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const sevDiff =
        severityOrder[b.pattern.severityMax] - severityOrder[a.pattern.severityMax];
      if (sevDiff !== 0) return sevDiff;
      const aDays = a.stats.lastSeenActive
        ? daysSinceDate(a.stats.lastSeenActive)
        : Infinity;
      const bDays = b.stats.lastSeenActive
        ? daysSinceDate(b.stats.lastSeenActive)
        : Infinity;
      if (aDays !== bDays) return aDays - bDays;
      return a.pattern.id.localeCompare(b.pattern.id);
    })
    .slice(0, remainingSlots);

  for (const { pattern, priority } of otherPatterns) {
    selected.push({
      type: 'pattern',
      id: pattern.id,
      priority,
      content: pattern,
    });
  }

  // ========================================
  // STEP 5: Low-confidence fallback
  // ========================================
  if (taskProfile.confidence < 0.5 && selected.length < maxTotal) {
    const projectHighSeverity = allPatterns
      .filter(
        (p) =>
          (p.severityMax === 'CRITICAL' || p.severityMax === 'HIGH') &&
          !selected.find((s) => s.id === p.id)
      )
      .slice(0, 2);

    for (const pattern of projectHighSeverity) {
      if (selected.length >= maxTotal) break;
      const stats = computePatternStatsForPattern(pattern.id, workspaceId, occurrenceRepo);
      selected.push({
        type: 'pattern',
        id: pattern.id,
        priority: computeInjectionPriority(pattern, taskProfile, stats) * 0.8,
        content: pattern,
      });
    }
  }

  // ========================================
  // STEP 6: Add provisional alerts (additive)
  // ========================================
  const now = new Date().toISOString();
  const activeAlerts = alertRepo
    .findActive({ workspaceId, projectId })
    .filter(
      (alert) =>
        alert.expiresAt > now &&
        alert.touches.some((t) => taskProfile.touches.includes(t)) &&
        (alert.injectInto === target || alert.injectInto === 'both')
    );

  // Sort by creation time (more recent first)
  const sortedAlerts = activeAlerts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const alert of sortedAlerts) {
    selectedAlerts.push({
      type: 'alert',
      id: alert.id,
      priority: 0.9,
      content: alert,
    });
  }

  return { warnings: selected, alerts: selectedAlerts };
}

/**
 * Check if pattern meets inferred gate for injection.
 */
function meetsInferredGate(
  pattern: PatternDefinition,
  workspaceId: string,
  occurrenceRepo: PatternOccurrenceRepository
): boolean {
  if (pattern.primaryCarrierQuoteType !== 'inferred') {
    return true;
  }

  const stats = computePatternStatsForPattern(pattern.id, workspaceId, occurrenceRepo);

  // 2+ occurrences
  if (stats.activeOccurrences >= 2) {
    return true;
  }

  // High severityMax + baseline alignment
  if (
    (pattern.severityMax === 'HIGH' || pattern.severityMax === 'CRITICAL') &&
    pattern.alignedBaselineId
  ) {
    return true;
  }

  // missing_reference failure mode
  if (pattern.failureMode === 'missing_reference') {
    return true;
  }

  return false;
}

/**
 * Compute pattern stats for a pattern (wrapper for occurrence repo).
 */
function computePatternStatsForPattern(
  patternId: string,
  workspaceId: string,
  occurrenceRepo: PatternOccurrenceRepository
): PatternStats {
  const occurrences = occurrenceRepo.findByPatternId({ workspaceId, patternId });
  return computePatternStats(patternId, {
    findByPatternId: () => occurrences,
  });
}

// ============================================
// CONFLICT RESOLUTION
// ============================================

const CATEGORY_PRECEDENCE: Record<string, number> = {
  security: 5,
  privacy: 4,
  backcompat: 3,
  correctness: 2,
};

export function getCategoryPrecedence(category: string): number {
  return CATEGORY_PRECEDENCE[category] ?? 1;
}

export function resolveConflicts<
  T extends { id: string; content: { findingCategory?: string } },
>(items: T[], getConflictKey: (item: T) => string | null): T[] {
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
    const sorted = group.sort((a, b) => {
      const precA = getCategoryPrecedence(a.content.findingCategory || '');
      const precB = getCategoryPrecedence(b.content.findingCategory || '');
      return precB - precA;
    });
    resolved.push(sorted[0]);
  }

  return resolved;
}
