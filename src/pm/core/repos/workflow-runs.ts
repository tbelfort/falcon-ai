import type { WorkflowRunDto } from '../../contracts/http.js';
import type { IssueStage } from '../types.js';

export interface WorkflowRunCreateInput {
  id: string;
  issueId: string;
  agentId: string;
  stage: IssueStage;
  presetId: string | null;
  status: string;
  startedAt: number;
  completedAt: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  costUsd: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  sessionId: string | null;
  createdAt: number;
}

export interface WorkflowRunUpdateInput {
  status?: string;
  completedAt?: number | null;
  resultSummary?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  costUsd?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  sessionId?: string | null;
}

export interface WorkflowRunRepo {
  listByIssue(issueId: string): WorkflowRunDto[];
  getById(id: string): WorkflowRunDto | null;
  create(input: WorkflowRunCreateInput): WorkflowRunDto;
  update(id: string, input: WorkflowRunUpdateInput): WorkflowRunDto | null;
}
