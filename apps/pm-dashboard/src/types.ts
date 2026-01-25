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

export type ApiSuccess<T> = { data: T; meta?: { total?: number } };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

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
  'DONE'
];

export const STAGE_LABELS: Record<IssueStage, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  CONTEXT_PACK: 'Context Pack',
  CONTEXT_REVIEW: 'Context Review',
  SPEC: 'Spec',
  SPEC_REVIEW: 'Spec Review',
  IMPLEMENT: 'Implement',
  PR_REVIEW: 'PR Review',
  PR_HUMAN_REVIEW: 'PR Human Review',
  FIXER: 'Fixer',
  TESTING: 'Testing',
  DOC_REVIEW: 'Doc Review',
  MERGE_READY: 'Merge Ready',
  DONE: 'Done'
};
