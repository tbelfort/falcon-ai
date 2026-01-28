/**
 * Metrics Collector
 *
 * Collects attribution and injection metrics for monitoring.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { KillSwitchService } from '../services/kill-switch.service.js';

export interface MetricsSnapshot {
  timestamp: string;
  scope: {
    workspaceId: string;
    projectId: string;
  };
  attribution: {
    totalPatterns: number;
    activePatterns: number;
    archivedPatterns: number;
    totalOccurrences: number;
    activeOccurrences: number;
    verbatimPatterns: number;
    paraphrasePatterns: number;
    inferredPatterns: number;
  };
  injection: {
    totalInjections: number;
    contextPackInjections: number;
    specInjections: number;
    averageWarningsPerInjection: number;
    uniquePatternsInjected: number;
  };
  health: {
    attributionPrecisionScore: number | null;
    inferredRatio: number | null;
    observedImprovementRate: number | null;
    killSwitchState: string;
  };
  principles: {
    totalBaselines: number;
    totalDerived: number;
    activeBaselines: number;
    activeDerived: number;
  };
  alerts: {
    activeAlerts: number;
    expiredAlerts: number;
    promotedAlerts: number;
  };
  salience: {
    openIssues: number;
    resolvedIssues: number;
  };
}

interface CountResult {
  count: number;
}

interface AvgResult {
  avg: number | null;
}

interface UniqueResult {
  unique_count: number;
}

/**
 * Collect comprehensive metrics for a project.
 */
