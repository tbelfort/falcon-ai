/**
 * Evolution Scheduler
 *
 * Orchestrates daily maintenance jobs for the pattern attribution system.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { processConfidenceDecay } from './decay-processor.js';
import { processProvisionalAlertExpiry } from './provisional-alert-processor.js';
import { detectSalienceIssues } from './salience-detector.js';
import { KillSwitchService } from '../services/kill-switch.service.js';

export interface MaintenanceResult {
  decayResults: {
    archivedPatterns: number;
    skippedPermanent: number;
  };
  alertResults: {
    expired: number;
    promoted: number;
  };
  salienceResults: {
    newIssues: number;
    existingIssues: number;
  };
  killSwitchResults: {
    resumed: number;
    evaluated: number;
  };
  duration: number;
}

/**
 * Run all daily maintenance jobs for a project.
 */
export function runDailyMaintenance(
  db: Database,
  workspaceId: string,
  projectId: string
): MaintenanceResult {
  const startTime = Date.now();
  const killSwitchService = new KillSwitchService(db);

  // 1. Process confidence decay
  const decayResult = processConfidenceDecay(db, workspaceId, projectId);

  // 2. Process provisional alert expiry/promotion
  const alertResult = processProvisionalAlertExpiry(db, workspaceId, projectId);

  // 3. Detect salience issues
  const salienceResult = detectSalienceIssues(db, workspaceId, projectId);

  // 4. Check for auto-resume of kill switch
  let resumed = 0;
  const dueForResume = killSwitchService.findDueForResumeEvaluation();
  const projectDue = dueForResume.filter(
    (s) => s.workspaceId === workspaceId && s.projectId === projectId
  );

  for (const _status of projectDue) {
    const healthOk = !killSwitchService.evaluateHealth({
      workspaceId,
      projectId,
    });
    if (healthOk) {
      killSwitchService.resume({ workspaceId, projectId }, 'Auto-resume after health improvement');
      resumed++;
    }
  }

  const duration = Date.now() - startTime;

  console.log(`[Scheduler] Daily maintenance completed in ${duration}ms`);
  console.log(`  - Archived ${decayResult.archivedCount} patterns (confidence decay)`);
  console.log(`  - Expired ${alertResult.expired}, promoted ${alertResult.promoted} alerts`);
  console.log(`  - Found ${salienceResult.issuesFound} salience issues`);
  console.log(`  - Resumed ${resumed} kill switches`);

  return {
    decayResults: {
      archivedPatterns: decayResult.archivedCount,
      skippedPermanent: decayResult.skippedPermanent,
    },
    alertResults: {
      expired: alertResult.expired,
      promoted: alertResult.promoted,
    },
    salienceResults: {
      newIssues: salienceResult.newIssueIds.length,
      existingIssues: salienceResult.existingIssueIds.length,
    },
    killSwitchResults: {
      resumed,
      evaluated: projectDue.length,
    },
    duration,
  };
}

/**
 * Run maintenance for all projects in a workspace.
 */
export function runWorkspaceMaintenance(
  db: Database,
  workspaceId: string
): Map<string, MaintenanceResult> {
  const results = new Map<string, MaintenanceResult>();

  // Get all active projects
  const projects = db
    .prepare("SELECT id FROM projects WHERE workspace_id = ? AND status = 'active'")
    .all(workspaceId) as Array<{ id: string }>;

  for (const project of projects) {
    try {
      const result = runDailyMaintenance(db, workspaceId, project.id);
      results.set(project.id, result);
    } catch (error) {
      console.error(`[Scheduler] Error running maintenance for project ${project.id}:`, error);
    }
  }

  return results;
}
