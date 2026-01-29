/**
 * falcon resume command.
 *
 * Resume pattern creation for the current project.
 */

import { Command } from 'commander';
import { getDatabase } from '../../guardrail/storage/db.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';
import { KillSwitchService } from '../../guardrail/services/kill-switch.service.js';

export const resumeCommand = new Command('resume')
  .description('Resume pattern creation for the current project')
  .option('--force', 'Force resume even if auto-paused due to health issues')
  .action((options: { force?: boolean }) => {
    try {
      const scope = resolveScope();
      const db = getDatabase();
      const killSwitchService = new KillSwitchService(db);

      // Check current status
      const currentStatus = killSwitchService.getStatus(scope);

      if (currentStatus.state === 'active') {
        console.log('\nPattern creation is already active.');
        console.log('');
        console.log('Use "falcon health" to view current health metrics.');
        process.exit(0);
      }

      // Check if auto-paused and force not specified
      const isAutoPaused =
        currentStatus.reason?.includes('Auto-paused') ||
        currentStatus.reason?.includes('Health threshold');

      if (isAutoPaused && !options.force) {
        console.log('\nPattern creation was auto-paused due to health issues.');
        console.log(`  Reason: ${currentStatus.reason}`);
        console.log('');
        console.log('Review health metrics with "falcon health" before resuming.');
        console.log('');
        console.log('To force resume anyway:');
        console.log('  falcon resume --force');
        process.exit(1);
      }

      // Resume
      const reason = options.force
        ? 'Manual resume (forced - health issues not resolved)'
        : 'Manual resume';

      const newStatus = killSwitchService.resume(scope, reason);

      console.log('\nPattern creation resumed.');
      console.log('');
      console.log(`State: ${newStatus.state}`);
      console.log(`Reason: ${newStatus.reason}`);
      console.log('');

      if (isAutoPaused) {
        console.log('Warning: Health issues that triggered auto-pause may not be resolved.');
        console.log('Monitor "falcon health" closely.');
        console.log('');
      }

      // Show current health summary
      const metrics = killSwitchService.getHealthMetrics(scope);
      console.log('Current metrics:');
      console.log(`  Precision Score: ${metrics.attributionPrecisionScore !== null ? `${(metrics.attributionPrecisionScore * 100).toFixed(1)}%` : 'N/A'}`);
      console.log(`  Inferred Ratio: ${metrics.inferredRatio !== null ? `${(metrics.inferredRatio * 100).toFixed(1)}%` : 'N/A'}`);
      console.log(`  Improvement Rate: ${metrics.observedImprovementRate !== null ? `${(metrics.observedImprovementRate * 100).toFixed(1)}%` : 'N/A'}`);
      console.log('');
    } catch (e) {
      if (e instanceof ScopeResolutionError) {
        console.log('\nFalcon AI\n');
        console.log('Not initialized.');
        console.log('');
        console.log('Run "falcon init" in a git repository to get started.');
        process.exit(1);
      }
      throw e;
    }
  });