export function collectMetrics(
  db: Database,
  workspaceId: string,
  projectId: string
): MetricsSnapshot {
  const killSwitchService = new KillSwitchService(db);
  const healthMetrics = killSwitchService.getHealthMetrics({ workspaceId, projectId });
  const killSwitchStatus = killSwitchService.getStatus({ workspaceId, projectId });

  // Attribution metrics
  const totalPatterns = db
    .prepare(
      'SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ?'
    )
    .get(workspaceId, projectId) as CountResult;

  const activePatterns = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = 'active'"
    )
    .get(workspaceId, projectId) as CountResult;

  const archivedPatterns = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND status = 'archived'"
    )
    .get(workspaceId, projectId) as CountResult;

  const totalOccurrences = db
    .prepare(
      'SELECT COUNT(*) as count FROM pattern_occurrences WHERE workspace_id = ? AND project_id = ?'
    )
    .get(workspaceId, projectId) as CountResult;

  const activeOccurrences = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_occurrences WHERE workspace_id = ? AND project_id = ? AND status = 'active'"
    )
    .get(workspaceId, projectId) as CountResult;

  const verbatimPatterns = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND primary_carrier_quote_type = 'verbatim'"
    )
    .get(workspaceId, projectId) as CountResult;

  const paraphrasePatterns = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND primary_carrier_quote_type = 'paraphrase'"
    )
    .get(workspaceId, projectId) as CountResult;

  const inferredPatterns = db
    .prepare(
      "SELECT COUNT(*) as count FROM pattern_definitions WHERE workspace_id = ? AND project_id = ? AND primary_carrier_quote_type = 'inferred'"
    )
    .get(workspaceId, projectId) as CountResult;

  // Injection metrics
  const totalInjections = db
    .prepare(
      'SELECT COUNT(*) as count FROM injection_logs WHERE workspace_id = ? AND project_id = ?'
    )
    .get(workspaceId, projectId) as CountResult;

  const contextPackInjections = db
    .prepare(
      "SELECT COUNT(*) as count FROM injection_logs WHERE workspace_id = ? AND project_id = ? AND target = 'context-pack'"
    )
    .get(workspaceId, projectId) as CountResult;

  const specInjections = db
    .prepare(
      "SELECT COUNT(*) as count FROM injection_logs WHERE workspace_id = ? AND project_id = ? AND target = 'spec'"
    )
    .get(workspaceId, projectId) as CountResult;

  // Average warnings calculation - need to parse JSON array
  const avgWarnings = db
    .prepare(
      `
      SELECT AVG(
        json_array_length(injected_patterns) +
        json_array_length(injected_principles) +
        json_array_length(injected_alerts)
      ) as avg
      FROM injection_logs
      WHERE workspace_id = ? AND project_id = ?
    `
    )
    .get(workspaceId, projectId) as AvgResult;

  // Unique patterns injected
  const uniquePatternsInjected = db
    .prepare(
      `
      SELECT COUNT(DISTINCT pattern_id) as unique_count
      FROM (
        SELECT json_each.value as pattern_id
        FROM injection_logs, json_each(injected_patterns)
        WHERE workspace_id = ? AND project_id = ?
      )
    `
    )
    .get(workspaceId, projectId) as UniqueResult;

  // Principles metrics (workspace-scoped)
  const totalBaselines = db
    .prepare(
      "SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = 'baseline'"
    )
    .get(workspaceId) as CountResult;

  const totalDerived = db
    .prepare(
      "SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = 'derived'"
    )
    .get(workspaceId) as CountResult;

  const activeBaselines = db
    .prepare(
      "SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = 'baseline' AND status = 'active'"
    )
    .get(workspaceId) as CountResult;

  const activeDerived = db
    .prepare(
      "SELECT COUNT(*) as count FROM derived_principles WHERE workspace_id = ? AND origin = 'derived' AND status = 'active'"
    )
    .get(workspaceId) as CountResult;

  // Alerts metrics
  const activeAlerts = db
    .prepare(
      "SELECT COUNT(*) as count FROM provisional_alerts WHERE workspace_id = ? AND project_id = ? AND status = 'active'"
    )
    .get(workspaceId, projectId) as CountResult;

  const expiredAlerts = db
    .prepare(
      "SELECT COUNT(*) as count FROM provisional_alerts WHERE workspace_id = ? AND project_id = ? AND status = 'expired'"
    )
    .get(workspaceId, projectId) as CountResult;

  const promotedAlerts = db
    .prepare(
      "SELECT COUNT(*) as count FROM provisional_alerts WHERE workspace_id = ? AND project_id = ? AND status = 'promoted'"
    )
    .get(workspaceId, projectId) as CountResult;

  // Salience metrics
  const openSalienceIssues = db
    .prepare(
      "SELECT COUNT(*) as count FROM salience_issues WHERE workspace_id = ? AND project_id = ? AND status = 'open'"
    )
    .get(workspaceId, projectId) as CountResult;

  const resolvedSalienceIssues = db
    .prepare(
      "SELECT COUNT(*) as count FROM salience_issues WHERE workspace_id = ? AND project_id = ? AND status = 'resolved'"
    )
    .get(workspaceId, projectId) as CountResult;

  return {
    timestamp: new Date().toISOString(),
    scope: { workspaceId, projectId },
    attribution: {
      totalPatterns: totalPatterns.count,
      activePatterns: activePatterns.count,
      archivedPatterns: archivedPatterns.count,
      totalOccurrences: totalOccurrences.count,
      activeOccurrences: activeOccurrences.count,
      verbatimPatterns: verbatimPatterns.count,
      paraphrasePatterns: paraphrasePatterns.count,
      inferredPatterns: inferredPatterns.count,
    },
    injection: {
      totalInjections: totalInjections.count,
      contextPackInjections: contextPackInjections.count,
      specInjections: specInjections.count,
      averageWarningsPerInjection: avgWarnings.avg ?? 0,
      uniquePatternsInjected: uniquePatternsInjected.unique_count,
    },
    health: {
      attributionPrecisionScore: healthMetrics.attributionPrecisionScore,
      inferredRatio: healthMetrics.inferredRatio,
      observedImprovementRate: healthMetrics.observedImprovementRate,
      killSwitchState: killSwitchStatus.state,
    },
    principles: {
      totalBaselines: totalBaselines.count,
      totalDerived: totalDerived.count,
      activeBaselines: activeBaselines.count,
      activeDerived: activeDerived.count,
    },
    alerts: {
      activeAlerts: activeAlerts.count,
      expiredAlerts: expiredAlerts.count,
      promotedAlerts: promotedAlerts.count,
    },
    salience: {
      openIssues: openSalienceIssues.count,
      resolvedIssues: resolvedSalienceIssues.count,
    },
  };
}
