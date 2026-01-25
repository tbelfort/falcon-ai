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

export type AgentType = 'claude' | 'openai';
export type AgentStatus = 'idle' | 'checkout' | 'working' | 'error';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string | null;
  config: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  stage: IssueStage;
  priority: string | null;
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface Agent {
  id: string;
  projectId: string;
  name: string;
  agentType: AgentType;
  model: string;
  status: AgentStatus;
  currentIssueId: string | null;
  currentStage: IssueStage | null;
  workDir: string;
  config: string | null;
  totalTasksCompleted: number;
  lastActiveAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  projectId: string;
  issueId: string | null;
  title: string;
  docType: string;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Comment {
  id: string;
  issueId: string;
  content: string;
  authorType: string;
  authorName: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StageMessage {
  id: string;
  issueId: string;
  fromStage: IssueStage;
  toStage: IssueStage;
  fromAgent: string;
  message: string;
  priority: string | null;
  readAt: number | null;
  readBy: string | null;
  createdAt: number;
}

export interface ModelPreset {
  id: string;
  name: string;
  description: string | null;
  config: string;
  isDefault: boolean;
  forLabel: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRun {
  id: string;
  issueId: string;
  agentId: string;
  stage: IssueStage;
  presetId: string | null;
  status: string;
  startedAt: number;
  completedAt: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  costUsd: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  sessionId: string | null;
  createdAt: number;
}

export interface PRFinding {
  id: string;
  issueId: string;
  prNumber: number;
  findingType: string;
  category: string | null;
  filePath: string | null;
  lineNumber: number | null;
  message: string;
  suggestion: string | null;
  foundBy: string;
  confirmedBy: string | null;
  confidence: number | null;
  status: string;
  reviewedBy: string | null;
  reviewComment: string | null;
  reviewedAt: number | null;
  fixed: boolean;
  fixedInCommit: string | null;
  createdAt: number;
}
