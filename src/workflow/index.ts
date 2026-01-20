/**
 * Workflow Integration
 *
 * Public exports for workflow hooks.
 * Phase 4: Integration & Workflow
 */

export {
  beforeContextPackAgent,
  buildContextPackPrompt,
  type ContextPackHookInput,
  type ContextPackHookOutput,
} from './context-pack-hook.js';

export {
  beforeSpecAgent,
  buildSpecPrompt,
  type SpecHookInput,
  type SpecHookOutput,
} from './spec-hook.js';

export {
  onPRReviewComplete,
  type PRReviewHookOutput,
  type PRReviewResult,
  type ConfirmedFinding,
  type DocumentContext,
} from './pr-review-hook.js';

export { updateAdherence, type AdherenceUpdateResult } from './adherence-updater.js';

export { checkForTaggingMisses } from './tagging-miss-checker.js';

export {
  checkAndPromoteAlert,
  onOccurrenceCreated,
  type PatternGateConfig,
  type PromotionResult,
  type PromotionScope,
  DEFAULT_PATTERN_GATE,
} from './provisional-alert-promoter.js';
