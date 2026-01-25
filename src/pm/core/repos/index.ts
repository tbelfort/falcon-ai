export * from './projects-repo.js';
export * from './issues-repo.js';
export * from './labels-repo.js';
export * from './comments-repo.js';
export * from './documents-repo.js';

import type { CommentRepository } from './comments-repo.js';
import type { DocumentRepository } from './documents-repo.js';
import type { IssueRepository } from './issues-repo.js';
import type { LabelRepository } from './labels-repo.js';
import type { ProjectRepository } from './projects-repo.js';

export interface Repositories {
  projects: ProjectRepository;
  issues: IssueRepository;
  labels: LabelRepository;
  comments: CommentRepository;
  documents: DocumentRepository;
}
