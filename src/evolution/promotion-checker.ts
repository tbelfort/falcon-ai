/**
 * Pattern-to-DerivedPrinciple Promotion Checker
 *
 * Checks if patterns qualify for promotion to workspace-level derived principles.
 * Part of Phase 5: Monitoring & Evolution.
 *
 * Promotion criteria:
 * - Pattern appears in 3+ projects within workspace
 * - Severity is HIGH or CRITICAL
 * - Category is security (security patterns prioritized for promotion)
 */

import type { Database } from 'better-sqlite3';
import type { PatternDefinition, Touch } from '../schemas/index.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo.js';
import { computePatternStats, computeAttributionConfidence } from '../injection/confidence.js';

export interface PromotionResult {
  promoted: boolean;
  derivedPrincipleId?: string;
  reason: string;
}

export interface PromotionCheckResult {
  qualifies: boolean;
  projectCount: number;
  averageConfidence: number;
  reason: string;
}

/**
 * Minimum projects required for promotion.
 */
const MIN_PROJECTS_FOR_PROMOTION = 3;

/**
 * Minimum confidence for derived principle.
 */
const MIN_DERIVED_CONFIDENCE = 0.6;

/**
 * Project count boost factor for confidence calculation.
 * Each additional project beyond minimum adds this to confidence.
 */
const PROJECT_COUNT_BOOST = 0.05;

/**
 * Maximum project count boost.
 */
const MAX_PROJECT_BOOST = 0.15;

/**
 * Check if a pattern qualifies for promotion to derived principle.
 */
export function checkForPromotion(
  db: Database,
  pattern: PatternDefinition
): PromotionCheckResult {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  // Patterns are always project-scoped, extract workspaceId
  const workspaceId = pattern.scope.workspaceId;

  // Check project count
  const projectCount = patternRepo.countDistinctProjects({
    workspaceId,
    patternKey: pattern.patternKey,
  });

  if (projectCount < MIN_PROJECTS_FOR_PROMOTION) {
    return {
      qualifies: false,
      projectCount,
      averageConfidence: 0,
      reason: `Insufficient project coverage (${projectCount}/${MIN_PROJECTS_FOR_PROMOTION})`,
    };
  }

  // Check severity
  if (pattern.severityMax !== 'HIGH' && pattern.severityMax !== 'CRITICAL') {
    return {
      qualifies: false,
      projectCount,
      averageConfidence: 0,
      reason: `Severity too low (${pattern.severityMax})`,
    };
  }

  // Prioritize security patterns
  if (pattern.findingCategory !== 'security') {
    return {
      qualifies: false,
      projectCount,
      averageConfidence: 0,
      reason: `Non-security patterns not eligible for promotion (category: ${pattern.findingCategory})`,
    };
  }

  // Compute average confidence across all matching patterns
  const matchingPatterns = findMatchingPatternsAcrossProjects(db, workspaceId, pattern.patternKey);
  const averageConfidence = computeDerivedConfidence(
    matchingPatterns,
    projectCount,
    db,
    occurrenceRepo
  );

  if (averageConfidence < MIN_DERIVED_CONFIDENCE) {
    return {
      qualifies: false,
      projectCount,
      averageConfidence,
      reason: `Insufficient confidence (${(averageConfidence * 100).toFixed(1)}%/${(MIN_DERIVED_CONFIDENCE * 100).toFixed(1)}%)`,
    };
  }

  return {
    qualifies: true,
    projectCount,
    averageConfidence,
    reason: `Pattern qualifies: ${projectCount} projects, ${(averageConfidence * 100).toFixed(1)}% confidence`,
  };
}

/**
 * Promote a pattern to a derived principle.
 */
