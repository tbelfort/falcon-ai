import type { Repositories } from '../repos/index.js';
import { createCommentService, type CommentService } from './comments.js';
import { createDocumentService, type DocumentService } from './documents.js';
import { createIssueService, type IssueService } from './issues.js';
import { createLabelService, type LabelService } from './labels.js';
import { createProjectService, type ProjectService } from './projects.js';

export interface Services {
  projects: ProjectService;
  issues: IssueService;
  labels: LabelService;
  comments: CommentService;
  documents: DocumentService;
}

export function createServices(
  repos: Repositories,
  now: () => number = () => Date.now()
): Services {
  return {
    projects: createProjectService(repos.projects, now),
    issues: createIssueService(
      {
        projects: repos.projects,
        issues: repos.issues,
        labels: repos.labels,
      },
      now
    ),
    labels: createLabelService(
      { labels: repos.labels, projects: repos.projects },
      now
    ),
    comments: createCommentService(
      { comments: repos.comments, issues: repos.issues },
      now
    ),
    documents: createDocumentService(
      { documents: repos.documents, issues: repos.issues },
      now
    ),
  };
}
