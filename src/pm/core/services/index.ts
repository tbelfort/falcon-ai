import type { PmRepos } from '../repos/index.js';
import {
  createProjectsService,
  type ProjectsService,
} from './projects.service.js';
import { createIssuesService, type IssuesService } from './issues.service.js';
import { createLabelsService, type LabelsService } from './labels.service.js';
import {
  createCommentsService,
  type CommentsService,
} from './comments.service.js';
import {
  createDocumentsService,
  type DocumentsService,
} from './documents.service.js';

export interface PmServices {
  projects: ProjectsService;
  issues: IssuesService;
  labels: LabelsService;
  comments: CommentsService;
  documents: DocumentsService;
}

export function createPmServices(repos: PmRepos): PmServices {
  return {
    projects: createProjectsService(repos.projects),
    issues: createIssuesService(repos.issues, repos.labels, repos.projects),
    labels: createLabelsService(repos.labels, repos.projects),
    comments: createCommentsService(repos.comments, repos.issues),
    documents: createDocumentsService(repos.documents, repos.issues),
  };
}
