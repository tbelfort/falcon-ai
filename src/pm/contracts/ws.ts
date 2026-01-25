import type { AgentStatus, IssueStage } from '../core/types.js';

// Server -> Client messages (from spec)
export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };

// Client -> Server messages (from spec)
export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };

// Event names (from spec)
export type WsEventName =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'issue.created'
  | 'issue.updated'
  | 'issue.deleted'
  | 'comment.created'
  | 'label.created'
  | 'document.created';

// Legacy types from Phase 0 (still useful for internal events)
export type WsEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.stage.changed'
  | 'comment.created'
  | 'agent.status.changed';

export interface WsEnvelope<TPayload = unknown> {
  type: WsEventType;
  payload: TPayload;
}

export interface IssueStageChangedPayload {
  issueId: string;
  projectId: string;
  fromStage: IssueStage;
  toStage: IssueStage;
  changedAt: number;
}

export interface IssueUpdatedPayload {
  issueId: string;
  projectId: string;
  status?: string;
  stage?: IssueStage;
  updatedAt: number;
}

export interface CommentCreatedPayload {
  issueId: string;
  commentId: string;
  createdAt: number;
}

export interface AgentStatusChangedPayload {
  agentId: string;
  projectId: string;
  status: AgentStatus;
  changedAt: number;
}

export type WsEvent =
  | WsEnvelope<IssueStageChangedPayload>
  | WsEnvelope<IssueUpdatedPayload>
  | WsEnvelope<CommentCreatedPayload>
  | WsEnvelope<AgentStatusChangedPayload>;
