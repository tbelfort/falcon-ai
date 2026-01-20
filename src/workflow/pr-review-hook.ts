/**
 * PR Review Hook
 *
 * Hook called AFTER PR review completes.
 * Triggers attribution for confirmed findings and updates adherence tracking.
 */

import type { Database } from 'better-sqlite3';
import type { DocFingerprint, FindingCategory, Severity } from '../schemas/index.js';
import {
  AttributionOrchestrator,
  type AttributionResult,
  type AttributionInput,
} from '../attribution/orchestrator.js';
import { updateAdherence } from './adherence-updater.js';
import { checkForTaggingMisses } from './tagging-miss-checker.js';
import { onOccurrenceCreated } from './provisional-alert-promoter.js';

export interface ConfirmedFinding {
  id: string;
  scoutType: string;
  title: string;
  description: string;
  severity: Severity;
  category: FindingCategory;
  evidence?: string;
  location?: {
    file: string;
    line?: number;
  };
}

/**
 * PR Review result with scope information.
 */
export interface PRReviewResult {
  workspaceId: string;
  projectId: string;
  prNumber: number;
  issueId: string;
  confirmedFindings: ConfirmedFinding[];
}

/**
 * Document context for attribution.
 */
export interface DocumentContext {
  content: string;
  fingerprint: DocFingerprint;
}

export interface PRReviewHookOutput {
  attributionResults: AttributionResult[];
  taggingMisses: number;
  summary: {
    patterns: number;
    noncompliances: number;
    docUpdates: number;
    promotions: number;
  };
}

/**
 * Hook called AFTER PR Review completes.
 *
 * Triggers attribution for all confirmed findings.
 * Fingerprints are passed through from DocumentContext, not inferred here.
 */
export async function onPRReviewComplete(
  db: Database,
  result: PRReviewResult,
  contextPack: DocumentContext,
  spec: DocumentContext
): Promise<PRReviewHookOutput> {
  const orchestrator = new AttributionOrchestrator(db);
  const attributionResults: AttributionResult[] = [];
  let promotionCount = 0;

  // Process each confirmed finding
  for (const finding of result.confirmedFindings) {
    try {
      const attributionInput: AttributionInput = {
        workspaceId: result.workspaceId,
        projectId: result.projectId,
        finding: {
          id: finding.id,
          issueId: result.issueId,
          prNumber: result.prNumber,
          scoutType: finding.scoutType,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          evidence: finding.evidence || finding.description,
          location: finding.location || { file: 'unknown' },
        },
        contextPack: {
          content: contextPack.content,
          fingerprint: contextPack.fingerprint,
        },
        spec: {
          content: spec.content,
          fingerprint: spec.fingerprint,
        },
      };

      const attributionResult = await orchestrator.attributeFinding(attributionInput);
      attributionResults.push(attributionResult);

      // Check for provisional alert promotion if an occurrence was created
      if (attributionResult.occurrence?.provisionalAlertId) {
        const promotionResult = onOccurrenceCreated(
          db,
          { workspaceId: result.workspaceId, projectId: result.projectId },
          attributionResult.occurrence.id,
          attributionResult.occurrence.provisionalAlertId
        );
        if (promotionResult?.promoted) {
          promotionCount++;
          console.log(
            `[PRReviewHook] Promoted alert ${promotionResult.alertId} to pattern ${promotionResult.patternId}`
          );
        }
      }

      console.log(
        `[Attribution] Finding ${finding.id}: ${attributionResult.type}` +
          (attributionResult.resolverResult
            ? ` (${attributionResult.resolverResult.failureMode})`
            : '')
      );
    } catch (error) {
      console.error(`[Attribution] Failed for finding ${finding.id}:`, error);
    }
  }

  // Update adherence tracking
  await updateAdherence(db, result);

  // Check for tagging misses
  const taggingMisses = await checkForTaggingMisses(db, result, attributionResults);

  // Build summary
  const summary = {
    patterns: attributionResults.filter((r) => r.type === 'pattern').length,
    noncompliances: attributionResults.filter((r) => r.type === 'noncompliance').length,
    docUpdates: attributionResults.filter((r) => r.docUpdateRequest).length,
    promotions: promotionCount,
  };

  return {
    attributionResults,
    taggingMisses,
    summary,
  };
}
