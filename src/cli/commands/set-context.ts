/**
 * falcon set-context command.
 *
 * Updates session state for automatic warning injection.
 * Called by CHECKOUT.md workflow after getting issue details.
 */

import { Command } from 'commander';
import {
  updateSessionState,
  clearSessionState,
  loadSessionState,
} from '../../config/session.js';

interface SetContextOptions {
  state?: string;
  title?: string;
  description?: string;
  labels?: string;
  clear?: boolean;
}

export const setContextCommand = new Command('set-context')
  .description('Set injection context for current issue')
  .argument('[issueId]', 'Linear issue ID (e.g., FALT-2)')
  .option('-s, --state <state>', 'Workflow state (e.g., "Todo", "Ready for Spec")')
  .option('-t, --title <title>', 'Issue title')
  .option('-d, --description <description>', 'Issue description')
  .option('-l, --labels <labels>', 'Comma-separated labels')
  .option('-c, --clear', 'Clear the current context')
  .action((issueId: string | undefined, options: SetContextOptions) => {
    // Handle clear option
    if (options.clear) {
      try {
        clearSessionState();
        console.log('Session context cleared.');
      } catch (e) {
        console.error('Error:', (e as Error).message);
        process.exit(1);
      }
      return;
    }

    // Require issueId if not clearing
    if (!issueId) {
      console.error('Error: Issue ID is required unless using --clear');
      console.error('Usage: falcon set-context <issueId> --state "Todo"');
      process.exit(1);
    }

    // Require state
    if (!options.state) {
      console.error('Error: --state is required');
      console.error('Usage: falcon set-context <issueId> --state "Todo"');
      process.exit(1);
    }

    // Parse labels
    const labels = options.labels
      ? options.labels.split(',').map((l) => l.trim())
      : undefined;

    try {
      const session = updateSessionState({
        issueId,
        workflowState: options.state,
        issueTitle: options.title,
        issueDescription: options.description,
        issueLabels: labels,
      });

      const targetDisplay = session.target || 'none';
      console.log(`Context set for ${issueId}`);
      console.log(`  State: ${session.workflowState}`);
      console.log(`  Target: ${targetDisplay}`);
    } catch (e) {
      console.error('Error:', (e as Error).message);
      process.exit(1);
    }
  });

/**
 * Subcommand to show current context.
 */
export const showContextCommand = new Command('show-context')
  .description('Show current injection context')
  .action(() => {
    const session = loadSessionState();

    if (!session) {
      console.log('No active session context.');
      console.log('Run "falcon set-context <issueId> --state <state>" to set context.');
      return;
    }

    console.log('Current Session Context:');
    console.log(`  Issue: ${session.issueId}`);
    console.log(`  State: ${session.workflowState}`);
    console.log(`  Target: ${session.target || 'none'}`);
    if (session.issueTitle) {
      console.log(`  Title: ${session.issueTitle}`);
    }
    if (session.issueLabels?.length) {
      console.log(`  Labels: ${session.issueLabels.join(', ')}`);
    }
    console.log(`  Updated: ${session.updatedAt}`);
  });
