/**
 * Injection System
 *
 * Public exports for the injection module.
 * Phase 3: Injection System
 */

// Context Pack Metadata
export {
  type ContextPackMetadata,
  type ExtractedConstraint,
  ContextPackMetadataSchema,
  ExtractedConstraintSchema,
} from './context-pack-metadata.js';

// Task Profile Extraction
export {
  extractTaskProfileFromIssue,
  extractTaskProfileFromContextPack,
  extractTouches,
  extractTechnologies,
  extractTaskTypes,
  type IssueData,
} from './task-profile-extractor.js';

// Confidence and Priority Calculation
export {
  computePatternStats,
  computeAttributionConfidence,
  computeInjectionPriority,
  daysSinceDate,
  type PatternStats,
  type OccurrenceRepoLike,
  type PatternWithCrossProjectMarker,
} from './confidence.js';

// Warning Selection
export {
  selectWarningsForInjection,
  resolveConflicts,
  getCategoryPrecedence,
  type InjectedWarning,
  type InjectedAlert,
  type InjectionResult,
  type SelectWarningsOptions,
} from './selector.js';

// Warning Formatting
export {
  formatInjectionForPrompt,
  formatWarningsForInjection,
  formatWarningsSummary,
  formatInjectionSummary,
} from './formatter.js';

// Kill Switch Integration
export {
  isProvisionalAlertCreationAllowed,
  getKillSwitchStatus,
  getKillSwitchState,
} from './kill-switch-check.js';

// TaskProfile Validation
export {
  validateTaskProfile,
  extractConstraintsFromMetadata,
  type ValidationResult,
} from './task-profile-validator.js';
