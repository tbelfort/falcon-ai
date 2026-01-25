import type { CommentDto, IssueDto, IssueStage, LabelDto, ProjectDto } from '../api/types';

interface SeedData {
  projects: ProjectDto[];
  labels: LabelDto[];
  issues: IssueDto[];
  comments: CommentDto[];
}

const issue = (
  id: string,
  number: number,
  title: string,
  stage: IssueStage,
  labels: LabelDto[],
  assignedAgentId: string | null,
  description?: string
): IssueDto => ({
  id,
  projectId: 'proj-1',
  number,
  title,
  description: description ?? null,
  stage,
  assignedAgentId,
  labels
});

const seedData = (): SeedData => {
  const project: ProjectDto = { id: 'proj-1', name: 'Falcon PM', slug: 'falcon-pm' };
  const labels: LabelDto[] = [
    { id: 'label-1', projectId: project.id, name: 'backend', color: '#7dd3fc' },
    { id: 'label-2', projectId: project.id, name: 'ui', color: '#fca5a5' },
    { id: 'label-3', projectId: project.id, name: 'infra', color: '#fde68a' },
    { id: 'label-4', projectId: project.id, name: 'critical', color: '#fb7185' }
  ];

  const issues: IssueDto[] = [
    issue('issue-1', 101, 'Define Kanban visual language', 'BACKLOG', [labels[1]], null),
    issue('issue-2', 102, 'Draft issue detail modal copy', 'TODO', [labels[1], labels[3]], 'A-17'),
    issue('issue-3', 103, 'Prepare context pack sync', 'CONTEXT_PACK', [labels[0]], 'A-12'),
    issue('issue-4', 104, 'Spec optimistic transitions', 'SPEC', [labels[0], labels[2]], 'A-42'),
    issue('issue-5', 105, 'Implement UI store wiring', 'IMPLEMENT', [labels[1]], 'A-08'),
    issue('issue-6', 106, 'Review drag and drop flow', 'PR_REVIEW', [labels[0]], null),
    issue('issue-7', 107, 'Verify vitest coverage', 'TESTING', [labels[2]], 'A-21'),
    issue('issue-8', 108, 'Ship initial dashboard', 'DONE', [labels[1], labels[3]], 'A-17')
  ];

  const comments: CommentDto[] = [
    {
      id: 'comment-1',
      issueId: 'issue-2',
      content: 'Can we align the modal tone with the new UX guide?',
      authorType: 'human',
      authorName: 'Ava',
      createdAt: Date.now() - 1000 * 60 * 60
    },
    {
      id: 'comment-2',
      issueId: 'issue-5',
      content: 'State transitions are clean once optimistic updates are in place.',
      authorType: 'agent',
      authorName: 'Falcon Bot',
      createdAt: Date.now() - 1000 * 60 * 30
    }
  ];

  return { projects: [project], labels, issues, comments };
};

let projects: ProjectDto[] = [];
let labels: LabelDto[] = [];
let issues: IssueDto[] = [];
let comments: CommentDto[] = [];

const reset = () => {
  const seed = seedData();
  projects = seed.projects;
  labels = seed.labels;
  issues = seed.issues;
  comments = seed.comments;
};

reset();

export const mockDb = {
  get projects() {
    return projects;
  },
  get labels() {
    return labels;
  },
  get issues() {
    return issues;
  },
  get comments() {
    return comments;
  },
  setIssues(next: IssueDto[]) {
    issues = next;
  },
  setComments(next: CommentDto[]) {
    comments = next;
  },
  reset
};

export const resetMockData = () => reset();
