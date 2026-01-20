/**
 * Confidence Decay Processor
 *
 * Archives patterns that have fallen below confidence threshold.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { computePatternStats, computeAttributionConfidence } from '../injection/confidence.js';

export interface DecayResult {
  archivedCount: number;
  archivedPatternIds: string[];
  skippedPermanent: number;
}

/**
 * Minimum confidence threshold for patterns to remain active.
 * Patterns below this threshold are archived.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.2;

/**
 * Process confidence decay for all patterns in a project.
 *
 * Patterns with confidence below threshold are archived. Permanent patterns
 * and patterns with recent occurrences are skipped.
 */
export function processConfidenceDecay(
  db: Database,
  workspaceId: string,
  projectId: string
): DecayResult {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  // Wrap in transaction for atomicity - either all archives succeed or none
  return db.transaction(() => {
    const activePatterns = patternRepo.findActive({ workspaceId, projectId });
    const archivedPatternIds: string[] = [];
    let skippedPermanent = 0;

    for (const pattern of activePatterns) {
      // Skip permanent patterns
      if (pattern.permanent) {
        skippedPermanent++;
        continue;
      }

      // Compute current stats and confidence
      const occurrences = occurrenceRepo.findByPatternId({ workspaceId, patternId: pattern.id });
      const stats = computePatternStats(pattern.id, {
        findByPatternId: () => occurrences,
      });
      const confidence = computeAttributionConfidence(pattern, stats);

      // Archive if below threshold
      if (confidence < MIN_CONFIDENCE_THRESHOLD) {
        patternRepo.archive(pattern.id);
        archivedPatternIds.push(pattern.id);
        console.log(
          `[DecayProcessor] Archived pattern ${pattern.id} (confidence: ${(confidence * 100).toFixed(1)}%)`
        );
      }
    }

    return {
      archivedCount: archivedPatternIds.length,
      archivedPatternIds,
      skippedPermanent,
    };
  })();
}

/**
 * Process decay for all projects in a workspace.
 */
export function processWorkspaceDecay(
  db: Database,
  workspaceId: string
): Map<string, DecayResult> {
  const results = new Map<string, DecayResult>();

  // Get all active projects
  const projects = db
    .prepare("SELECT id FROM projects WHERE workspace_id = ? AND status = 'active'")
    .all(workspaceId) as Array<{ id: string }>;

  for (const project of projects) {
    const result = processConfidenceDecay(db, workspaceId, project.id);
    results.set(project.id, result);
  }

  return results;
}
