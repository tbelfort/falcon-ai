/**
 * Evolution System
 *
 * Public exports for evolution processors.
 * Phase 5: Monitoring & Evolution
 */

export {
  onDocumentChange,
  type DocChange,
  type DocChangeResult,
} from './doc-change-watcher.js';

export {
  processConfidenceDecay,
  processWorkspaceDecay,
  type DecayResult,
} from './decay-processor.js';

export {
  processProvisionalAlertExpiry,
  checkForEarlyPromotion,
  type AlertProcessingResult,
} from './provisional-alert-processor.js';

export {
  detectSalienceIssues,
  type SalienceResult,
} from './salience-detector.js';

export {
  runDailyMaintenance,
  runWorkspaceMaintenance,
  type MaintenanceResult,
} from './scheduler.js';

export {
  analyzeTaggingMisses,
  resolveTaggingMiss,
  getTaggingMissSummary,
  countOccurrences,
  type ResolutionSuggestion,
  type AnalysisResult,
  type ResolutionResult,
} from './tagging-miss-resolver.js';

export {
  checkForPromotion,
  promoteToDerivdPrinciple,
  computeDerivedConfidence,
  checkWorkspaceForPromotions,
  type PromotionResult,
  type PromotionCheckResult,
} from './promotion-checker.js';
