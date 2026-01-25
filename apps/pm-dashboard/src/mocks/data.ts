import type { ProjectDto, IssueDto, LabelDto, CommentDto, IssueStage } from '../types';

export const mockProjects: ProjectDto[] = [
  { id: 'proj-1', name: 'Falcon AI', slug: 'falcon-ai' },
];

export const mockLabels: LabelDto[] = [
  { id: 'lbl-1', projectId: 'proj-1', name: 'bug', color: '#dc2626' },
  { id: 'lbl-2', projectId: 'proj-1', name: 'feature', color: '#16a34a' },
  { id: 'lbl-3', projectId: 'proj-1', name: 'priority', color: '#ca8a04' },
  { id: 'lbl-4', projectId: 'proj-1', name: 'documentation', color: '#2563eb' },
];

export const mockIssues: IssueDto[] = [
  {
    id: 'issue-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Set up project structure',
    description: 'Initialize the project with the basic folder structure and configuration files.',
    stage: 'DONE',
    assignedAgentId: null,
    labels: [mockLabels[1]],
  },
  {
    id: 'issue-2',
    projectId: 'proj-1',
    number: 2,
    title: 'Implement authentication flow',
    description: 'Add user authentication with JWT tokens and session management.',
    stage: 'IMPLEMENT',
    assignedAgentId: 'agent-alpha',
    labels: [mockLabels[1], mockLabels[2]],
  },
  {
    id: 'issue-3',
    projectId: 'proj-1',
    number: 3,
    title: 'Fix login button styling',
    description: 'The login button has incorrect padding on mobile devices.',
    stage: 'TODO',
    assignedAgentId: null,
    labels: [mockLabels[0]],
  },
  {
    id: 'issue-4',
    projectId: 'proj-1',
    number: 4,
    title: 'Add API documentation',
    description: 'Document all REST API endpoints with OpenAPI specification.',
    stage: 'SPEC',
    assignedAgentId: 'agent-beta',
    labels: [mockLabels[3]],
  },
  {
    id: 'issue-5',
    projectId: 'proj-1',
    number: 5,
    title: 'Implement dashboard analytics',
    description: 'Create analytics dashboard with charts and metrics.',
    stage: 'CONTEXT_PACK',
    assignedAgentId: null,
    labels: [mockLabels[1]],
  },
  {
    id: 'issue-6',
    projectId: 'proj-1',
    number: 6,
    title: 'Review user management spec',
    description: 'Review and approve the specification for user management features.',
    stage: 'SPEC_REVIEW',
    assignedAgentId: null,
    labels: [],
  },
  {
    id: 'issue-7',
    projectId: 'proj-1',
    number: 7,
    title: 'Performance optimization',
    description: 'Optimize database queries and add caching layer.',
    stage: 'BACKLOG',
    assignedAgentId: null,
    labels: [mockLabels[2]],
  },
  {
    id: 'issue-8',
    projectId: 'proj-1',
    number: 8,
    title: 'E2E tests for checkout flow',
    description: 'Write end-to-end tests for the complete checkout process.',
    stage: 'TESTING',
    assignedAgentId: 'agent-gamma',
    labels: [],
  },
  {
    id: 'issue-9',
    projectId: 'proj-1',
    number: 9,
    title: 'Update README',
    description: 'Update README with new installation instructions.',
    stage: 'PR_REVIEW',
    assignedAgentId: null,
    labels: [mockLabels[3]],
  },
  {
    id: 'issue-10',
    projectId: 'proj-1',
    number: 10,
    title: 'Refactor payment module',
    description: null,
    stage: 'MERGE_READY',
    assignedAgentId: null,
    labels: [],
  },
];

export const mockComments: CommentDto[] = [
  {
    id: 'cmt-1',
    issueId: 'issue-2',
    content: 'Started working on the authentication flow. Will use JWT with refresh tokens.',
    authorType: 'agent',
    authorName: 'agent-alpha',
    createdAt: Date.now() - 3600000,
  },
  {
    id: 'cmt-2',
    issueId: 'issue-2',
    content: 'Make sure to add rate limiting for the login endpoint.',
    authorType: 'human',
    authorName: 'reviewer',
    createdAt: Date.now() - 1800000,
  },
  {
    id: 'cmt-3',
    issueId: 'issue-4',
    content: 'Using OpenAPI 3.0 spec. Will document all endpoints with examples.',
    authorType: 'agent',
    authorName: 'agent-beta',
    createdAt: Date.now() - 7200000,
  },
];

// Mutable copy for runtime operations
let issues = [...mockIssues];
let comments = [...mockComments];
let nextCommentId = 4;

export function getIssues(): IssueDto[] {
  return issues;
}

export function getIssueById(id: string): IssueDto | undefined {
  return issues.find((i) => i.id === id);
}

export function updateIssueStage(id: string, stage: IssueStage): IssueDto | undefined {
  const issue = issues.find((i) => i.id === id);
  if (issue) {
    issue.stage = stage;
  }
  return issue;
}

export function updateIssueLabels(id: string, labelIds: string[]): IssueDto | undefined {
  const issue = issues.find((i) => i.id === id);
  if (issue) {
    issue.labels = mockLabels.filter((l) => labelIds.includes(l.id));
  }
  return issue;
}

export function getCommentsByIssue(issueId: string): CommentDto[] {
  return comments.filter((c) => c.issueId === issueId);
}

export function addCommentToIssue(
  issueId: string,
  content: string,
  authorName?: string
): CommentDto {
  const comment: CommentDto = {
    id: `cmt-${nextCommentId++}`,
    issueId,
    content,
    authorType: 'human',
    authorName: authorName ?? 'anonymous',
    createdAt: Date.now(),
  };
  comments.push(comment);
  return comment;
}

export function resetMockData(): void {
  issues = [...mockIssues];
  comments = [...mockComments];
  nextCommentId = 4;
}
