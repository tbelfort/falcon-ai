// Issue stages as defined in the spec
export type IssueStage =
  | 'BACKLOG'
  | 'TODO'
  | 'CONTEXT_PACK'
  | 'CONTEXT_REVIEW'
  | 'SPEC'
  | 'SPEC_REVIEW'
  | 'IMPLEMENT'
  | 'PR_REVIEW'
  | 'PR_HUMAN_REVIEW'
  | 'FIXER'
  | 'TESTING'
  | 'DOC_REVIEW'
  | 'MERGE_READY'
  | 'DONE';

export const ISSUE_STAGES: IssueStage[] = [
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
];

// Grouped stages for compact board view
export const STAGE_GROUPS = {
  planning: ['BACKLOG', 'TODO'] as IssueStage[],
  context: ['CONTEXT_PACK', 'CONTEXT_REVIEW'] as IssueStage[],
  spec: ['SPEC', 'SPEC_REVIEW'] as IssueStage[],
  implementation: ['IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER'] as IssueStage[],
  finalization: ['TESTING', 'DOC_REVIEW', 'MERGE_READY'] as IssueStage[],
  complete: ['DONE'] as IssueStage[],
};

// DTOs as defined in the spec
export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
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

export interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface CommentDto {
  id: string;
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  createdAt: number;
}

// API response envelope
export type ApiSuccess<T> = { data: T; meta?: { total?: number } };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Type guard for API responses
export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return 'error' in response;
}

// WebSocket message types
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

// Async state pattern
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Exhaustive check helper
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
