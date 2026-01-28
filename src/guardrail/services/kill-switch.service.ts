/**
 * Kill Switch Service
 *
 * Service layer wrapping KillSwitchRepository for the Attribution Engine.
 * Phase 2 defines the interface; Phase 4 may extend with additional features.
 *
 * States:
 * - ACTIVE: Normal operation - all patterns created
 * - INFERRED_PAUSED: Skip inferred patterns - only verbatim/paraphrase
 * - FULLY_PAUSED: Log-only mode - no pattern creation
 */

import type { Database } from 'better-sqlite3';
import type {
  PatternCreationState,
  KillSwitchStatus,
  AttributionHealthMetrics,
} from '../schemas/index.js';
import { KillSwitchRepository } from '../storage/repositories/kill-switch.repo.js';

/**
 * Scope for kill switch queries.
 */
export interface Scope {
  workspaceId: string;
  projectId: string;
}

/**
 * Attribution outcome for health tracking.
 */
export interface AttributionOutcomeInput {
  issueKey: string;
  carrierQuoteType: 'verbatim' | 'paraphrase' | 'inferred';
  patternCreated: boolean;
  injectionOccurred: boolean;
  recurrenceObserved: boolean | null;
}

/**
 * Status result with simplified interface.
 */
export interface KillSwitchStatusResult {
  state: PatternCreationState;
  reason: string | null;
  enteredAt: Date | null;
  autoResumeAt: Date | null;
}

/**
 * Kill switch service for managing pattern creation state.
 *
 * This service provides a clean interface for the Attribution Engine to:
 * 1. Check current kill switch state before pattern creation
 * 2. Record attribution outcomes for health metrics
 * 3. Evaluate health and trigger state changes
 */
export class KillSwitchService {
  private repo: KillSwitchRepository;

  constructor(db: Database) {
    this.repo = new KillSwitchRepository(db);
  }

  /**
   * Get current kill switch status for a project.
   */
  getStatus(scope: Scope): KillSwitchStatusResult {
    const status = this.repo.getStatus(scope);
    return {
      state: status.state,
      reason: status.reason,
      enteredAt: status.enteredAt ? new Date(status.enteredAt) : null,
      autoResumeAt: status.autoResumeAt ? new Date(status.autoResumeAt) : null,
    };
  }

  /**
   * Get full kill switch status with all fields.
   */
  getFullStatus(scope: Scope): KillSwitchStatus {
    return this.repo.getStatus(scope);
  }

  /**
   * Record an attribution outcome for health tracking.
   */
  recordAttributionOutcome(scope: Scope, outcome: AttributionOutcomeInput): void {
    this.repo.recordOutcome({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      issueKey: outcome.issueKey,
      carrierQuoteType: outcome.carrierQuoteType,
      patternCreated: outcome.patternCreated,
      injectionOccurred: outcome.injectionOccurred,
      recurrenceObserved: outcome.recurrenceObserved,
    });
  }

  /**
   * Update recurrence observation for an existing outcome.
   */
  updateRecurrence(
    workspaceId: string,
    issueKey: string,
    recurrenceObserved: boolean
  ): boolean {
    return this.repo.updateRecurrence({
      workspaceId,
      issueKey,
      recurrenceObserved,
    });
  }

  /**
   * Evaluate health metrics and update kill switch state if needed.
   * Returns true if state was changed.
   */
  evaluateHealth(scope: Scope): boolean {
    const evaluation = this.repo.evaluateHealth(scope);

    if (evaluation?.shouldChange) {
      const autoResumeAt = evaluation.newState !== 'active'
        ? this.repo.computeAutoResumeDate(evaluation.newState)
        : undefined;

      this.repo.setStatus({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        state: evaluation.newState,
        reason: evaluation.reason,
        autoResumeAt,
      });

      console.log(`[KillSwitch] State changed to ${evaluation.newState}: ${evaluation.reason}`);
      return true;
    }

    return false;
  }

  /**
   * Get current health metrics for a project.
   */
  getHealthMetrics(scope: Scope): AttributionHealthMetrics {
    return this.repo.computeHealthMetrics(scope);
  }

  /**
   * Manually set kill switch state (for CLI/admin use).
   */
  setStatus(
    scope: Scope,
    state: PatternCreationState,
    reason: string
  ): KillSwitchStatus {
    const autoResumeAt = state !== 'active'
      ? this.repo.computeAutoResumeDate(state)
      : undefined;

    return this.repo.setStatus({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      state,
      reason,
      autoResumeAt,
    });
  }

  /**
   * Resume pattern creation (set state to active).
   */
  resume(scope: Scope, reason: string = 'Manual resume'): KillSwitchStatus {
    return this.repo.setStatus({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      state: 'active',
      reason,
    });
  }

  /**
   * Pause pattern creation (set state to fully_paused).
   */
  pause(scope: Scope, reason: string = 'Manual pause'): KillSwitchStatus {
    return this.repo.setStatus({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      state: 'fully_paused',
      reason,
      autoResumeAt: this.repo.computeAutoResumeDate('fully_paused'),
    });
  }

  /**
   * Pause only inferred patterns.
   */
  pauseInferred(scope: Scope, reason: string = 'Manual pause of inferred patterns'): KillSwitchStatus {
    return this.repo.setStatus({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      state: 'inferred_paused',
      reason,
      autoResumeAt: this.repo.computeAutoResumeDate('inferred_paused'),
    });
  }

  /**
   * Find all projects due for auto-resume evaluation.
   */
  findDueForResumeEvaluation(): KillSwitchStatus[] {
    return this.repo.findDueForResumeEvaluation();
  }

  /**
   * Get health thresholds for display.
   */
  getHealthThresholds() {
    return this.repo.getHealthThresholds();
  }
}

// Re-export PatternCreationState enum values for convenience
export { PatternCreationState } from '../schemas/index.js';
