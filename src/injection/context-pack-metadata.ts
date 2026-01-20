/**
 * Context Pack Metadata Contract
 *
 * This interface is the source of truth for Context Pack generators.
 * The injection system uses this metadata to extract accurate TaskProfiles.
 *
 * COORDINATION NOTE: If you modify this, coordinate with whoever generates Context Packs.
 */

import { z } from 'zod';
import type { TaskProfile } from '../schemas/index.js';

/**
 * Constraint extracted from context sources.
 * Source can be a file path, URL, or structured reference.
 */
export interface ExtractedConstraint {
  constraint: string;
  source: {
    type: 'file' | 'url' | 'linear_doc' | 'inline';
    path?: string;
    url?: string;
    section?: string;
  };
}

export const ExtractedConstraintSchema = z.object({
  constraint: z.string(),
  source: z.object({
    type: z.enum(['file', 'url', 'linear_doc', 'inline']),
    path: z.string().optional(),
    url: z.string().optional(),
    section: z.string().optional(),
  }),
});

/**
 * Context Pack Metadata - The contract for Context Pack → Injection System interop.
 *
 * The Context Pack workflow should output this metadata alongside the Context Pack content.
 * This allows the injection system to:
 * 1. Extract accurate TaskProfile for pattern matching
 * 2. Determine which warnings are relevant to the task
 *
 * GENERATION REQUIREMENTS:
 * - If the Context Pack generator can determine explicit taskProfile values, include them
 * - If not, constraintsExtracted allows the injection system to infer the profile
 * - At minimum, constraintsExtracted SHOULD be populated for inference fallback
 */
export interface ContextPackMetadata {
  /**
   * Explicit TaskProfile if the Context Pack generator can determine it.
   * This is more accurate than inference and should be provided when possible.
   */
  taskProfile?: Partial<TaskProfile>;

  /**
   * Constraints extracted from architecture docs, README, etc.
   * Used for TaskProfile inference if explicit profile not provided.
   * Each constraint includes its source for traceability.
   */
  constraintsExtracted?: ExtractedConstraint[];

  /**
   * Context Pack version/hash for cache invalidation.
   * Optional but recommended for debugging injection issues.
   */
  contentHash?: string;

  /**
   * Timestamp when Context Pack was generated.
   */
  generatedAt?: string;
}

export const ContextPackMetadataSchema = z.object({
  taskProfile: z
    .object({
      touches: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional(),
      taskTypes: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
  constraintsExtracted: z.array(ExtractedConstraintSchema).optional(),
  contentHash: z.string().optional(),
  generatedAt: z.string().optional(),
});

export type ContextPackMetadataInput = z.infer<typeof ContextPackMetadataSchema>;
