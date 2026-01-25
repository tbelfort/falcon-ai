import type { AgentStatus, IssueStage } from '../core/types.js';

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
