/**
 * Tagging Miss Checker
 *
 * Detects when patterns were attributed but not injected due to TaskProfile mismatch.
 * Creates TaggingMiss records for analysis and improvement.
 */

import type { Database } from 'better-sqlite3';
import type { PatternDefinition, TaskProfile } from '../schemas/index.js';
import type { PRReviewResult } from './pr-review-hook.js';
import type { AttributionResult } from '../attribution/orchestrator.js';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo.js';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo.js';

interface MatchResult {
  matches: boolean;
  missingTags: string[];
}

/**
 * Check for tagging misses after attribution.
 *
 * A tagging miss occurs when:
 * - A pattern was attributed to a finding
 * - But that pattern was NOT injected for this issue
 * - Due to TaskProfile mismatch
 */
export async function checkForTaggingMisses(
  db: Database,
  result: PRReviewResult,
  attributionResults: AttributionResult[]
): Promise<number> {
  const injectionLogRepo = new InjectionLogRepository(db);
  const taggingMissRepo = new TaggingMissRepository(db);

  let missCount = 0;

  // Get injection logs for this issue
  const logs = injectionLogRepo.findByIssueId({
    workspaceId: result.workspaceId,
    projectId: result.projectId,
    issueId: result.issueId,
  });

  const injectedPatternIds = new Set(logs.flatMap((l) => l.injectedPatterns));

  // Get the TaskProfile that was used
  const taskProfile = logs[0]?.taskProfile;
  if (!taskProfile) {
    return 0; // No injection happened
  }

  // Check each attribution result
  for (const attrResult of attributionResults) {
    if (attrResult.type !== 'pattern' || !attrResult.pattern) {
      continue;
    }

    const pattern = attrResult.pattern;

    // Was this pattern injected?
    if (injectedPatternIds.has(pattern.id)) {
      continue; // Not a miss
    }

    // Pattern was NOT injected - check if it would have matched with correct tags
    const wouldMatch = checkWouldMatch(pattern, taskProfile);

    if (!wouldMatch.matches) {
      // This is a tagging miss
      taggingMissRepo.create({
        workspaceId: result.workspaceId,
        projectId: result.projectId,
        findingId: attrResult.occurrence?.findingId ?? 'unknown',
        patternId: pattern.id,
        actualTaskProfile: taskProfile,
        requiredMatch: {
          touches: pattern.touches,
          technologies: pattern.technologies,
          taskTypes: pattern.taskTypes,
        },
        missingTags: wouldMatch.missingTags,
        status: 'pending',
      });

      console.log(
        `[TaggingMiss] Pattern ${pattern.id} not injected for finding - missing tags: ${wouldMatch.missingTags.join(', ')}`
      );

      missCount++;
    }
  }

  return missCount;
}

/**
 * Check if a pattern would match a task profile.
 * Returns matches=true if there's ANY overlap in touches, technologies, or taskTypes.
 */
function checkWouldMatch(pattern: PatternDefinition, taskProfile: TaskProfile): MatchResult {
  const missingTags: string[] = [];

  // Check touches
  const touchOverlap = pattern.touches.some((t) =>
    taskProfile.touches.includes(t as TaskProfile['touches'][number])
  );
  if (!touchOverlap && pattern.touches.length > 0) {
    missingTags.push(...pattern.touches.map((t) => `touch:${t}`));
  }

  // Check technologies
  const techOverlap = pattern.technologies.some((t) => taskProfile.technologies.includes(t));
  if (!techOverlap && pattern.technologies.length > 0) {
    missingTags.push(...pattern.technologies.map((t) => `tech:${t}`));
  }

  // Check taskTypes
  const typeOverlap = pattern.taskTypes.some((t) => taskProfile.taskTypes.includes(t));
  if (!typeOverlap && pattern.taskTypes.length > 0) {
    missingTags.push(...pattern.taskTypes.map((t) => `type:${t}`));
  }

  return {
    matches: touchOverlap || techOverlap || typeOverlap,
    missingTags,
  };
}
