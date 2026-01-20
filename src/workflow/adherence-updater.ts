/**
 * Adherence Updater
 *
 * Updates adherence tracking after PR Review.
 * For each pattern that was injected, checks if a related finding occurred.
 */

import type { Database } from 'better-sqlite3';
import type { FindingCategory, PatternDefinition } from '../schemas/index.js';
import type { ConfirmedFinding, PRReviewResult } from './pr-review-hook.js';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';

export interface AdherenceUpdateResult {
  updated: number;
}

/**
 * Update adherence tracking after PR Review.
 *
 * For each pattern that was injected:
 * - If finding occurred → wasAdheredTo = false
 * - If no finding → pattern was followed (implicit adherence)
 */
export async function updateAdherence(
  db: Database,
  result: PRReviewResult
): Promise<AdherenceUpdateResult> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  let updated = 0;

  // Get all injection logs for this issue
  const logs = injectionLogRepo.findByIssueId({
    workspaceId: result.workspaceId,
    projectId: result.projectId,
    issueId: result.issueId,
  });

  for (const log of logs) {
    // Check each injected pattern
    for (const patternId of log.injectedPatterns) {
      const pattern = patternRepo.findById(patternId);
      if (!pattern) continue;

      // Check if there's a related finding for this pattern
      const hasRelatedFinding = checkForRelatedFinding(pattern, result.confirmedFindings);

      // Find the occurrence (if any) for this pattern + issue
      const occurrence = occurrenceRepo.findByPatternAndIssue({
        workspaceId: result.workspaceId,
        projectId: result.projectId,
        patternId,
        issueId: result.issueId,
      });

      if (occurrence) {
        // Update existing occurrence
        occurrenceRepo.update({
          workspaceId: result.workspaceId,
          id: occurrence.id,
          wasInjected: true,
          wasAdheredTo: !hasRelatedFinding,
        });
        updated++;
      }
      // If no occurrence and no finding, the pattern was followed (no action needed)
      // If has related finding but no occurrence, attribution will create one
    }
  }

  return { updated };
}

/**
 * Check if any finding relates to a pattern.
 * Uses keyword matching and category alignment.
 */
function checkForRelatedFinding(
  pattern: PatternDefinition,
  findings: ConfirmedFinding[]
): boolean {
  // Extract keywords from pattern
  const patternKeywords = extractKeywords(pattern.patternContent);

  for (const finding of findings) {
    // Check category alignment
    const categoryMatch = mapScoutToCategory(finding.scoutType) === pattern.findingCategory;
    if (!categoryMatch) continue;

    // Check keyword overlap
    const findingText = `${finding.title} ${finding.description}`.toLowerCase();
    const keywordMatch = patternKeywords.some((kw) => findingText.includes(kw));

    if (keywordMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Extract keywords from text for matching.
 * Filters words longer than 3 characters.
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/**
 * Map scout type to finding category.
 */
function mapScoutToCategory(scoutType: string): FindingCategory {
  const mapping: Record<string, FindingCategory> = {
    adversarial: 'security',
    security: 'security',
    bugs: 'correctness',
    tests: 'testing',
    docs: 'compliance',
    spec: 'compliance',
    decisions: 'decisions',
  };
  return mapping[scoutType] || 'correctness';
}
