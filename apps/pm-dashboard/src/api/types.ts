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

export type FindingStatus = 'pending' | 'approved' | 'dismissed';
export type FindingType = 'error' | 'warning' | 'note';

export interface FindingDto {
  id: string;
  findingType: FindingType;
  category: string;
  filePath: string;
  lineNumber: number;
  message: string;
  suggestion: string;
  foundBy: string;
  confirmedBy: string;
  confidence: number;
  status: FindingStatus;
}

export interface FindingsSummary {
  total: number;
  pending: number;
  approved: number;
  dismissed: number;
}

export interface IssueFindingsDto {
  prNumber: number;
  prUrl: string;
  findings: FindingDto[];
  summary: FindingsSummary;
}

export interface ActiveAgentDto {
  agentId: string;
  issueId: string;
  stage: IssueStage;
}

export interface OrchestratorStatusDto {
  running: boolean;
  activeIssues: number;
  queuedIssues: number;
  activeAgents: ActiveAgentDto[];
}

export interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];
    judge: string;
  };
}

export interface PresetDto {
  id: string;
  name: string;
  config: PresetConfig;
  isDefault?: boolean;
  description?: string | null;
}

export interface AgentOutputEvent {
  runId: string;
  agentId: string;
  issueId: string;
  at: number;
  line: string;
}

export type ApiSuccess<T> = { data: T; meta?: { total?: number } };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

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
