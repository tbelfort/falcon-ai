import type { Repositories } from '../../core/repos/index.js';
import { DbCommentRepository } from './comments.js';
import { DbDocumentRepository } from './documents.js';
import { DbIssueRepository } from './issues.js';
import { DbLabelRepository } from './labels.js';
import { DbProjectRepository } from './projects.js';

export function createDbRepos(): Repositories {
  return {
    projects: new DbProjectRepository(),
    issues: new DbIssueRepository(),
    labels: new DbLabelRepository(),
    comments: new DbCommentRepository(),
    documents: new DbDocumentRepository(),
  };
}
