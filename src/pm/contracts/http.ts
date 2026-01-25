import type {
  Agent,
  IssueStage,
  ModelPreset,
  PRFinding,
  StageMessage,
  WorkflowRun,
} from '../core/types.js';

// Response envelopes (from spec)
export interface ApiSuccess<T> {
  data: T;
  meta?: { total?: number; page?: number; perPage?: number };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface ListMeta {
  total?: number;
  limit?: number;
  offset?: number;
}

export type ListResponse<T> = ApiSuccess<T[]> & { meta?: ListMeta };

// DTOs (from spec - authoritative)
export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';
export type AuthorType = 'agent' | 'human';
export type DocType = 'context_pack' | 'spec' | 'ai_doc' | 'other';

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
  authorType: AuthorType;
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
  docType: DocType;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

// Legacy aliases for backward compatibility with Phase 0 code
export type ProjectDTO = ProjectDto;
export type IssueDTO = IssueDto;
export type LabelDTO = LabelDto;
export type CommentDTO = CommentDto;
export type DocumentDTO = DocumentDto;
export type AgentDTO = Agent;
export type StageMessageDTO = StageMessage;
export type ModelPresetDTO = ModelPreset;
export type WorkflowRunDTO = WorkflowRun;
export type PRFindingDTO = PRFinding;
