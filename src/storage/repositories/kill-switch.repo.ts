/**
 * Kill Switch repository.
 *
 * Manages attribution health monitoring and pattern creation state.
 * Implements Section 11 of the main spec.
 */

import { randomUUID } from 'crypto';
import type {
  KillSwitchStatus,
  AttributionOutcome,
  AttributionHealthMetrics,
  PatternCreationState,
} from '../../schemas/index.js';
import {
  AttributionOutcomeSchema,
  AttributionHealthMetricsSchema,
} from '../../schemas/index.js';
import { BaseRepository } from './base.repo.js';

// Health thresholds from Section 11.3 of main spec
const HEALTH_THRESHOLDS = {
  attributionPrecisionScore: {
    healthy: 0.6,
    warning: 0.4,
    critical: 0.4, // Action: Pause pattern creation
  },
  inferredRatio: {
    healthy: 0.25,
    warning: 0.4,
    critical: 0.4, // Action: Pause inferred patterns only
  },
  observedImprovementRate: {
    healthy: 0.4,
    warning: 0.2,
    critical: 0.2, // Action: Pause all pattern creation
  },
};

// Cooldown periods for state recovery
const COOLDOWN_DAYS = {
  inferred_paused: 7,
  fully_paused: 14,
};

export class KillSwitchRepository extends BaseRepository<KillSwitchStatus> {
  /**
   * Get current kill switch status for a project.
   * Creates default ACTIVE status if not exists.
   */
  getStatus(options: {
    workspaceId: string;
    projectId: string;
  }): KillSwitchStatus {
    const row = this.db
      .prepare(
        `
      SELECT * FROM kill_switch_status
      WHERE workspace_id = ? AND project_id = ?
    `
      )
      .get(options.workspaceId, options.projectId) as
      | Record<string, unknown>
      | undefined;

    if (row) {
      return this.rowToKillSwitchStatus(row);
    }

    // Create default ACTIVE status if not exists
    return this.createDefaultStatus(options);
  }

