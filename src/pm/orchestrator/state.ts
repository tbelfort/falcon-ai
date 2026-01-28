import type { IssueStage } from '../core/types.js';

export type OrchestratorRunStatus = 'running' | 'completed' | 'error';

export interface OrchestratorRunState {
  runId: string;
  issueId: string;
  stage: IssueStage;
  agentId: string;
  status: OrchestratorRunStatus;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
}

export interface OrchestratorState {
  inFlightRuns: Map<string, OrchestratorRunState>;
  running: boolean;
  lastTickAt: number | null;
}

export interface IssueOrchestrationAttributes {
  needsHumanAttention?: boolean;
  orchestrationError?: string | null;
}
