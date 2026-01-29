/**
 * Tagging Miss Resolver
 *
 * Analyzes tagging misses and provides resolution suggestions.
 * Part of Phase 5: Monitoring & Evolution.
 *
 * Per Spec Section 8.2, resolution actions include:
 * - Broaden pattern tags
 * - Improve task profile extraction
 * - Mark as false positive
 */

import type { Database } from 'better-sqlite3';
import type { TaggingMiss, PatternDefinition } from '../schemas/index.js';
import { TaggingMissRepository } from '../storage/repositories/tagging-miss.repo.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';

/**
 * Resolution suggestion for a tagging miss.
 */
export interface ResolutionSuggestion {
  taggingMiss: TaggingMiss;
  suggestions: Array<{
    action: 'broaden_pattern' | 'improve_extraction' | 'false_positive';
    description: string;
    changes?: Partial<PatternDefinition>;
  }>;
}

/**
 * Analysis result for a project's tagging misses.
 */
export interface AnalysisResult {
  totalPending: number;
  byPattern: Map<string, ResolutionSuggestion[]>;
  frequentMissingTags: Map<string, number>;
}

/**
 * Result of applying a resolution.
 */
export interface ResolutionResult {
  success: boolean;
  taggingMissId: string;
  resolution: 'broadened_pattern' | 'improved_extraction' | 'false_positive';
  patternUpdated: boolean;
}

/**
 * Count occurrences of items in an array.
 */
export function countOccurrences<T extends string>(arr: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

/**
 * Analyze pending tagging misses for a project.
 *
 * Groups misses by pattern and computes tag frequency to suggest
 * which patterns should be broadened.
 */
export function analyzeTaggingMisses(
  db: Database,
  workspaceId: string,
  projectId: string
): AnalysisResult {
  const taggingMissRepo = new TaggingMissRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const pendingMisses = taggingMissRepo.findPending({ workspaceId, projectId });

  const byPattern = new Map<string, ResolutionSuggestion[]>();
  const allMissingTags: string[] = [];

  for (const miss of pendingMisses) {
    // Collect all missing tags for frequency analysis
    allMissingTags.push(...miss.missingTags);

    // Get pattern details
    const pattern = patternRepo.findById(miss.patternId);

    // Generate suggestions
    const suggestions = generateSuggestions(miss, pattern);

    const patternSuggestions = byPattern.get(miss.patternId) ?? [];
    patternSuggestions.push({ taggingMiss: miss, suggestions });
    byPattern.set(miss.patternId, patternSuggestions);
  }

  // Compute frequent missing tags
  const frequentMissingTags = countOccurrences(allMissingTags);

  return {
    totalPending: pendingMisses.length,
    byPattern,
    frequentMissingTags,
  };
}

/**
 * Generate resolution suggestions for a tagging miss.
 */
function generateSuggestions(
  miss: TaggingMiss,
  pattern: PatternDefinition | null
): ResolutionSuggestion['suggestions'] {
  const suggestions: ResolutionSuggestion['suggestions'] = [];

  // Parse missing tags to determine what's missing
  const missingTouches = miss.missingTags
    .filter((t) => t.startsWith('touch:'))
    .map((t) => t.replace('touch:', ''));
  const missingTech = miss.missingTags
    .filter((t) => t.startsWith('tech:'))
    .map((t) => t.replace('tech:', ''));
  const missingTypes = miss.missingTags
    .filter((t) => t.startsWith('type:'))
    .map((t) => t.replace('type:', ''));

  // Suggest broadening pattern if pattern exists
  if (pattern) {
    // Check if touches should be broadened
    if (missingTouches.length > 0) {
      // Look for overlapping touches from actual task profile
      const actualTouches = miss.actualTaskProfile.touches;
      const touchesToAdd = actualTouches.filter(
        (t) => !pattern.touches.includes(t) && missingTouches.some((mt) => mt !== t)
      );

      if (touchesToAdd.length > 0 || missingTouches.length > 0) {
        suggestions.push({
          action: 'broaden_pattern',
          description: `Add touches [${missingTouches.join(', ')}] to pattern to match tasks like this`,
          changes: {
            touches: [...new Set([...pattern.touches, ...actualTouches])],
          },
        });
      }
    }

    // Check if technologies should be broadened
    if (missingTech.length > 0) {
      const actualTech = miss.actualTaskProfile.technologies;
      suggestions.push({
        action: 'broaden_pattern',
        description: `Add technologies [${missingTech.join(', ')}] to pattern`,
        changes: {
          technologies: [...new Set([...pattern.technologies, ...actualTech])],
        },
      });
    }

    // Check if task types should be broadened
    if (missingTypes.length > 0) {
      const actualTypes = miss.actualTaskProfile.taskTypes;
      suggestions.push({
        action: 'broaden_pattern',
        description: `Add task types [${missingTypes.join(', ')}] to pattern`,
        changes: {
          taskTypes: [...new Set([...pattern.taskTypes, ...actualTypes])],
        },
      });
    }
  }

  // Always suggest improve extraction as an option
  suggestions.push({
    action: 'improve_extraction',
    description: `Improve TaskProfile extraction to detect [${miss.missingTags.join(', ')}]`,
  });

  // Always offer false positive option
  suggestions.push({
    action: 'false_positive',
    description: 'Mark as false positive - pattern would not have prevented the issue',
  });

  return suggestions;
}

/**
 * Resolve a tagging miss with the specified resolution.
 *
 * If resolution is 'broadened_pattern', optionally apply pattern changes.
 */
export function resolveTaggingMiss(
  db: Database,
  id: string,
  resolution: 'broadened_pattern' | 'improved_extraction' | 'false_positive',
  patternChanges?: Partial<PatternDefinition>
): ResolutionResult {
  const taggingMissRepo = new TaggingMissRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const miss = taggingMissRepo.findById(id);
  if (!miss) {
    return {
      success: false,
      taggingMissId: id,
      resolution,
      patternUpdated: false,
    };
  }

  let patternUpdated = false;

  // Apply pattern changes if broadening
  if (resolution === 'broadened_pattern' && patternChanges) {
    const pattern = patternRepo.findById(miss.patternId);
    if (pattern) {
      patternRepo.update(pattern.id, patternChanges);
      patternUpdated = true;
      console.log(
        `[TaggingMissResolver] Broadened pattern ${pattern.id} with changes:`,
        Object.keys(patternChanges)
      );
    }
  }

  // Mark the miss as resolved
  taggingMissRepo.resolve({ id, resolution });

  console.log(`[TaggingMissResolver] Resolved tagging miss ${id} as ${resolution}`);

  return {
    success: true,
    taggingMissId: id,
    resolution,
    patternUpdated,
  };
}

/**
 * Get summary statistics for tagging misses.
 */
export function getTaggingMissSummary(
  db: Database,
  workspaceId: string,
  projectId: string
): {
  pending: number;
  resolved: number;
  byResolution: Map<string, number>;
} {
  const taggingMissRepo = new TaggingMissRepository(db);

  const allMisses = taggingMissRepo.findByProject({ workspaceId, projectId });

  const pending = allMisses.filter((m) => m.status === 'pending').length;
  const resolved = allMisses.filter((m) => m.status === 'resolved').length;

  const byResolution = new Map<string, number>();
  for (const miss of allMisses) {
    if (miss.resolution) {
      byResolution.set(miss.resolution, (byResolution.get(miss.resolution) ?? 0) + 1);
    }
  }

  return { pending, resolved, byResolution };
}
