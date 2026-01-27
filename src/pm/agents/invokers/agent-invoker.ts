export interface AgentInvokeArgs {
  agentId: string;
  issueId: string;
  stage: string;
  prompt: string;
  toolBaseUrl: string;
  debug: boolean;
}

export interface AgentInvoker {
  invokeStage(args: AgentInvokeArgs): Promise<{ runId: string }>;
}
