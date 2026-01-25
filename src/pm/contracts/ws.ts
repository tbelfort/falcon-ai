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

export interface WsEventPayload<TPayload> {
  type: WsEventType;
  at: number;
  projectId: string;
  issueId?: string | null;
  payload: TPayload;
}

export type WsEventData =
  | WsEventPayload<ProjectDto>
  | WsEventPayload<IssueDto>
  | WsEventPayload<CommentDto>
  | WsEventPayload<LabelDto>
  | WsEventPayload<DocumentDto>;

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: WsEventType; data: WsEventData }
  | { type: 'error'; message: string };

export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
