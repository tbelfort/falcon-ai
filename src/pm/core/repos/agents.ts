import type { AgentDto } from '../../contracts/http.js';

export interface AgentCreateInput {
  id: string;
  projectId: string;
  name: string;
  agentType: AgentDto['agentType'];
  model: string;
  status: AgentDto['status'];
  currentIssueId: string | null;
  currentStage: AgentDto['currentStage'];
  workDir: string;
  config: unknown;
  totalTasksCompleted: number;
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentUpdateInput {
  name?: string;
  model?: string;
  status?: AgentDto['status'];
  currentIssueId?: string | null;
  currentStage?: AgentDto['currentStage'];
  workDir?: string;
  config?: unknown;
  totalTasksCompleted?: number;
  lastActiveAt?: number | null;
  updatedAt: number;
}

export interface AgentRepo {
  listByProject(projectId: string): AgentDto[];
  getById(id: string): AgentDto | null;
  create(input: AgentCreateInput): AgentDto;
  update(id: string, input: AgentUpdateInput): AgentDto | null;
}
