import type { AgentInvoker } from '../agents/invokers/agent-invoker.js';
import type { IssueRecord } from '../core/repos/issues.js';
import type { IssueStage } from '../core/types.js';

export interface WorkflowExecutorOptions {
  invoker: AgentInvoker;
  toolBaseUrl: string;
  debug?: boolean;
  promptBuilder?: (issue: IssueRecord, stage: IssueStage) => string;
}

export class WorkflowExecutor {
  constructor(private readonly options: WorkflowExecutorOptions) {}

  async invokeStage(args: {
    agentId: string;
    issue: IssueRecord;
    stage: IssueStage;
  }): Promise<{ runId: string; prompt: string }> {
    const prompt = this.options.promptBuilder
      ? this.options.promptBuilder(args.issue, args.stage)
      : buildDefaultPrompt(args.issue, args.stage);

    const result = await this.options.invoker.invokeStage({
      agentId: args.agentId,
      issueId: args.issue.id,
      stage: args.stage,
      prompt,
      toolBaseUrl: this.options.toolBaseUrl,
      debug: this.options.debug ?? false,
    });

    return { runId: result.runId, prompt };
  }
}

/**
 * Builds the default prompt for a stage invocation.
 * User-controlled content (title, description) is wrapped in XML tags
 * to prevent prompt injection attacks.
 */
function buildDefaultPrompt(issue: IssueRecord, stage: IssueStage): string {
  const sanitizedTitle = sanitizeUserContent(issue.title);
  const sanitizedDescription = issue.description
    ? sanitizeUserContent(issue.description)
    : '';

  const header = `Stage: ${stage}`;
  const titleBlock = `<issue-title>Issue #${issue.number}: ${sanitizedTitle}</issue-title>`;
  const descriptionBlock = sanitizedDescription
    ? `\n\n<issue-description>\n${sanitizedDescription}\n</issue-description>`
    : '';

  return `${header}\n${titleBlock}${descriptionBlock}`.trim();
}

/**
 * Sanitizes user content to prevent prompt injection.
 * Escapes XML-like tags that could break the delimiter structure.
 */
function sanitizeUserContent(content: string): string {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
