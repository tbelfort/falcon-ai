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

export interface ApiMeta {
  total?: number;
  page?: number;
  perPage?: number;
}

export type ListResponse<T> = ApiSuccess<T[]> & { meta?: ApiMeta };

export type ProjectDto = Project;
export type IssueDto = Issue;
export type LabelDto = Label;
export type AgentDto = Agent;
export type DocumentDto = Document;
export type CommentDto = Comment;
export type StageMessageDto = StageMessage;
export type ModelPresetDto = ModelPreset;
export type WorkflowRunDto = WorkflowRun;
export type PRFindingDto = PRFinding;

export type ProjectDTO = ProjectDto;
export type IssueDTO = IssueDto;
export type LabelDTO = LabelDto;
export type AgentDTO = AgentDto;
export type DocumentDTO = DocumentDto;
export type CommentDTO = CommentDto;
export type StageMessageDTO = StageMessageDto;
export type ModelPresetDTO = ModelPresetDto;
export type WorkflowRunDTO = WorkflowRunDto;
export type PRFindingDTO = PRFindingDto;
