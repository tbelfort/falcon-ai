import type { Issue } from '../../core/types.js';
import type { IssueRepository } from '../../core/repos/issues-repo.js';

export class DbIssueRepository implements IssueRepository {
  listByProject(projectId: string): Issue[] {
    void projectId;
    throw new Error('DbIssueRepository not implemented');
  }

  getById(id: string): Issue | null {
    void id;
    throw new Error('DbIssueRepository not implemented');
  }

  getNextNumber(projectId: string): number {
    void projectId;
    throw new Error('DbIssueRepository not implemented');
  }

  create(issue: Issue): Issue {
    void issue;
    throw new Error('DbIssueRepository not implemented');
  }

  update(issue: Issue): Issue {
    void issue;
    throw new Error('DbIssueRepository not implemented');
  }

  delete(id: string): Issue | null {
    void id;
    throw new Error('DbIssueRepository not implemented');
  }
}
