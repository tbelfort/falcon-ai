/**
 * Provisional Alert Processor
 *
 * Handles expiration and promotion of provisional alerts.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';

export interface AlertProcessingResult {
  expired: number;
  promoted: number;
  promotedAlertIds: string[];
  expiredAlertIds: string[];
}

/**
 * Minimum occurrences for promotion.
 */
const PROMOTION_THRESHOLD = 2;

/**
 * Process expired provisional alerts.
 *
 * Alerts past their TTL (14 days) are marked as expired.
 */
export function processProvisionalAlertExpiry(
  db: Database,
  workspaceId: string,
  projectId: string
): AlertProcessingResult {
  const alertRepo = new ProvisionalAlertRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);

  const expiredAlertIds: string[] = [];
  const promotedAlertIds: string[] = [];

  // Find expired alerts
  const expiredAlerts = alertRepo.findExpired();
  const projectAlerts = expiredAlerts.filter(
    (a) => a.workspaceId === workspaceId && a.projectId === projectId
  );

  for (const alert of projectAlerts) {
    // Check if should promote before expiring
    const occurrences = occurrenceRepo.findByProvisionalAlertId({
      workspaceId,
      alertId: alert.id,
    });

    if (occurrences.length >= PROMOTION_THRESHOLD) {
      // Promote to pattern
      const pattern = patternRepo.createFromProvisionalAlert({
        workspaceId,
        projectId,
        alert: {
          findingId: alert.findingId,
          issueId: alert.issueId,
          message: alert.message,
          touches: alert.touches,
          injectInto: alert.injectInto,
        },
        stats: {
          occurrenceCount: occurrences.length,
          uniqueIssueCount: new Set(occurrences.map((o) => o.issueId)).size,
          averageConfidence: 0.6, // Default for promoted alerts
        },
      });

      // Update alert and occurrences
      alertRepo.promote(alert.id, pattern.id);
      for (const occurrence of occurrences) {
        occurrenceRepo.update({
          workspaceId,
          id: occurrence.id,
          patternId: pattern.id,
        });
      }

      promotedAlertIds.push(alert.id);
      console.log(
        `[AlertProcessor] Promoted alert ${alert.id} to pattern ${pattern.id} ` +
          `(${occurrences.length} occurrences)`
      );
    } else {
      // Just expire
      alertRepo.expire(alert.id);
      expiredAlertIds.push(alert.id);
      console.log(
        `[AlertProcessor] Expired alert ${alert.id} (${occurrences.length} occurrences)`
      );
    }
  }

  return {
    expired: expiredAlertIds.length,
    promoted: promotedAlertIds.length,
    promotedAlertIds,
    expiredAlertIds,
  };
}

/**
 * Check if an alert should be promoted (for early promotion before expiry).
 */
export function checkForEarlyPromotion(
  db: Database,
  workspaceId: string,
  alertId: string
): boolean {
  const alertRepo = new ProvisionalAlertRepository(db);
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const patternRepo = new PatternDefinitionRepository(db);

  const alert = alertRepo.findById(alertId);
  if (!alert || alert.status !== 'active') {
    return false;
  }

  const occurrences = occurrenceRepo.findByProvisionalAlertId({
    workspaceId,
    alertId,
  });

  if (occurrences.length >= PROMOTION_THRESHOLD) {
    // Promote early
    const pattern = patternRepo.createFromProvisionalAlert({
      workspaceId,
      projectId: alert.projectId,
      alert: {
        findingId: alert.findingId,
        issueId: alert.issueId,
        message: alert.message,
        touches: alert.touches,
        injectInto: alert.injectInto,
      },
      stats: {
        occurrenceCount: occurrences.length,
        uniqueIssueCount: new Set(occurrences.map((o) => o.issueId)).size,
        averageConfidence: 0.6,
      },
    });

    alertRepo.promote(alert.id, pattern.id);
    for (const occurrence of occurrences) {
      occurrenceRepo.update({
        workspaceId,
        id: occurrence.id,
        patternId: pattern.id,
      });
    }

    console.log(`[AlertProcessor] Early promotion of alert ${alertId} to pattern ${pattern.id}`);
    return true;
  }

  return false;
}
