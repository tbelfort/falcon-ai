import type { PmRepos } from '../repos/index.js';
import { AgentsService } from './agents-service.js';
import { CommentsService } from './comments-service.js';
import { DocumentsService } from './documents-service.js';
import { IssuesService } from './issues-service.js';
import { LabelsService } from './labels-service.js';
import { ProjectsService } from './projects-service.js';
import { StageMessagesService } from './stage-messages-service.js';
import { WorkflowRunsService } from './workflow-runs-service.js';

export interface PmServices {
  projects: ProjectsService;
  issues: IssuesService;
  labels: LabelsService;
  comments: CommentsService;
  documents: DocumentsService;
  agents: AgentsService;
  stageMessages: StageMessagesService;
  workflowRuns: WorkflowRunsService;
}

export function createPmServices(repos: PmRepos): PmServices {
  return {
    projects: new ProjectsService(repos.projects),
    issues: new IssuesService(repos.issues, repos.projects, repos.labels),
    labels: new LabelsService(repos.labels, repos.projects),
    comments: new CommentsService(repos.comments, repos.issues),
    documents: new DocumentsService(repos.documents, repos.issues),
    agents: new AgentsService(repos.agents),
    stageMessages: new StageMessagesService(repos.stageMessages, repos.issues),
    workflowRuns: new WorkflowRunsService(repos.workflowRuns, repos.issues),
  };
}

export { AgentsService } from './agents-service.js';
export { CommentsService } from './comments-service.js';
export { DocumentsService } from './documents-service.js';
export { IssuesService } from './issues-service.js';
export { LabelsService } from './labels-service.js';
export { ProjectsService } from './projects-service.js';
export { StageMessagesService } from './stage-messages-service.js';
export { WorkflowRunsService } from './workflow-runs-service.js';
export type { CreateAgentInput } from './agents-service.js';
export type {
  CreateCommentInput,
} from './comments-service.js';
export type {
  CreateDocumentInput,
} from './documents-service.js';
export type {
  CreateIssueInput,
  StartIssueInput,
  StartIssueResult,
  TransitionIssueInput,
  UpdateIssueInput,
} from './issues-service.js';
export type {
  CreateLabelInput,
} from './labels-service.js';
export type {
  CreateProjectInput,
  UpdateProjectInput,
} from './projects-service.js';
export type {
  CreateStageMessageInput,
} from './stage-messages-service.js';
export type { ServiceResult } from './service-result.js';
export type {
  RecordWorkflowCompletionInput,
  RecordWorkflowErrorInput,
} from './workflow-runs-service.js';
