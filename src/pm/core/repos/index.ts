import type { CommentRepo } from './comments.js';
import type { DocumentRepo } from './documents.js';
import type { IssueRepo } from './issues.js';
import type { LabelRepo } from './labels.js';
import type { ProjectRepo } from './projects.js';

export interface PmRepos {
  projects: ProjectRepo;
  issues: IssueRepo;
  labels: LabelRepo;
  comments: CommentRepo;
  documents: DocumentRepo;
}

export type { CommentRepo, DocumentRepo, IssueRepo, LabelRepo, ProjectRepo };
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
