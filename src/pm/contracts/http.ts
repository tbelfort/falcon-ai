import type {
  Agent,
  Comment,
  Document,
  Issue,
  Label,
  ModelPreset,
  PRFinding,
  Project,
  StageMessage,
  WorkflowRun,
} from '../core/types.js';

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
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

export type ProjectDTO = Project;
export type IssueDTO = Issue;
export type LabelDTO = Label;
export type AgentDTO = Agent;
export type DocumentDTO = Document;
export type CommentDTO = Comment;
export type StageMessageDTO = StageMessage;
export type ModelPresetDTO = ModelPreset;
export type WorkflowRunDTO = WorkflowRun;
export type PRFindingDTO = PRFinding;
