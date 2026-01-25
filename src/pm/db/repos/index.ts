import type { PmRepos } from '../../core/repos/index.js';
import { DbCommentsRepo } from './comments.js';
import { DbDocumentsRepo } from './documents.js';
import { DbIssuesRepo } from './issues.js';
import { DbLabelsRepo } from './labels.js';
import { DbProjectsRepo } from './projects.js';

export function createDbRepos(): PmRepos {
  return {
    projects: new DbProjectsRepo(),
    issues: new DbIssuesRepo(),
    labels: new DbLabelsRepo(),
    comments: new DbCommentsRepo(),
    documents: new DbDocumentsRepo(),
  };
}

export { DbCommentsRepo } from './comments.js';
export { DbDocumentsRepo } from './documents.js';
export { DbIssuesRepo } from './issues.js';
export { DbLabelsRepo } from './labels.js';
export { DbProjectsRepo } from './projects.js';
