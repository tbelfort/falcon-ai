/**
 * Metrics Reporter
 *
 * Formats metrics for display and export.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { MetricsSnapshot } from './collector.js';

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

/**
 * Format metrics as human-readable console output.
 */
export function formatMetricsReport(metrics: MetricsSnapshot): string {
  const lines: string[] = [];

  lines.push(colors.bold + 'Falcon AI Metrics Report' + colors.reset);
  lines.push(`Generated: ${metrics.timestamp}`);
  lines.push('');

  // Attribution section
  lines.push(colors.cyan + '📊 Attribution Metrics' + colors.reset);
  lines.push(`  Total Patterns: ${metrics.attribution.totalPatterns}`);
  lines.push(
    `    Active: ${metrics.attribution.activePatterns} | Archived: ${metrics.attribution.archivedPatterns}`
  );
  lines.push(`  Total Occurrences: ${metrics.attribution.totalOccurrences}`);
  lines.push(`    Active: ${metrics.attribution.activeOccurrences}`);
  lines.push('  Pattern Types:');
  lines.push(`    Verbatim: ${metrics.attribution.verbatimPatterns}`);
  lines.push(`    Paraphrase: ${metrics.attribution.paraphrasePatterns}`);
  lines.push(`    Inferred: ${metrics.attribution.inferredPatterns}`);
  lines.push('');

  // Injection section
  lines.push(colors.cyan + '💉 Injection Metrics' + colors.reset);
  lines.push(`  Total Injections: ${metrics.injection.totalInjections}`);
  lines.push(
    `    Context Pack: ${metrics.injection.contextPackInjections} | Spec: ${metrics.injection.specInjections}`
  );
  lines.push(
    `  Avg Warnings/Injection: ${metrics.injection.averageWarningsPerInjection.toFixed(1)}`
  );
  lines.push(`  Unique Patterns Injected: ${metrics.injection.uniquePatternsInjected}`);
  lines.push('');

  // Health section
  const precisionColor = getHealthColor(metrics.health.attributionPrecisionScore, 0.6, true);
  const inferredColor = getHealthColor(metrics.health.inferredRatio, 0.25, false);
  const improvementColor = getHealthColor(metrics.health.observedImprovementRate, 0.4, true);

  lines.push(colors.cyan + '❤️ Health Metrics' + colors.reset);
  lines.push(
    `  Precision Rate: ${precisionColor}${(metrics.health.attributionPrecisionScore * 100).toFixed(1)}%${colors.reset}`
  );
  lines.push(
    `  Inferred Rate: ${inferredColor}${(metrics.health.inferredRatio * 100).toFixed(1)}%${colors.reset}`
  );
  lines.push(
    `  Improvement Rate: ${improvementColor}${(metrics.health.observedImprovementRate * 100).toFixed(1)}%${colors.reset}`
  );
  lines.push(`  Kill Switch: ${getKillSwitchColor(metrics.health.killSwitchState)}${metrics.health.killSwitchState}${colors.reset}`);
  lines.push('');

  // Principles section
  lines.push(colors.cyan + '📜 Principles' + colors.reset);
  lines.push(
    `  Baselines: ${metrics.principles.activeBaselines}/${metrics.principles.totalBaselines} active`
  );
  lines.push(
    `  Derived: ${metrics.principles.activeDerived}/${metrics.principles.totalDerived} active`
  );
  lines.push('');

  // Alerts section
  lines.push(colors.cyan + '⚠️ Provisional Alerts' + colors.reset);
  lines.push(`  Active: ${metrics.alerts.activeAlerts}`);
  lines.push(
    `  Expired: ${metrics.alerts.expiredAlerts} | Promoted: ${metrics.alerts.promotedAlerts}`
  );
  lines.push('');

  // Salience section
  lines.push(colors.cyan + '🔍 Salience Issues' + colors.reset);
  lines.push(
    `  Open: ${metrics.salience.openIssues} | Resolved: ${metrics.salience.resolvedIssues}`
  );

  return lines.join('\n');
}

/**
 * Format metrics as JSON for export.
 */
export function formatMetricsJson(metrics: MetricsSnapshot): string {
  return JSON.stringify(metrics, null, 2);
}

/**
 * Format metrics as CSV row.
 */
export function formatMetricsCsv(metrics: MetricsSnapshot): string {
  const values = [
    metrics.timestamp,
    metrics.scope.workspaceId,
    metrics.scope.projectId,
    metrics.attribution.totalPatterns,
    metrics.attribution.activePatterns,
    metrics.attribution.totalOccurrences,
    metrics.health.attributionPrecisionScore,
    metrics.health.inferredRatio,
    metrics.health.observedImprovementRate,
    metrics.health.killSwitchState,
    metrics.alerts.activeAlerts,
    metrics.salience.openIssues,
  ];

  return values.join(',');
}

/**
 * Get CSV headers.
 */
export function getMetricsCsvHeaders(): string {
  return [
    'timestamp',
    'workspace_id',
    'project_id',
    'total_patterns',
    'active_patterns',
    'total_occurrences',
    'precision_rate',
    'inferred_rate',
    'improvement_rate',
    'kill_switch_state',
    'active_alerts',
    'open_salience_issues',
  ].join(',');
}

/**
 * Format a compact summary line.
 */
export function formatMetricsSummary(metrics: MetricsSnapshot): string {
  return (
    `Patterns: ${metrics.attribution.activePatterns} | ` +
    `Injections: ${metrics.injection.totalInjections} | ` +
    `Precision: ${(metrics.health.attributionPrecisionScore * 100).toFixed(0)}% | ` +
    `Health: ${metrics.health.killSwitchState}`
  );
}

function getHealthColor(value: number, threshold: number, higherIsBetter: boolean): string {
  if (higherIsBetter) {
    if (value >= threshold) return colors.green;
    if (value >= threshold - 0.1) return colors.yellow;
    return colors.red;
  } else {
    if (value <= threshold) return colors.green;
    if (value <= threshold + 0.1) return colors.yellow;
    return colors.red;
  }
}

function getKillSwitchColor(state: string): string {
  switch (state) {
    case 'active':
      return colors.green;
    case 'inferred_paused':
      return colors.yellow;
    case 'fully_paused':
      return colors.red;
    default:
      return colors.dim;
  }
}
