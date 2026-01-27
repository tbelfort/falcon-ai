import type { AgentInvokeArgs, AgentInvoker } from './agent-invoker.js';
import type { OutputBus } from '../output/output-bus.js';

export interface FakeAgentInvokerOptions {
  outputBus: OutputBus;
  runId?: string;
}

export class FakeAgentInvoker implements AgentInvoker {
  lastArgs: AgentInvokeArgs | null = null;

  constructor(private readonly options: FakeAgentInvokerOptions) {}

  async invokeStage(args: AgentInvokeArgs): Promise<{ runId: string }> {
    if (!args.prompt.trim()) {
      throw new Error('Prompt is required');
    }
    if (!args.toolBaseUrl.includes('/api/agent')) {
      throw new Error('toolBaseUrl must include /api/agent');
    }

    this.lastArgs = { ...args };
    const runId = this.options.runId ?? 'run_fake';
    this.options.outputBus.publish({
      runId,
      agentId: args.agentId,
      issueId: args.issueId,
      line: `start:${args.stage}`,
    });
    this.options.outputBus.publish({
      runId,
      agentId: args.agentId,
      issueId: args.issueId,
      line: args.prompt,
    });
    this.options.outputBus.publish({
      runId,
      agentId: args.agentId,
      issueId: args.issueId,
      line: `done:${args.stage}`,
    });
    return { runId };
  }
}
