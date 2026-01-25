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

export type WsChannel = `project:${string}` | `issue:${string}`;

export interface WsServerConnectedMessage {
  type: 'connected';
  clientId: string;
}

export interface WsServerSubscribedMessage {
  type: 'subscribed';
  channel: string;
}

export interface WsServerUnsubscribedMessage {
  type: 'unsubscribed';
  channel: string;
}

export interface WsServerPongMessage {
  type: 'pong';
}

export interface WsServerErrorMessage {
  type: 'error';
  message: string;
}

export interface WsServerEventMessage {
  type: 'event';
  channel: string;
  event: WsEventType;
  data: WsEvent;
}

export type WsServerMessage =
  | WsServerConnectedMessage
  | WsServerSubscribedMessage
  | WsServerUnsubscribedMessage
  | WsServerPongMessage
  | WsServerEventMessage
  | WsServerErrorMessage;

export interface WsClientSubscribeMessage {
  type: 'subscribe';
  channel: string;
}

export interface WsClientUnsubscribeMessage {
  type: 'unsubscribe';
  channel: string;
}

export interface WsClientPingMessage {
  type: 'ping';
}

export type WsClientMessage =
  | WsClientSubscribeMessage
  | WsClientUnsubscribeMessage
  | WsClientPingMessage;

export interface WsEventBase<TType extends WsEventType, TPayload> {
  type: TType;
  at: number;
  projectId: string;
  issueId?: string;
  payload: TPayload;
}

export type ProjectEvent =
  | WsEventBase<'project.created', ProjectDto>
  | WsEventBase<'project.updated', ProjectDto>
  | WsEventBase<'project.deleted', ProjectDto>;

export type IssueEvent =
  | WsEventBase<'issue.created', IssueDto>
  | WsEventBase<'issue.updated', IssueDto>
  | WsEventBase<'issue.deleted', IssueDto>;

export type CommentEvent = WsEventBase<'comment.created', CommentDto>;
export type LabelEvent = WsEventBase<'label.created', LabelDto>;
export type DocumentEvent = WsEventBase<'document.created', DocumentDto>;

export type WsEvent =
  | ProjectEvent
  | IssueEvent
  | CommentEvent
  | LabelEvent
  | DocumentEvent;
