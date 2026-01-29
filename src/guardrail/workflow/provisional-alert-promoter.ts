/**
 * Provisional Alert Promoter
 *
 * Promotes ProvisionalAlerts to Patterns when pattern gate thresholds are met.
 * Called after new occurrences are created to check if promotion is warranted.
 */

import type { Database } from 'better-sqlite3';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';

/**
 * Pattern gate configuration.
 * A ProvisionalAlert is promoted to a Pattern when it meets these thresholds.
 */
export interface PatternGateConfig {
  minOccurrences: number;
  minUniqueIssues: number;
  minConfidence: number;
  maxDaysOld: number;
}

export const DEFAULT_PATTERN_GATE: PatternGateConfig = {
  minOccurrences: 3,
  minUniqueIssues: 2,
  minConfidence: 0.7,
  maxDaysOld: 90,
};

export interface PromotionResult {
  promoted: boolean;
  alertId: string;
  patternId?: string;
  reason?: string;
}

export interface PromotionScope {
  workspaceId: string;
  projectId: string;
}

/**
 * Check if a ProvisionalAlert should be promoted to a Pattern.
 *
 * Called during occurrence creation to check if the pattern gate is now met.
 */
export function checkAndPromoteAlert(
  db: Database,
  scope: PromotionScope,
  alertId: string,
  config: PatternGateConfig = DEFAULT_PATTERN_GATE
): PromotionResult {
  const alertRepo = new ProvisionalAlertRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  // Get the provisional alert
  const alert = alertRepo.findById(alertId);
  if (!alert) {
    return { promoted: false, alertId, reason: 'Alert not found' };
  }

  // Verify scope matches
  if (alert.workspaceId !== scope.workspaceId) {
    return { promoted: false, alertId, reason: 'Workspace mismatch' };
  }

  // Already promoted?
  if (alert.status === 'promoted') {
    return { promoted: false, alertId, reason: 'Already promoted' };
  }

  // Get all occurrences linked to this alert
  const occurrences = occurrenceRepo.findByProvisionalAlertId({
    workspaceId: scope.workspaceId,
    alertId,
  });

  // Check pattern gate: minimum occurrences
  if (occurrences.length < config.minOccurrences) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient occurrences: ${occurrences.length}/${config.minOccurrences}`,
    };
  }

  // Check pattern gate: unique issues
  const uniqueIssues = new Set(occurrences.map((o) => o.issueId));
  if (uniqueIssues.size < config.minUniqueIssues) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient unique issues: ${uniqueIssues.size}/${config.minUniqueIssues}`,
    };
  }

  // Check pattern gate: average confidence
  // Note: Occurrences don't have a confidence field, so we use attribution confidence
  // For now, we'll assume confidence from evidence quality
  const avgConfidence = computeAverageConfidence(occurrences);
  if (avgConfidence < config.minConfidence) {
    return {
      promoted: false,
      alertId,
      reason: `Insufficient confidence: ${avgConfidence.toFixed(2)}/${config.minConfidence}`,
    };
  }

  // Check pattern gate: age of oldest occurrence
  const oldestOccurrence = occurrences.reduce((oldest, o) =>
    new Date(o.createdAt) < new Date(oldest.createdAt) ? o : oldest
  );
  const daysSinceOldest =
    (Date.now() - new Date(oldestOccurrence.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOldest > config.maxDaysOld) {
    return {
      promoted: false,
      alertId,
      reason: `Occurrences too spread out: ${daysSinceOldest.toFixed(0)} days > ${config.maxDaysOld}`,
    };
  }

  // Pattern gate met - promote the alert
  const pattern = patternRepo.createFromProvisionalAlert({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    alert: {
      findingId: alert.findingId,
      issueId: alert.issueId,
      message: alert.message,
      touches: alert.touches,
      injectInto: alert.injectInto,
    },
    stats: {
      occurrenceCount: occurrences.length,
      uniqueIssueCount: uniqueIssues.size,
      averageConfidence: avgConfidence,
    },
  });

  // Update alert status
  alertRepo.updateStatus({
    workspaceId: scope.workspaceId,
    id: alertId,
    status: 'promoted',
    promotedPatternId: pattern.id,
  });

  // Link occurrences to the new pattern
  for (const occurrence of occurrences) {
    occurrenceRepo.update({
      workspaceId: scope.workspaceId,
      id: occurrence.id,
      patternId: pattern.id,
    });
  }

  console.log(
    `[ProvisionalAlert] Promoted alert ${alertId} to pattern ${pattern.id}` +
      ` (${occurrences.length} occurrences, ${uniqueIssues.size} issues, ${avgConfidence.toFixed(2)} confidence)`
  );

  return {
    promoted: true,
    alertId,
    patternId: pattern.id,
  };
}

/**
 * Hook to call after creating a new occurrence.
 * Checks if any linked ProvisionalAlert should be promoted.
 */
export function onOccurrenceCreated(
  db: Database,
  scope: PromotionScope,
  _occurrenceId: string,
  provisionalAlertId?: string
): PromotionResult | null {
  if (!provisionalAlertId) {
    return null;
  }

  return checkAndPromoteAlert(db, scope, provisionalAlertId);
}

/**
 * Compute average confidence from occurrences.
 * Uses evidence carrierQuoteType as proxy for confidence.
 */
function computeAverageConfidence(
  occurrences: Array<{ evidence: { carrierQuoteType: string } }>
): number {
  if (occurrences.length === 0) return 0;

  const confidenceMap: Record<string, number> = {
    verbatim: 0.9,
    paraphrase: 0.7,
    inferred: 0.5,
  };

  const total = occurrences.reduce((sum, o) => {
    const quoteType = o.evidence?.carrierQuoteType || 'inferred';
    return sum + (confidenceMap[quoteType] || 0.5);
  }, 0);

  return total / occurrences.length;
}
