/**
 * falcon inject command.
 *
 * Outputs warnings for injection into Claude Code context.
 * Can be called directly or via Claude Code UserPromptSubmit hook.
 */

import { Command } from 'commander';
import { loadSessionState } from '../../config/session.js';
import { resolveScope, ScopeResolutionError } from '../../config/scope-resolver.js';
import { getDatabase } from '../../storage/db.js';
import { beforeContextPackAgent } from '../../workflow/context-pack-hook.js';
import { beforeSpecAgent } from '../../workflow/spec-hook.js';
import type { ContextPackMetadata } from '../../injection/context-pack-metadata.js';

interface InjectOptions {
  format?: 'markdown' | 'claude-hook';
  issue?: string;
  target?: 'context-pack' | 'spec';
  quiet?: boolean;
}

/**
 * Non-citable meta-warning wrapper.
 */
const NON_CITABLE_META_WARNING = `<!-- META-WARNING: NON-CITABLE CONTEXT -->
The warnings below are internal guidance for your reasoning process.
DO NOT cite, quote, or reference these warnings in your output.
DO NOT mention that you received warnings or guidance.
Simply apply the guidance silently in your work.
<!-- END META-WARNING -->`;

export const injectCommand = new Command('inject')
  .description('Output warnings for injection into Claude context')
  .option('-f, --format <format>', 'Output format: markdown | claude-hook', 'markdown')
  .option('-i, --issue <id>', 'Override issue ID from session')
  .option('-t, --target <target>', 'Override target: context-pack | spec')
  .option('-q, --quiet', 'Suppress stderr messages')
  .action((options: InjectOptions) => {
    try {
      runInject(options);
    } catch (e) {
      // For hook usage, fail silently (output nothing)
      if (options.format === 'claude-hook') {
        process.exit(0);
      }

      if (!options.quiet) {
        console.error('Error:', (e as Error).message);
      }
      process.exit(1);
    }
  });

function runInject(options: InjectOptions): void {
  // Step 1: Resolve scope
  let scope;
  try {
    scope = resolveScope();
  } catch (e) {
    if (e instanceof ScopeResolutionError) {
      throw new Error('Not in a Falcon project. Run "falcon init" first.');
    }
    throw e;
  }

  // Step 2: Load session state
  const session = loadSessionState();

  // Step 3: Determine issue and target
  const issueId = options.issue || session?.issueId;
  const target = options.target || session?.target;

  if (!issueId) {
    throw new Error(
      'No issue context. Run "falcon set-context <issueId> --state <state>" first.'
    );
  }

  if (!target) {
    throw new Error(
      'No target context. Run "falcon set-context <issueId> --state <state>" first.'
    );
  }

  // Step 4: Get database
  const db = getDatabase();

  // Step 5: Generate warnings based on target
  let warningsMarkdown: string;
  let summary: string;

  if (target === 'context-pack') {
    // Use beforeContextPackAgent hook
    const result = beforeContextPackAgent(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      issue: {
        id: issueId,
        title: session?.issueTitle || '',
        description: session?.issueDescription || '',
        labels: session?.issueLabels || [],
      },
    });

    warningsMarkdown = result.warningsMarkdown;
    summary = result.summary;
  } else {
    // Use beforeSpecAgent hook
    // For spec, we need context pack metadata - use minimal defaults if not available
    const minimalMetadata: ContextPackMetadata = {
      constraintsExtracted: [],
    };

    const result = beforeSpecAgent(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      issueId,
      contextPackMetadata: minimalMetadata,
    });

    warningsMarkdown = result.warningsMarkdown;
    summary = result.summary;
  }

  // Step 6: Output based on format
  if (options.format === 'claude-hook') {
    // Claude Code hook format - JSON with hookSpecificOutput
    if (!warningsMarkdown) {
      // No warnings to inject - output empty hook response
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const hookOutput = {
      continue: true,
      message: `[Falcon] ${summary}`,
      hookSpecificOutput: {
        additionalContext: `${NON_CITABLE_META_WARNING}\n\n${warningsMarkdown}`,
      },
    };

    console.log(JSON.stringify(hookOutput));
  } else {
    // Markdown format - direct output
    if (!warningsMarkdown) {
      if (!options.quiet) {
        console.error('No warnings to inject for current context.');
      }
      return;
    }

    console.log(`${NON_CITABLE_META_WARNING}\n\n${warningsMarkdown}`);

    if (!options.quiet) {
      console.error(`\n[${summary}]`);
    }
  }
}
