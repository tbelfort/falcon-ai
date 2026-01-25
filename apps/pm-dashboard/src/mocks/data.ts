import { CommentDto, IssueDto, IssueStage, LabelDto, ProjectDto } from '../api/types';

export type MockDb = {
  projects: ProjectDto[];
  labels: LabelDto[];
  issues: IssueDto[];
  comments: CommentDto[];
};

function createMockDb(): MockDb {
  const projectId = 'project-falcon';
  const labels: LabelDto[] = [
    { id: 'label-ui', projectId, name: 'UI', color: '#1D9BF0' },
    { id: 'label-bug', projectId, name: 'Bug', color: '#EF4444' },
    { id: 'label-data', projectId, name: 'Data', color: '#10B981' },
    { id: 'label-priority', projectId, name: 'High Priority', color: '#F97316' }
  ];

  const issues: IssueDto[] = [
    {
      id: 'issue-101',
      projectId,
      number: 101,
      title: 'Sketch Kanban layout',
      description: 'Draft column structure with drag-and-drop affordances.',
      stage: 'BACKLOG',
      assignedAgentId: null,
      labels: [labels[0]]
    },
    {
      id: 'issue-102',
      projectId,
      number: 102,
      title: 'Define label palette for cards',
      description: 'Pick high-contrast colors that read on light surfaces.',
      stage: 'TODO',
      assignedAgentId: 'agent-lumen',
      labels: [labels[0], labels[3]]
    },
    {
      id: 'issue-103',
      projectId,
      number: 103,
      title: 'Context pack: streaming integration',
      description: 'Outline how live updates will surface in the UI.',
      stage: 'CONTEXT_PACK',
      assignedAgentId: null,
      labels: [labels[2]]
    },
    {
      id: 'issue-104',
      projectId,
      number: 104,
      title: 'Spec review: modal information hierarchy',
      description: 'Review the issue modal layout and ensure clarity.',
      stage: 'SPEC_REVIEW',
      assignedAgentId: 'agent-iris',
      labels: [labels[0]]
    },
    {
      id: 'issue-105',
      projectId,
      number: 105,
      title: 'Implement optimistic transitions',
      description: 'Update the UI instantly while awaiting server validation.',
      stage: 'IMPLEMENT',
      assignedAgentId: 'agent-slate',
      labels: [labels[1], labels[3]]
    },
    {
      id: 'issue-106',
      projectId,
      number: 106,
      title: 'Fix flaky comment ordering',
      description: 'Ensure comments appear in chronological order.',
      stage: 'TESTING',
      assignedAgentId: null,
      labels: [labels[1]]
    },
    {
      id: 'issue-107',
      projectId,
      number: 107,
      title: 'Review PR: board styling polish',
      description: 'Validate spacing and typography across stages.',
      stage: 'PR_REVIEW',
      assignedAgentId: 'agent-nova',
      labels: [labels[0]]
    },
    {
      id: 'issue-108',
      projectId,
      number: 108,
      title: 'Ship Kanban UI v1',
      description: 'Merge ready and validate with the PM team.',
      stage: 'DONE',
      assignedAgentId: null,
      labels: [labels[3]]
    }
  ];

  const comments: CommentDto[] = [
    {
      id: 'comment-1',
      issueId: 'issue-102',
      content: 'Let\'s keep labels consistent with the palette from design review.',
      authorType: 'agent',
      authorName: 'agent-lumen',
      createdAt: Date.now() - 1000 * 60 * 45
    },
    {
      id: 'comment-2',
      issueId: 'issue-105',
      content: 'We should show a warning when the server rejects a stage move.',
      authorType: 'human',
      authorName: 'Maya',
      createdAt: Date.now() - 1000 * 60 * 30
    },
    {
      id: 'comment-3',
      issueId: 'issue-105',
      content: 'Agreed. Let\'s revert the card and highlight the banner.',
      authorType: 'agent',
      authorName: 'agent-slate',
      createdAt: Date.now() - 1000 * 60 * 20
    }
  ];

  return {
    projects: [
      {
        id: projectId,
        name: 'Falcon PM Dashboard',
        slug: 'falcon-pm-dashboard'
      }
    ],
    labels,
    issues,
    comments
  };
}

let db = createMockDb();

export function getDb(): MockDb {
  return db;
}

export function resetDb(): void {
  db = createMockDb();
}

export function createComment(issueId: string, content: string, authorName?: string): CommentDto {
  const id = `comment-${db.comments.length + 1}`;
  const comment: CommentDto = {
    id,
    issueId,
    content,
    authorType: 'human',
    authorName: authorName ?? 'You',
    createdAt: Date.now()
  };
  db.comments.push(comment);
  return comment;
}

export function updateIssueStage(issueId: string, toStage: IssueStage): IssueDto | null {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  issue.stage = toStage;
  return issue;
}

export function updateIssueLabels(issueId: string, labelIds: string[]): IssueDto | null {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  issue.labels = db.labels.filter((label) => labelIds.includes(label.id));
  return issue;
}
