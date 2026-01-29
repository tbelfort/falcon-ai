/**
 * TaskProfile Validator
 *
 * Validates and auto-corrects TaskProfile based on constraint analysis.
 * When constraints mention touches not in the profile, auto-adds them.
 */

import type { TaskProfile, Touch } from '../schemas/index.js';

/**
 * Constraint patterns that indicate specific touches should be present.
 */
const CONSTRAINT_TOUCH_PATTERNS: Array<{
  patterns: RegExp[];
  touch: Touch;
}> = [
  {
    patterns: [
      /\bsql\b/i,
      /\bpostgres\b/i,
      /\bquery\b/i,
      /\bdatabase\b/i,
      /\bdb\b/i,
      /\bmysql\b/i,
      /\bsqlite\b/i,
    ],
    touch: 'database',
  },
  {
    patterns: [
      /\bpermissions?\b/i,
      /\broles?\b/i,
      /\bauthoriz/i,
      /\baccess control\b/i,
      /\brbac\b/i,
      /\bacl\b/i,
    ],
    touch: 'authz',
  },
  {
    patterns: [
      /\bhttp\b/i,
      /\bapi\b/i,
      /\bendpoint\b/i,
      /\brest\b/i,
      /\bgraphql\b/i,
      /\bwebhook\b/i,
      /\bnetwork\b/i,
    ],
    touch: 'network',
  },
];

export interface ValidationResult {
  taskProfile: TaskProfile;
  wasAutoCorrected: boolean;
  addedTouches: Touch[];
  originalConfidence: number;
}

/**
 * Validate and auto-correct TaskProfile based on constraint analysis.
 *
 * If constraints mention obvious touches (SQL/Postgres/query -> database,
 * permissions/roles -> authz, HTTP/API -> network), add them if missing.
 * Lower confidence when auto-correcting.
 */
export function validateTaskProfile(
  taskProfile: TaskProfile,
  constraints: string[]
): ValidationResult {
  const constraintText = constraints.join(' ');
  const addedTouches: Touch[] = [];
  const currentTouches = new Set(taskProfile.touches);

  // Check each constraint pattern
  for (const { patterns, touch } of CONSTRAINT_TOUCH_PATTERNS) {
    // Skip if touch already present
    if (currentTouches.has(touch)) {
      continue;
    }

    // Check if any pattern matches the constraints
    const matches = patterns.some((pattern) => pattern.test(constraintText));
    if (matches) {
      currentTouches.add(touch);
      addedTouches.push(touch);
    }
  }

  const wasAutoCorrected = addedTouches.length > 0;
  const originalConfidence = taskProfile.confidence;

  // Calculate new confidence: reduce by 0.1 for each auto-correction
  // but floor at 0.5
  const newConfidence = wasAutoCorrected
    ? Math.max(0.5, taskProfile.confidence - addedTouches.length * 0.1)
    : taskProfile.confidence;

  return {
    taskProfile: {
      ...taskProfile,
      touches: Array.from(currentTouches) as Touch[],
      confidence: newConfidence,
    },
    wasAutoCorrected,
    addedTouches,
    originalConfidence,
  };
}

/**
 * Helper to extract constraint text from Context Pack metadata.
 */
export function extractConstraintsFromMetadata(metadata: {
  constraintsExtracted?: Array<{ constraint: string }>;
}): string[] {
  if (!metadata.constraintsExtracted) {
    return [];
  }
  return metadata.constraintsExtracted.map((c) => c.constraint);
}
