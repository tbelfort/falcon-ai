import type {
  CommentCreatedEvent,
  DocumentCreatedEvent,
  IssueEvent,
  LabelCreatedEvent,
  ProjectEvent,
  WsEvent,
} from '../contracts/ws.js';
import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from '../contracts/http.js';

export function projectEvent(
  type: ProjectEvent['type'],
  project: ProjectDto,
  at: number = Date.now()
): ProjectEvent {
  return {
    type,
    at,
    projectId: project.id,
    payload: project,
  };
}

export function issueEvent(
  type: IssueEvent['type'],
  issue: IssueDto,
  at: number = Date.now()
): IssueEvent {
  return {
    type,
    at,
    projectId: issue.projectId,
    issueId: issue.id,
    payload: issue,
  };
}

export function commentCreatedEvent(
  comment: CommentDto,
  projectId: string,
  at: number = Date.now()
): CommentCreatedEvent {
  return {
    type: 'comment.created',
    at,
    projectId,
    issueId: comment.issueId,
    payload: comment,
  };
}

export function labelCreatedEvent(
  label: LabelDto,
  at: number = Date.now()
): LabelCreatedEvent {
  return {
    type: 'label.created',
    at,
    projectId: label.projectId,
    payload: label,
  };
}

export function documentCreatedEvent(
  document: DocumentDto,
  projectId: string,
  issueId: string,
  at: number = Date.now()
): DocumentCreatedEvent {
  return {
    type: 'document.created',
    at,
    projectId,
    issueId,
    payload: document,
  };
}

export function isWsEvent(event: unknown): event is WsEvent {
  return !!event && typeof event === 'object' && 'type' in event;
}