export function promoteToDerivdPrinciple(
  db: Database,
  pattern: PatternDefinition,
  options?: { force?: boolean }
): PromotionResult {
  const principleRepo = new DerivedPrincipleRepository(db);

  // Patterns are always project-scoped, extract workspaceId
  const workspaceId = pattern.scope.workspaceId;

  // Check qualification unless forced
  if (!options?.force) {
    const check = checkForPromotion(db, pattern);
    if (!check.qualifies) {
      return {
        promoted: false,
        reason: check.reason,
      };
    }
  }

  // Compute promotion key for idempotency
  const promotionKey = DerivedPrincipleRepository.computePromotionKey({
    workspaceId,
    patternKey: pattern.patternKey,
    carrierStage: pattern.carrierStage,
    findingCategory: pattern.findingCategory,
  });

  // Check if already promoted
  const existing = principleRepo.findByPromotionKey({ workspaceId, promotionKey });
  if (existing) {
    return {
      promoted: false,
      derivedPrincipleId: existing.id,
      reason: 'Already promoted',
    };
  }

  // Compute confidence for the derived principle
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);
  const matchingPatterns = findMatchingPatternsAcrossProjects(db, workspaceId, pattern.patternKey);
  const projectCount = patternRepo.countDistinctProjects({
    workspaceId,
    patternKey: pattern.patternKey,
  });
  const confidence = computeDerivedConfidence(matchingPatterns, projectCount, db, occurrenceRepo);

  // Create derived principle
  const principle = principleRepo.create({
    scope: { level: 'workspace', workspaceId },
    principle: `Avoid: ${pattern.patternContent}`,
    rationale: `Observed in ${projectCount} projects. ${pattern.alternative}`,
    origin: 'derived',
    derivedFrom: matchingPatterns.map((p) => p.id),
    injectInto: pattern.carrierStage === 'context-pack' ? 'context-pack' : 'spec',
    touches: pattern.touches as Touch[],
    technologies: pattern.technologies,
    taskTypes: pattern.taskTypes,
    confidence,
    status: 'active',
    permanent: false,
    promotionKey,
  });

  console.log(
    `[PromotionChecker] Promoted pattern ${pattern.id} to derived principle ${principle.id} ` +
      `(${projectCount} projects, ${(confidence * 100).toFixed(1)}% confidence)`
  );

  return {
    promoted: true,
    derivedPrincipleId: principle.id,
    reason: `Promoted to workspace-level principle`,
  };
}

/**
 * Find all patterns matching a patternKey across all projects in workspace.
 */
function findMatchingPatternsAcrossProjects(
  db: Database,
  workspaceId: string,
  patternKey: string
): PatternDefinition[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM pattern_definitions
    WHERE workspace_id = ? AND pattern_key = ? AND status = 'active'
  `
    )
    .all(workspaceId, patternKey) as Array<Record<string, unknown>>;

  // Convert rows to PatternDefinition objects
  const patternRepo = new PatternDefinitionRepository(db);
  return rows.map((row) => patternRepo.findById(row.id as string)!);
}

/**
 * Compute confidence for a derived principle from multiple patterns.
 * Includes project count boost.
 */
export function computeDerivedConfidence(
  patterns: PatternDefinition[],
  projectCount: number,
  _db: Database,
  occurrenceRepo: PatternOccurrenceRepository
): number {
  if (patterns.length === 0) {
    return 0;
  }

  // Compute average confidence across all patterns
  let totalConfidence = 0;
  for (const pattern of patterns) {
    // Patterns are always project-scoped, extract workspaceId
    const workspaceId = pattern.scope.workspaceId;

    const occurrences = occurrenceRepo.findByPatternId({
      workspaceId,
      patternId: pattern.id,
    });

    const stats = computePatternStats(pattern.id, {
      findByPatternId: () => occurrences,
    });

    totalConfidence += computeAttributionConfidence(pattern, stats);
  }

  const averageConfidence = totalConfidence / patterns.length;

  // Add project count boost
  const extraProjects = Math.max(0, projectCount - MIN_PROJECTS_FOR_PROMOTION);
  const projectBoost = Math.min(extraProjects * PROJECT_COUNT_BOOST, MAX_PROJECT_BOOST);

  return Math.min(1.0, averageConfidence + projectBoost);
}

/**
 * Check all patterns in a workspace for promotion eligibility.
 */
export function checkWorkspaceForPromotions(
  db: Database,
  workspaceId: string
): Array<{
  patternKey: string;
  projectCount: number;
  result: PromotionCheckResult;
}> {
  const results: Array<{
    patternKey: string;
    projectCount: number;
    result: PromotionCheckResult;
  }> = [];

  // Get all unique patternKeys in the workspace
  const patternKeys = db
    .prepare(
      `
    SELECT DISTINCT pattern_key
    FROM pattern_definitions
    WHERE workspace_id = ? AND status = 'active'
  `
    )
    .all(workspaceId) as Array<{ pattern_key: string }>;

  const patternRepo = new PatternDefinitionRepository(db);

  for (const { pattern_key: patternKey } of patternKeys) {
    const projectCount = patternRepo.countDistinctProjects({ workspaceId, patternKey });

    // Only check patterns that appear in 3+ projects
    if (projectCount >= MIN_PROJECTS_FOR_PROMOTION) {
      // Get a representative pattern for checking
      const representative = db
        .prepare(
          `
        SELECT id FROM pattern_definitions
        WHERE workspace_id = ? AND pattern_key = ? AND status = 'active'
        LIMIT 1
      `
        )
        .get(workspaceId, patternKey) as { id: string } | undefined;

      if (representative) {
        const pattern = patternRepo.findById(representative.id);
        if (pattern) {
          const result = checkForPromotion(db, pattern);
          results.push({ patternKey, projectCount, result });
        }
      }
    }
  }

  return results;
}
