/**
 * Salience Detector
 *
 * Detects guidance that is being ignored repeatedly.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { SalienceIssueRepository } from '../storage/repositories/salience-issue.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';

export interface SalienceResult {
  issuesFound: number;
  newIssueIds: string[];
  existingIssueIds: string[];
}

/**
 * Threshold for salience issue detection.
 * If a pattern is ignored 3+ times in 30 days, flag it.
 */
const SALIENCE_THRESHOLD = 3;
const SALIENCE_WINDOW_DAYS = 30;

/**
 * Detect patterns that are being ignored repeatedly.
 *
 * When guidance is ignored 3+ times in 30 days, create a SalienceIssue
 * for human review. The guidance may be unclear, incorrect, or stale.
 */
export function detectSalienceIssues(
  db: Database,
  workspaceId: string,
  projectId: string
): SalienceResult {
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const salienceRepo = new SalienceIssueRepository(db);

  const newIssueIds: string[] = [];
  const existingIssueIds: string[] = [];

  // Get all active patterns
  const patterns = patternRepo.findActive({ workspaceId, projectId });

  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SALIENCE_WINDOW_DAYS);
  const windowStart = thirtyDaysAgo.toISOString();

  for (const pattern of patterns) {
    // Get recent occurrences where warning was injected but not adhered to
    const occurrences = occurrenceRepo.findByPatternId({
      workspaceId,
      patternId: pattern.id,
    });

    const recentViolations = occurrences.filter(
      (o) =>
        o.createdAt >= windowStart &&
        o.wasInjected === true &&
        o.wasAdheredTo === false
    );

    if (recentViolations.length >= SALIENCE_THRESHOLD) {
      // Look for existing salience issue matching this pattern's guidance
      const patternHash = salienceRepo.computeLocationHash(
        pattern.carrierStage,
        pattern.patternContent.substring(0, 100),
        pattern.patternContent
      );

      const activeIssue = salienceRepo.findByLocationHash({
        workspaceId,
        projectId,
        hash: patternHash,
      });

      if (activeIssue && activeIssue.status === 'pending') {
        // Update existing issue via upsert
        const updatedIssue = salienceRepo.update(activeIssue.id, {
          occurrenceCount: recentViolations.length,
        });
        if (updatedIssue) {
          existingIssueIds.push(activeIssue.id);
        }
      } else if (!activeIssue) {
        // Create new salience issue via upsert
        // Note: noncomplianceIds is provided for type satisfaction but overwritten by upsert
        const issue = salienceRepo.upsert(
          {
            workspaceId,
            projectId,
            guidanceStage: pattern.carrierStage,
            guidanceLocation: pattern.patternContent.substring(0, 100),
            guidanceExcerpt: pattern.patternContent,
            occurrenceCount: recentViolations.length,
            windowDays: SALIENCE_WINDOW_DAYS,
            noncomplianceIds: [],
            status: 'pending',
          },
          recentViolations[0].id // Link to first violation (occurrence ID used as reference)
        );
        newIssueIds.push(issue.id);
        console.log(
          `[SalienceDetector] Created salience issue ${issue.id} for pattern ${pattern.id} ` +
            `(${recentViolations.length} violations in ${SALIENCE_WINDOW_DAYS} days)`
        );
      }
    }
  }

  return {
    issuesFound: newIssueIds.length + existingIssueIds.length,
    newIssueIds,
    existingIssueIds,
  };
}
