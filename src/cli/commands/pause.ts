/**
 * falcon pause command.
 *
 * Pause pattern creation for the current project.
 */

import { Command } from 'commander';
import { getDatabase } from '../../guardrail/storage/db.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';
import { KillSwitchService } from '../../guardrail/services/kill-switch.service.js';

export const pauseCommand = new Command('pause')
  .description('Pause pattern creation for the current project')
  .argument('[reason]', 'Reason for pausing (required)')
  .option('--inferred-only', 'Only pause inferred pattern creation')
  .action((reason: string | undefined, options: { inferredOnly?: boolean }) => {
    try {
      const scope = resolveScope();
      const db = getDatabase();
      const killSwitchService = new KillSwitchService(db);

      // Check current status
      const currentStatus = killSwitchService.getStatus(scope);

      if (currentStatus.state !== 'active') {
        console.log(`\nPattern creation is already paused.`);
        console.log(`  State: ${currentStatus.state}`);
        console.log(`  Reason: ${currentStatus.reason}`);
        if (currentStatus.autoResumeAt) {
          console.log(`  Auto-resume: ${new Date(currentStatus.autoResumeAt).toLocaleDateString()}`);
        }
        console.log('\nUse "falcon resume" to resume pattern creation.');
        process.exit(0);
      }

      // Require reason for manual pause
      if (!reason) {
        console.error('\nError: Reason is required for pausing pattern creation.');
        console.log('');
        console.log('Usage: falcon pause "reason for pausing"');
        console.log('');
        console.log('Examples:');
        console.log('  falcon pause "Investigating false positive patterns"');
        console.log('  falcon pause "Waiting for spec clarification" --inferred-only');
        process.exit(1);
      }

      // Pause
      let newStatus;
      if (options.inferredOnly) {
        newStatus = killSwitchService.pauseInferred(scope, reason);
        console.log('\nInferred pattern creation paused.');
        console.log('  - Verbatim and paraphrase patterns will still be created');
        console.log('  - Inferred patterns will be logged but not saved');
      } else {
        newStatus = killSwitchService.pause(scope, reason);
        console.log('\nAll pattern creation paused.');
        console.log('  - Patterns will be logged but not saved');
      }

      console.log('');
      console.log(`State: ${newStatus.state}`);
      console.log(`Reason: ${newStatus.reason}`);
      if (newStatus.autoResumeAt) {
        console.log(`Auto-resume: ${new Date(newStatus.autoResumeAt).toLocaleDateString()}`);
      }
      console.log('');
      console.log('Note: Injection of existing patterns continues unchanged.');
      console.log('Use "falcon resume" to resume pattern creation.');
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
