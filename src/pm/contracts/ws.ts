import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from './http.js';

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: WsEventPayload }
  | { type: 'error'; message: string };

export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };

export interface ProjectEventPayload {
  type: 'project.created' | 'project.updated' | 'project.deleted';
  at: number;
  projectId: string;
  payload: ProjectDto;
}

export interface IssueEventPayload {
  type: 'issue.created' | 'issue.updated' | 'issue.deleted';
  at: number;
  projectId: string;
  issueId: string;
  payload: IssueDto;
}

export interface CommentEventPayload {
  type: 'comment.created';
  at: number;
  projectId: string;
  issueId: string;
  payload: CommentDto;
}

export interface LabelEventPayload {
  type: 'label.created';
  at: number;
  projectId: string;
  payload: LabelDto;
}

export interface DocumentEventPayload {
  type: 'document.created';
  at: number;
  projectId: string;
  issueId: string;
  payload: DocumentDto;
}

export type WsEventPayload =
  | ProjectEventPayload
  | IssueEventPayload
  | CommentEventPayload
  | LabelEventPayload
  | DocumentEventPayload;
