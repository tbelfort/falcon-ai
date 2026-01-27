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

function buildDefaultPrompt(issue: IssueRecord, stage: IssueStage): string {
  const header = `Stage: ${stage}`;
  const title = `Issue #${issue.number}: ${issue.title}`;
  const description = issue.description ? `\n\n${issue.description}` : '';
  return `${header}\n${title}${description}`.trim();
}
