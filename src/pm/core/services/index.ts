import type { Repositories } from '../repos/index.js';
import { CommentsService } from './comments-service.js';
import { DocumentsService } from './documents-service.js';
import { IssuesService } from './issues-service.js';
import { LabelsService } from './labels-service.js';
import { ProjectsService } from './projects-service.js';

export interface Services {
  projects: ProjectsService;
  issues: IssuesService;
  labels: LabelsService;
  comments: CommentsService;
  documents: DocumentsService;
}

export interface ServicesOptions {
  now?: () => number;
}

export function createServices(
  repos: Repositories,
  options: ServicesOptions = {}
): Services {
  const now = options.now ?? (() => Date.now());

  return {
    projects: new ProjectsService(repos.projects, now),
    issues: new IssuesService(repos.projects, repos.issues, repos.labels, now),
    labels: new LabelsService(repos.projects, repos.labels, now),
    comments: new CommentsService(repos.issues, repos.comments, now),
    documents: new DocumentsService(repos.issues, repos.documents, now),
  };
}
