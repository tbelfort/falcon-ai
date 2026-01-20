/**
 * falcon health command.
 *
 * Shows 30-day rolling attribution metrics and health status.
 */

import { Command } from 'commander';
import { getDatabase } from '../../storage/db.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';
import { KillSwitchService } from '../../services/kill-switch.service.js';

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function getStatusColor(status: 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'healthy':
      return colors.green;
    case 'warning':
      return colors.yellow;
    case 'critical':
      return colors.red;
  }
}

export const healthCommand = new Command('health')
  .description('Show 30-day rolling attribution metrics and health status')
  .action(() => {
    try {
      const scope = resolveScope();
      const db = getDatabase();
      const killSwitchService = new KillSwitchService(db);

      // Get health metrics
      const metrics = killSwitchService.getHealthMetrics(scope);
      const thresholds = killSwitchService.getHealthThresholds();
      const status = killSwitchService.getStatus(scope);

      console.log(colorize('\nFalcon AI Attribution Health\n', 'bold'));

      // Kill switch status
      const stateColor =
        status.state === 'active'
          ? colors.green
          : status.state === 'inferred_paused'
            ? colors.yellow
            : colors.red;
      console.log(`Kill Switch State: ${stateColor}${status.state.toUpperCase()}${colors.reset}`);
      if (status.reason) {
        console.log(`  Reason: ${status.reason}`);
      }
      if (status.autoResumeAt) {
        console.log(`  Auto-resume: ${status.autoResumeAt.toLocaleDateString()}`);
      }
      console.log('');

      // Metrics
      console.log(colorize('30-Day Rolling Metrics:', 'bold'));
      console.log(`  Total Attributions: ${metrics.totalAttributions}`);
      console.log(`  Verbatim: ${metrics.verbatimAttributions}`);
      console.log(`  Paraphrase: ${metrics.paraphraseAttributions}`);
      console.log(`  Inferred: ${metrics.inferredAttributions}`);
      console.log('');

      // Health indicators
      console.log(colorize('Health Indicators:', 'bold'));

      // Precision rate
      const precisionStatus = getHealthStatus(
        metrics.attributionPrecisionScore,
        thresholds.attributionPrecisionScore.healthy,
        true // higher is better
      );
      const precisionColor = getStatusColor(precisionStatus);
      console.log(
        `  Precision Score: ${precisionColor}${(metrics.attributionPrecisionScore * 100).toFixed(1)}%${colors.reset} ` +
          `(threshold: ≥${(thresholds.attributionPrecisionScore.healthy * 100).toFixed(0)}%)`
      );

      // Inferred rate
      const inferredStatus = getHealthStatus(
        metrics.inferredRatio,
        thresholds.inferredRatio.healthy,
        false // lower is better
      );
      const inferredColor = getStatusColor(inferredStatus);
      console.log(
        `  Inferred Ratio: ${inferredColor}${(metrics.inferredRatio * 100).toFixed(1)}%${colors.reset} ` +
          `(threshold: ≤${(thresholds.inferredRatio.healthy * 100).toFixed(0)}%)`
      );

      // Improvement rate
      const improvementStatus = getHealthStatus(
        metrics.observedImprovementRate,
        thresholds.observedImprovementRate.healthy,
        true // higher is better
      );
      const improvementColor = getStatusColor(improvementStatus);
      console.log(
        `  Improvement Rate: ${improvementColor}${(metrics.observedImprovementRate * 100).toFixed(1)}%${colors.reset} ` +
          `(threshold: ≥${(thresholds.observedImprovementRate.healthy * 100).toFixed(0)}%)`
      );

      console.log('');

      // Overall health
      const overallHealth = determineOverallHealth(precisionStatus, inferredStatus, improvementStatus);
      const overallColor = getStatusColor(overallHealth);
      console.log(`Overall Health: ${overallColor}${overallHealth.toUpperCase()}${colors.reset}`);

      // Recommendations
      if (overallHealth !== 'healthy') {
        console.log('');
        console.log(colorize('Recommendations:', 'bold'));
        if (precisionStatus !== 'healthy') {
          console.log('  - Review recent patterns for false positives');
        }
        if (inferredStatus !== 'healthy') {
          console.log('  - Improve Context Pack clarity to reduce inferred attributions');
        }
        if (improvementStatus !== 'healthy') {
          console.log('  - Check if injected warnings are being followed');
        }
      }

      console.log('');
    } catch (e) {
      if (e instanceof ScopeResolutionError) {
        console.log('\nFalcon AI Health\n');
        console.log('Not initialized.');
        console.log('');
        console.log('Run "falcon init" in a git repository to get started.');
        process.exit(0);
      }
      throw e;
    }
  });

function getHealthStatus(
  value: number,
  threshold: number,
  higherIsBetter: boolean
): 'healthy' | 'warning' | 'critical' {
  const margin = 0.1; // 10% margin for warning zone

  if (higherIsBetter) {
    if (value >= threshold) return 'healthy';
    if (value >= threshold - margin) return 'warning';
    return 'critical';
  } else {
    if (value <= threshold) return 'healthy';
    if (value <= threshold + margin) return 'warning';
    return 'critical';
  }
}

function determineOverallHealth(
  precision: 'healthy' | 'warning' | 'critical',
  inferred: 'healthy' | 'warning' | 'critical',
  improvement: 'healthy' | 'warning' | 'critical'
): 'healthy' | 'warning' | 'critical' {
  const statuses = [precision, inferred, improvement];
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'healthy';
}