  /**
   * Create default ACTIVE status.
   */
  private createDefaultStatus(options: {
    workspaceId: string;
    projectId: string;
  }): KillSwitchStatus {
    const now = this.now();
    const id = randomUUID();

    const status: KillSwitchStatus = {
      id,
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      state: 'active',
      reason: null,
      enteredAt: null,
      autoResumeAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `
      INSERT INTO kill_switch_status (
        id, workspace_id, project_id, state, reason,
        entered_at, auto_resume_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        status.id,
        status.workspaceId,
        status.projectId,
        status.state,
        status.reason,
        status.enteredAt,
        status.autoResumeAt,
        status.createdAt,
        status.updatedAt
      );

    return status;
  }

  /**
   * Update kill switch state.
   */
  setStatus(options: {
    workspaceId: string;
    projectId: string;
    state: PatternCreationState;
    reason: string;
    autoResumeAt?: string;
  }): KillSwitchStatus {
    const now = this.now();

    // Ensure row exists
    this.getStatus({
      workspaceId: options.workspaceId,
      projectId: options.projectId,
    });

    this.db
      .prepare(
        `
      UPDATE kill_switch_status
      SET state = ?, reason = ?, entered_at = ?, auto_resume_at = ?, updated_at = ?
      WHERE workspace_id = ? AND project_id = ?
    `
      )
      .run(
        options.state,
        options.reason,
        now,
        options.autoResumeAt ?? null,
        now,
        options.workspaceId,
        options.projectId
      );

    return this.getStatus({
      workspaceId: options.workspaceId,
      projectId: options.projectId,
    });
  }

  /**
   * Record an attribution outcome for health tracking.
   */
  recordOutcome(
    data: Omit<AttributionOutcome, 'id' | 'createdAt' | 'updatedAt'>
  ): AttributionOutcome {
    const now = this.now();
    const id = randomUUID();

    const outcome: AttributionOutcome = {
      id,
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    AttributionOutcomeSchema.parse(outcome);

    this.db
      .prepare(
        `
      INSERT INTO attribution_outcomes (
        id, workspace_id, project_id, issue_key, carrier_quote_type,
        pattern_created, injection_occurred, recurrence_observed,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        outcome.id,
        outcome.workspaceId,
        outcome.projectId,
        outcome.issueKey,
        outcome.carrierQuoteType,
        this.boolToInt(outcome.patternCreated),
        this.boolToInt(outcome.injectionOccurred),
        outcome.recurrenceObserved === null
          ? null
          : this.boolToInt(outcome.recurrenceObserved),
        outcome.createdAt,
        outcome.updatedAt
      );

    return outcome;
  }

  /**
   * Update recurrence observation on an existing outcome.
   */
  updateRecurrence(options: {
    workspaceId: string;
    issueKey: string;
    recurrenceObserved: boolean;
  }): boolean {
    const now = this.now();

    const result = this.db
      .prepare(
        `
      UPDATE attribution_outcomes
      SET recurrence_observed = ?, updated_at = ?
      WHERE workspace_id = ? AND issue_key = ?
    `
      )
      .run(
        this.boolToInt(options.recurrenceObserved),
        now,
        options.workspaceId,
        options.issueKey
      );

    return result.changes > 0;
  }

  /**
   * Compute health metrics for a project (rolling 30-day window).
   */
  computeHealthMetrics(options: {
    workspaceId: string;
    projectId: string;
  }): AttributionHealthMetrics {
    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get aggregated metrics from outcomes table
    const row = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total_attributions,
        SUM(CASE WHEN carrier_quote_type = 'verbatim' THEN 1 ELSE 0 END) as verbatim_attributions,
        SUM(CASE WHEN carrier_quote_type = 'paraphrase' THEN 1 ELSE 0 END) as paraphrase_attributions,
        SUM(CASE WHEN carrier_quote_type = 'inferred' THEN 1 ELSE 0 END) as inferred_attributions,
        SUM(CASE WHEN injection_occurred = 1 AND recurrence_observed = 0 THEN 1 ELSE 0 END) as injections_without_recurrence,
        SUM(CASE WHEN injection_occurred = 1 AND recurrence_observed = 1 THEN 1 ELSE 0 END) as injections_with_recurrence
      FROM attribution_outcomes
      WHERE workspace_id = ? AND project_id = ?
        AND created_at >= ? AND created_at <= ?
    `
      )
      .get(options.workspaceId, options.projectId, windowStart, windowEnd) as Record<
        string,
        number
      >;

    const totalAttributions = row.total_attributions || 0;
    const verbatimAttributions = row.verbatim_attributions || 0;
    const paraphraseAttributions = row.paraphrase_attributions || 0;
    const inferredAttributions = row.inferred_attributions || 0;
    const injectionsWithoutRecurrence = row.injections_without_recurrence || 0;
    const injectionsWithRecurrence = row.injections_with_recurrence || 0;

    const totalInjections = injectionsWithoutRecurrence + injectionsWithRecurrence;

    // Compute health scores
    const attributionPrecisionScore =
      totalAttributions > 0 ? verbatimAttributions / totalAttributions : 1.0;

    const inferredRatio =
      totalAttributions > 0 ? inferredAttributions / totalAttributions : 0.0;

    const observedImprovementRate =
      totalInjections > 0 ? injectionsWithoutRecurrence / totalInjections : 1.0;

    const metrics: AttributionHealthMetrics = {
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      totalAttributions,
      verbatimAttributions,
      paraphraseAttributions,
      inferredAttributions,
      injectionsWithoutRecurrence,
      injectionsWithRecurrence,
      attributionPrecisionScore,
      inferredRatio,
      observedImprovementRate,
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      computedAt: this.now(),
    };

    AttributionHealthMetricsSchema.parse(metrics);
    return metrics;
  }

  /**
   * Evaluate health and return recommended state change (if any).
   */
  evaluateHealth(options: {
    workspaceId: string;
    projectId: string;
  }): { shouldChange: boolean; newState: PatternCreationState; reason: string } | null {
    const metrics = this.computeHealthMetrics(options);
    const currentStatus = this.getStatus(options);

    // Check for critical thresholds
    if (
      metrics.attributionPrecisionScore <
      HEALTH_THRESHOLDS.attributionPrecisionScore.critical
    ) {
      if (currentStatus.state !== 'fully_paused') {
        return {
          shouldChange: true,
          newState: 'fully_paused',
          reason: `attributionPrecisionScore dropped to ${metrics.attributionPrecisionScore.toFixed(2)}`,
        };
      }
    }

    if (
      metrics.observedImprovementRate <
      HEALTH_THRESHOLDS.observedImprovementRate.critical
    ) {
      if (currentStatus.state !== 'fully_paused') {
        return {
          shouldChange: true,
          newState: 'fully_paused',
          reason: `observedImprovementRate dropped to ${metrics.observedImprovementRate.toFixed(2)}`,
        };
      }
    }

    if (metrics.inferredRatio > HEALTH_THRESHOLDS.inferredRatio.critical) {
      if (currentStatus.state === 'active') {
        return {
          shouldChange: true,
          newState: 'inferred_paused',
          reason: `inferredRatio exceeded threshold at ${metrics.inferredRatio.toFixed(2)}`,
        };
      }
    }

    // Check for recovery (metrics healthy + cooldown passed)
    if (currentStatus.state !== 'active') {
      const metricsHealthy =
        metrics.attributionPrecisionScore >=
          HEALTH_THRESHOLDS.attributionPrecisionScore.healthy &&
        metrics.inferredRatio <= HEALTH_THRESHOLDS.inferredRatio.healthy &&
        metrics.observedImprovementRate >=
          HEALTH_THRESHOLDS.observedImprovementRate.healthy;

      if (metricsHealthy && currentStatus.autoResumeAt) {
        const now = new Date();
        const autoResume = new Date(currentStatus.autoResumeAt);
        if (now >= autoResume) {
          return {
            shouldChange: true,
            newState: 'active',
            reason: 'Metrics recovered and cooldown period passed',
          };
        }
      }
    }

    return null;
  }

  /**
   * Get health thresholds (for display/debugging).
   */
  getHealthThresholds(): typeof HEALTH_THRESHOLDS {
    return HEALTH_THRESHOLDS;
  }

  /**
   * Get cooldown days (for display/debugging).
   */
  getCooldownDays(): typeof COOLDOWN_DAYS {
    return COOLDOWN_DAYS;
  }

  /**
   * Compute auto-resume date based on current state.
   */
  computeAutoResumeDate(state: PatternCreationState): string {
    const days =
      state === 'fully_paused'
        ? COOLDOWN_DAYS.fully_paused
        : COOLDOWN_DAYS.inferred_paused;
    const resumeDate = new Date();
    resumeDate.setDate(resumeDate.getDate() + days);
    return resumeDate.toISOString();
  }

  /**
   * Find all projects in a given state.
   */
  findByState(options: {
    workspaceId: string;
    state: PatternCreationState;
  }): KillSwitchStatus[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM kill_switch_status
      WHERE workspace_id = ? AND state = ?
    `
      )
      .all(options.workspaceId, options.state) as Record<string, unknown>[];

    return rows.map((row) => this.rowToKillSwitchStatus(row));
  }

  /**
   * Find all projects due for auto-resume evaluation.
   */
  findDueForResumeEvaluation(): KillSwitchStatus[] {
    const now = this.now();

    const rows = this.db
      .prepare(
        `
      SELECT * FROM kill_switch_status
      WHERE state != 'active'
        AND auto_resume_at IS NOT NULL
        AND auto_resume_at <= ?
    `
      )
      .all(now) as Record<string, unknown>[];

    return rows.map((row) => this.rowToKillSwitchStatus(row));
  }

  /**
   * Convert a database row to a KillSwitchStatus entity.
   */
  private rowToKillSwitchStatus(row: Record<string, unknown>): KillSwitchStatus {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      projectId: row.project_id as string,
      state: row.state as PatternCreationState,
      reason: (row.reason as string) ?? null,
      enteredAt: (row.entered_at as string) ?? null,
      autoResumeAt: (row.auto_resume_at as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
