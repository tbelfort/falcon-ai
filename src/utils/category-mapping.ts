/**
 * Scout Type to Finding Category Mapping
 *
 * Shared utility for mapping PR review scout types to pattern finding categories.
 * Used by attribution orchestrator and adherence updater.
 */

import type { FindingCategory } from '../schemas/index.js';

/**
 * Mapping from scout type to finding category.
 * Scout types are from the PR review process, categories are for pattern classification.
 */
const SCOUT_TO_CATEGORY_MAPPING: Record<string, FindingCategory> = {
  adversarial: 'security',
  security: 'security',
  bugs: 'correctness',
  tests: 'testing',
  docs: 'compliance',
  spec: 'compliance',
  decisions: 'decisions',
};

/**
 * Default category when scout type is not recognized.
 */
const DEFAULT_CATEGORY: FindingCategory = 'correctness';

/**
 * Map a scout type to its corresponding finding category.
 *
 * @param scoutType - The type of scout that found the issue
 * @returns The corresponding finding category, or 'correctness' as default
 */
export function mapScoutToCategory(scoutType: string): FindingCategory {
  return SCOUT_TO_CATEGORY_MAPPING[scoutType] ?? DEFAULT_CATEGORY;
}

/**
 * Get all known scout types.
 */
export function getKnownScoutTypes(): string[] {
  return Object.keys(SCOUT_TO_CATEGORY_MAPPING);
}

/**
 * Check if a scout type is known.
 */
export function isKnownScoutType(scoutType: string): boolean {
  return scoutType in SCOUT_TO_CATEGORY_MAPPING;
}
