import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from './http.js';

export type WsEventType =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'comment.created'
  | 'label.created'
  | 'document.created';

export interface WsEventBase<TType extends WsEventType, TPayload> {
  type: TType;
  at: number;
  projectId: string;
  payload: TPayload;
}

export interface ProjectEvent extends WsEventBase<
  'project.created' | 'project.updated' | 'project.deleted',
  ProjectDto
> {}

export interface IssueEvent extends WsEventBase<
  'issue.created' | 'issue.updated' | 'issue.deleted',
  IssueDto
> {
  issueId: string;
}

export interface CommentCreatedEvent
  extends WsEventBase<'comment.created', CommentDto> {
  issueId: string;
}

export interface LabelCreatedEvent
  extends WsEventBase<'label.created', LabelDto> {}

export interface DocumentCreatedEvent
  extends WsEventBase<'document.created', DocumentDto> {
  issueId: string;
}

export type WsEvent =
  | ProjectEvent
  | IssueEvent
  | CommentCreatedEvent
  | LabelCreatedEvent
  | DocumentCreatedEvent;

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: WsEventType; data: WsEvent }
  | { type: 'error'; message: string };

export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
