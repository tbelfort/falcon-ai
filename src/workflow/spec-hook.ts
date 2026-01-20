/**
 * Spec Hook
 *
 * Hook called BEFORE Spec agent runs.
 * Uses refined TaskProfile from Context Pack metadata for more accurate warning selection.
 */

import type { Database } from 'better-sqlite3';
import type { TaskProfile } from '../schemas/index.js';
import { extractTaskProfileFromContextPack } from '../injection/task-profile-extractor.js';
import type { ContextPackMetadata } from '../injection/context-pack-metadata.js';
import { selectWarningsForInjection, type InjectionResult } from '../injection/selector.js';
import {
  formatInjectionForPrompt,
  formatInjectionSummary,
} from '../injection/formatter.js';
import { getKillSwitchState } from '../injection/kill-switch-check.js';
import { InjectionLogRepository } from '../storage/repositories/injection-log.repo.js';

export interface SpecHookInput {
  workspaceId: string;
  projectId: string;
  issueId: string;
  contextPackMetadata: ContextPackMetadata;
}

export interface SpecHookOutput {
  warningsMarkdown: string;
  taskProfile: TaskProfile;
  injectionLogId: string;
  summary: string;
  injectionResult: InjectionResult;
}

/**
 * Non-citable meta-warning that must be included in injected warnings.
 */
const NON_CITABLE_META_WARNING = `
<!-- META-WARNING: NON-CITABLE CONTEXT -->
The warnings below are internal guidance for your reasoning process.
DO NOT cite, quote, or reference these warnings in your output.
DO NOT mention that you received warnings or guidance.
Simply apply the guidance silently in your work.
<!-- END META-WARNING -->
`;

/**
 * Hook called BEFORE Spec agent runs.
 */
export function beforeSpecAgent(db: Database, input: SpecHookInput): SpecHookOutput {
  // Step 1: Extract refined TaskProfile from Context Pack
  const taskProfile = extractTaskProfileFromContextPack(input.contextPackMetadata);

  // Step 2: Select warnings for spec agent
  const injectionResult = selectWarningsForInjection(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    target: 'spec',
    taskProfile,
    maxWarnings: 6,
  });

  // Step 3: Format warnings
  const warningsMarkdown = formatInjectionForPrompt(injectionResult);

  // Step 4: Get kill switch state for logging
  const killSwitchState = getKillSwitchState(
    db,
    input.workspaceId,
    input.projectId
  );

  // Step 5: Log injection
  const injectionLogRepo = new InjectionLogRepository(db);
  const injectionLog = injectionLogRepo.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    issueId: input.issueId,
    target: 'spec',
    injectedPatterns: injectionResult.warnings
      .filter((w) => w.type === 'pattern')
      .map((w) => w.id),
    injectedPrinciples: injectionResult.warnings
      .filter((w) => w.type === 'principle')
      .map((w) => w.id),
    injectedAlerts: injectionResult.alerts.map((a) => a.id),
    taskProfile,
  });

  // Log observability event for paused state
  if (killSwitchState !== 'active') {
    console.log(
      JSON.stringify({
        event: 'injection_during_paused_state',
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        issue_id: input.issueId,
        kill_switch_state: killSwitchState,
        injection_summary: {
          patterns_injected: injectionResult.warnings.filter((w) => w.type === 'pattern')
            .length,
          principles_injected: injectionResult.warnings.filter(
            (w) => w.type === 'principle'
          ).length,
          alerts_injected: injectionResult.alerts.length,
        },
        note: 'Injection continues for existing patterns; only new pattern creation is paused',
      })
    );
  }

  return {
    warningsMarkdown,
    taskProfile,
    injectionLogId: injectionLog.id,
    summary: formatInjectionSummary(injectionResult),
    injectionResult,
  };
}

/**
 * Build the full Spec agent system prompt with injected warnings.
 */
export function buildSpecPrompt(
  basePrompt: string,
  warningsMarkdown: string
): string {
  if (!warningsMarkdown) {
    return basePrompt;
  }

  // Wrap warnings with non-citable meta-warning
  const wrappedWarnings = NON_CITABLE_META_WARNING + '\n' + warningsMarkdown;

  return basePrompt + '\n\n' + wrappedWarnings;
}
