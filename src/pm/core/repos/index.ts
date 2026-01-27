import type { AgentRepo } from './agents.js';
import type { CommentRepo } from './comments.js';
import type { DocumentRepo } from './documents.js';
import type { IssueRepo } from './issues.js';
import type { LabelRepo } from './labels.js';
import type { ProjectRepo } from './projects.js';
import type { StageMessageRepo } from './stage-messages.js';
import type { WorkflowRunRepo } from './workflow-runs.js';

export interface PmRepos {
  projects: ProjectRepo;
  issues: IssueRepo;
  labels: LabelRepo;
  comments: CommentRepo;
  documents: DocumentRepo;
  agents: AgentRepo;
  stageMessages: StageMessageRepo;
  workflowRuns: WorkflowRunRepo;
}

export type {
  AgentRepo,
  CommentRepo,
  DocumentRepo,
  IssueRepo,
  LabelRepo,
  ProjectRepo,
  StageMessageRepo,
  WorkflowRunRepo,
};
export type { AgentCreateInput, AgentUpdateInput } from './agents.js';
export type {
  CommentCreateInput,
} from './comments.js';
export type {
  DocumentCreateInput,
} from './documents.js';
export type { IssueCreateInput, IssueRecord, IssueUpdateInput } from './issues.js';
export type { LabelCreateInput } from './labels.js';
export type {
  ProjectCreateInput,
  ProjectUpdateInput,
} from './projects.js';
export type { StageMessageCreateInput } from './stage-messages.js';
export type {
  WorkflowRunCreateInput,
  WorkflowRunUpdateInput,
} from './workflow-runs.js';
