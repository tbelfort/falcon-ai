import type { Repositories } from '../../core/repos/index.js';

import { DbCommentRepo } from './comments-repo.js';
import { DbDocumentRepo } from './documents-repo.js';
import { DbIssueRepo } from './issues-repo.js';
import { DbLabelRepo } from './labels-repo.js';
import { DbProjectRepo } from './projects-repo.js';

export function createDbRepos(): Repositories {
  return {
    projects: new DbProjectRepo(),
    issues: new DbIssueRepo(),
    labels: new DbLabelRepo(),
    comments: new DbCommentRepo(),
    documents: new DbDocumentRepo(),
  };
}
