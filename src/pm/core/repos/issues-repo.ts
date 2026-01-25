import type { Issue } from '../types.js';

export interface IssueRepository {
  listByProject(projectId: string): Issue[];
  getById(id: string): Issue | null;
  getNextNumber(projectId: string): number;
  create(issue: Issue): Issue;
  update(issue: Issue): Issue;
  delete(id: string): Issue | null;
}
