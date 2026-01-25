import type { ProjectDto, IssueDto, LabelDto, CommentDto, IssueStage } from '../types';

export const mockProject: ProjectDto = {
  id: 'proj-1',
  name: 'Falcon AI',
  slug: 'falcon-ai',
};

export const mockLabels: LabelDto[] = [
  { id: 'label-1', projectId: 'proj-1', name: 'bug', color: '#ef4444' },
  { id: 'label-2', projectId: 'proj-1', name: 'feature', color: '#22c55e' },
  { id: 'label-3', projectId: 'proj-1', name: 'enhancement', color: '#3b82f6' },
  { id: 'label-4', projectId: 'proj-1', name: 'security', color: '#f97316' },
];

export const mockIssues: IssueDto[] = [
  {
    id: 'issue-1',
    projectId: 'proj-1',
    number: 101,
    title: 'Add user authentication flow',
    description: 'Implement OAuth2 login with GitHub and Google providers',
    stage: 'BACKLOG',
    assignedAgentId: null,
    labels: [mockLabels[1]],
  },
  {
    id: 'issue-2',
    projectId: 'proj-1',
    number: 102,
    title: 'Fix pattern matching edge case',
    description: 'Patterns with special characters are not being matched correctly',
    stage: 'TODO',
    assignedAgentId: null,
    labels: [mockLabels[0]],
  },
  {
    id: 'issue-3',
    projectId: 'proj-1',
    number: 103,
    title: 'Create context pack for PR review',
    description: 'Draft context pack for the PR review feature',
    stage: 'CONTEXT_PACK',
    assignedAgentId: 'agent-spec',
    labels: [],
  },
  {
    id: 'issue-4',
    projectId: 'proj-1',
    number: 104,
    title: 'Write spec for injection system',
    description: 'Define the injection system architecture and APIs',
    stage: 'SPEC',
    assignedAgentId: 'agent-spec',
    labels: [mockLabels[2]],
  },
  {
    id: 'issue-5',
    projectId: 'proj-1',
    number: 105,
    title: 'Implement attribution agent',
    description: 'Build the agent that extracts evidence from PR reviews',
    stage: 'IMPLEMENT',
    assignedAgentId: 'agent-impl',
    labels: [mockLabels[1]],
  },
  {
    id: 'issue-6',
    projectId: 'proj-1',
    number: 106,
    title: 'Security audit for API endpoints',
    description: 'Review all API endpoints for security vulnerabilities',
    stage: 'PR_REVIEW',
    assignedAgentId: 'agent-review',
    labels: [mockLabels[3]],
  },
  {
    id: 'issue-7',
    projectId: 'proj-1',
    number: 107,
    title: 'Fix SQL injection in search',
    description: 'Parameterize SQL queries in the search endpoint',
    stage: 'TESTING',
    assignedAgentId: null,
    labels: [mockLabels[0], mockLabels[3]],
  },
  {
    id: 'issue-8',
    projectId: 'proj-1',
    number: 108,
    title: 'Add dark mode support',
    description: 'Implement theme switching with system preference detection',
    stage: 'DONE',
    assignedAgentId: null,
    labels: [mockLabels[2]],
  },
];

export const mockComments: Record<string, CommentDto[]> = {
  'issue-1': [
    {
      id: 'comment-1',
      issueId: 'issue-1',
      content: 'We should use OAuth2 for this. GitHub and Google are good starting points.',
      authorType: 'human',
      authorName: 'Alice',
      createdAt: Date.now() - 86400000,
    },
    {
      id: 'comment-2',
      issueId: 'issue-1',
      content: 'Agreed. I\'ll start with the GitHub integration first.',
      authorType: 'agent',
      authorName: 'Spec Agent',
      createdAt: Date.now() - 43200000,
    },
  ],
  'issue-5': [
    {
      id: 'comment-3',
      issueId: 'issue-5',
      content: 'Working on the evidence extraction logic now.',
      authorType: 'agent',
      authorName: 'Impl Agent',
      createdAt: Date.now() - 3600000,
    },
  ],
};

// Helper to get comments for an issue
export function getCommentsForIssue(issueId: string): CommentDto[] {
  return mockComments[issueId] || [];
}

// Mutable state for mock modifications
let nextCommentId = 10;

export function addMockComment(issueId: string, content: string, authorName?: string): CommentDto {
  const comment: CommentDto = {
    id: `comment-${nextCommentId++}`,
    issueId,
    content,
    authorType: 'human',
    authorName: authorName || 'Anonymous',
    createdAt: Date.now(),
  };

  if (!mockComments[issueId]) {
    mockComments[issueId] = [];
  }
  mockComments[issueId].push(comment);

  return comment;
}

export function updateMockIssueStage(issueId: string, stage: IssueStage): IssueDto | null {
  const issue = mockIssues.find((i) => i.id === issueId);
  if (issue) {
    issue.stage = stage;
  }
  return issue || null;
}

export function updateMockIssueLabels(issueId: string, labelIds: string[]): IssueDto | null {
  const issue = mockIssues.find((i) => i.id === issueId);
  if (issue) {
    issue.labels = mockLabels.filter((l) => labelIds.includes(l.id));
  }
  return issue || null;
}
