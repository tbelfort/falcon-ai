import type { AgentStatus, AgentType, IssueStage } from '../core/types.js';

export interface ApiMeta {
  total?: number;
  page?: number;
  perPage?: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';
export type CommentAuthorType = 'agent' | 'human';
export type DocumentType = 'context_pack' | 'spec' | 'ai_doc' | 'other';
export type StageMessagePriority = 'normal' | 'important';

export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface IssueDto {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  stage: IssueStage;
  priority: IssuePriority;
  labels: LabelDto[];
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: unknown | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface CommentDto {
  id: string;
  issueId: string;
  content: string;
  authorType: CommentAuthorType;
  authorName: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentDto {
  id: string;
  projectId: string;
  issueId: string | null;
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentDto {
  id: string;
  projectId: string;
  name: string;
  agentType: AgentType;
  model: string;
  status: AgentStatus;
  currentIssueId: string | null;
  currentStage: IssueStage | null;
  workDir: string;
  config: unknown;
  totalTasksCompleted: number;
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface StageMessageDto {
  id: string;
  issueId: string;
  fromStage: IssueStage;
  toStage: IssueStage;
  fromAgent: string;
  message: string;
  priority: StageMessagePriority;
  readAt: number | null;
  readBy: string | null;
  createdAt: number;
}

export interface WorkflowRunDto {
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

export interface IssueWorkflowDto {
  runs: WorkflowRunDto[];
}

export interface AgentIssueContextDto {
  issue: IssueDto;
  project: ProjectDto;
  documents: DocumentDto[];
  stageMessages: StageMessageDto[];
  workflow: IssueWorkflowDto;
}
