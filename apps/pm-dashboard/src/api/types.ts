export type ApiSuccess<T> = { data: T; meta?: { total?: number } };
export type ApiErrorPayload = { code: string; message: string; details?: unknown };
export type ApiError = { error: ApiErrorPayload };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ISSUE_STAGES = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'SPEC',
  'SPEC_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'FIXER',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
] as const;

export type IssueStage = (typeof ISSUE_STAGES)[number];

export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
}

export interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface IssueDto {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  stage: IssueStage;
  assignedAgentId: string | null;
  labels: LabelDto[];
}

export interface CommentDto {
  id: string;
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  createdAt: number;
}

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };

export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
