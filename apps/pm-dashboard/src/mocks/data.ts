import type { CommentDto, IssueDto, IssueStage, LabelDto, ProjectDto } from '@/api/types';

const project: ProjectDto = {
  id: 'proj-falcon',
  name: 'Falcon PM',
  slug: 'falcon-pm',
};

const labels: LabelDto[] = [
  { id: 'label-ux', projectId: project.id, name: 'UX', color: '#c96b3c' },
  { id: 'label-api', projectId: project.id, name: 'API', color: '#1f6f64' },
  { id: 'label-ws', projectId: project.id, name: 'Realtime', color: '#2b4a66' },
  { id: 'label-test', projectId: project.id, name: 'Test', color: '#5a3b2a' },
  { id: 'label-risk', projectId: project.id, name: 'Risk', color: '#c65c4a' },
];

const seedIssues: IssueDto[] = [
  {
    id: 'issue-101',
    projectId: project.id,
    number: 101,
    title: 'Bootstrap PM dashboard shell',
    description: 'Create the initial app shell with navigation and status summary.',
    stage: 'BACKLOG',
    assignedAgentId: null,
    labels: [labels[0], labels[1]],
  },
  {
    id: 'issue-102',
    projectId: project.id,
    number: 102,
    title: 'Wire Kanban drag and drop',
    description: 'Add drag interactions with optimistic updates.',
    stage: 'TODO',
    assignedAgentId: 'A-12',
    labels: [labels[1], labels[3]],
  },
  {
    id: 'issue-103',
    projectId: project.id,
    number: 103,
    title: 'Context pack ingestion',
    description: 'Normalize context pack files and pipeline into spec generator.',
    stage: 'CONTEXT_PACK',
    assignedAgentId: 'A-08',
    labels: [labels[2]],
  },
  {
    id: 'issue-104',
    projectId: project.id,
    number: 104,
    title: 'Spec review template',
    description: 'Define review checks and rubric for spec approval.',
    stage: 'SPEC',
    assignedAgentId: null,
    labels: [labels[0], labels[4]],
  },
  {
    id: 'issue-105',
    projectId: project.id,
    number: 105,
    title: 'Implementation checklist',
    description: 'Turn spec into stepwise implementation guide.',
    stage: 'IMPLEMENT',
    assignedAgentId: 'A-04',
    labels: [labels[3]],
  },
  {
    id: 'issue-106',
    projectId: project.id,
    number: 106,
    title: 'PR review scout automation',
    description: 'Wire scout findings into attribution pipeline.',
    stage: 'PR_REVIEW',
    assignedAgentId: 'A-19',
    labels: [labels[1], labels[2]],
  },
  {
    id: 'issue-107',
    projectId: project.id,
    number: 107,
    title: 'Regression test kit',
    description: 'Bundle the core tests and ensure CI runs them.',
    stage: 'TESTING',
    assignedAgentId: null,
    labels: [labels[3]],
  },
  {
    id: 'issue-108',
    projectId: project.id,
    number: 108,
    title: 'Publish release notes',
    description: 'Draft and publish notes for the sprint release.',
    stage: 'DONE',
    assignedAgentId: 'A-02',
    labels: [labels[0]],
  },
];

const seedComments: Record<string, CommentDto[]> = {
  'issue-102': [
    {
      id: 'comment-1',
      issueId: 'issue-102',
      content: 'Drag target zones should highlight when active.',
      authorType: 'human',
      authorName: 'Morgan',
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
    },
  ],
  'issue-105': [
    {
      id: 'comment-2',
      issueId: 'issue-105',
      content: 'Checklist should mirror the spec sections in order.',
      authorType: 'agent',
      authorName: 'Falcon Agent',
      createdAt: Date.now() - 1000 * 60 * 45,
    },
  ],
};

let issues = seedIssues.map((issue) => ({ ...issue, labels: [...issue.labels] }));
let comments = Object.fromEntries(
  Object.entries(seedComments).map(([issueId, entries]) => [
    issueId,
    entries.map((comment) => ({ ...comment })),
  ]),
);
let commentCounter = 3;

export function resetMockData() {
  issues = seedIssues.map((issue) => ({ ...issue, labels: [...issue.labels] }));
  comments = Object.fromEntries(
    Object.entries(seedComments).map(([issueId, entries]) => [
      issueId,
      entries.map((comment) => ({ ...comment })),
    ]),
  );
  commentCounter = 3;
}

export function listProjects(): ProjectDto[] {
  return [project];
}

export function listIssues(projectId: string): IssueDto[] {
  return issues.filter((issue) => issue.projectId === projectId);
}

export function listLabels(projectId: string): LabelDto[] {
  return labels.filter((label) => label.projectId === projectId);
}

export function listComments(issueId: string): CommentDto[] {
  return comments[issueId] ?? [];
}

export function addComment(issueId: string, content: string, authorName?: string): CommentDto {
  const comment: CommentDto = {
    id: `comment-${commentCounter++}`,
    issueId,
    content,
    authorType: authorName ? 'human' : 'agent',
    authorName: authorName ?? 'Falcon Agent',
    createdAt: Date.now(),
  };
  comments[issueId] = [...(comments[issueId] ?? []), comment];
  return comment;
}

export function moveIssue(issueId: string, toStage: IssueStage): IssueDto | null {
  let updated: IssueDto | null = null;
  issues = issues.map((issue) => {
    if (issue.id !== issueId) {
      return issue;
    }
    updated = { ...issue, stage: toStage };
    return updated;
  });
  return updated;
}

export function updateIssueLabels(issueId: string, labelIds: string[]): IssueDto | null {
  let updated: IssueDto | null = null;
  issues = issues.map((issue) => {
    if (issue.id !== issueId) {
      return issue;
    }
    const nextLabels = labels.filter((label) => labelIds.includes(label.id));
    updated = { ...issue, labels: nextLabels };
    return updated;
  });
  return updated;
}
