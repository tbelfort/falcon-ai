/**
 * Kill Switch Integration for Injection System
 *
 * Provides utilities for checking kill switch state during injection.
 * The injection system always injects existing patterns/alerts regardless
 * of kill switch state - only new pattern creation is gated.
 */

import type { Database } from 'better-sqlite3';
import { KillSwitchRepository } from '../storage/repositories/kill-switch.repo.js';
import type { PatternCreationState, KillSwitchStatus } from '../schemas/index.js';

export type { PatternCreationState, KillSwitchStatus };

/**
 * Check if ProvisionalAlert creation is allowed for the given project.
 * Returns false if kill switch is in INFERRED_PAUSED or FULLY_PAUSED state.
 *
 * NOTE: This is used by the Attribution Agent (Phase 2), not the Injection System.
 * The Injection System always injects existing alerts regardless of kill switch state.
 */
export function isProvisionalAlertCreationAllowed(
  db: Database,
  workspaceId: string,
  projectId: string
): boolean {
  const killSwitchRepo = new KillSwitchRepository(db);
  const status = killSwitchRepo.getStatus({ workspaceId, projectId });

  // Only ACTIVE state allows new alert creation
  return status.state === 'active';
}

/**
 * Get the current kill switch status for a project.
 * Used for logging and observability.
 */
export function getKillSwitchStatus(
  db: Database,
  workspaceId: string,
  projectId: string
): KillSwitchStatus {
  const killSwitchRepo = new KillSwitchRepository(db);
  return killSwitchRepo.getStatus({ workspaceId, projectId });
}

/**
 * Get kill switch state string for a project.
 * Convenience function for logging.
 */
export function getKillSwitchState(
  db: Database,
  workspaceId: string,
  projectId: string
): PatternCreationState {
  const status = getKillSwitchStatus(db, workspaceId, projectId);
  return status.state;
}
