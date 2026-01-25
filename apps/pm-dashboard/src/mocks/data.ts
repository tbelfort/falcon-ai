import type { CommentDto, IssueDto, IssueStage, LabelDto, ProjectDto } from '../types';

interface MockDb {
  project: ProjectDto;
  labels: LabelDto[];
  issues: IssueDto[];
  comments: CommentDto[];
}

const now = Date.now();

function createDb(): MockDb {
  const project: ProjectDto = {
    id: 'project-falcon',
    name: 'Falcon PM',
    slug: 'falcon-pm'
  };

  const labels: LabelDto[] = [
    {
      id: 'label-ops',
      projectId: project.id,
      name: 'Ops',
      color: '#f4a259'
    },
    {
      id: 'label-ui',
      projectId: project.id,
      name: 'UI',
      color: '#1f8a70'
    },
    {
      id: 'label-qa',
      projectId: project.id,
      name: 'QA',
      color: '#f6b271'
    },
    {
      id: 'label-docs',
      projectId: project.id,
      name: 'Docs',
      color: '#66d3b7'
    }
  ];

  const issues: IssueDto[] = [
    {
      id: 'issue-1',
      projectId: project.id,
      number: 101,
      title: 'Clarify onboarding checklist',
      description: 'Capture the missing onboarding steps and edge cases for new agents.',
      stage: 'BACKLOG',
      assignedAgentId: null,
      labels: [labels[0]]
    },
    {
      id: 'issue-2',
      projectId: project.id,
      number: 102,
      title: 'Stabilize WS subscriptions',
      description: 'Ensure the websocket handshake handles reconnects without losing events.',
      stage: 'TODO',
      assignedAgentId: 'agent-07',
      labels: [labels[1]]
    },
    {
      id: 'issue-3',
      projectId: project.id,
      number: 103,
      title: 'Collect PR review heuristics',
      description: 'Compile review patterns the agents should surface during PR review.',
      stage: 'CONTEXT_PACK',
      assignedAgentId: 'agent-03',
      labels: [labels[3]]
    },
    {
      id: 'issue-4',
      projectId: project.id,
      number: 104,
      title: 'Define stage gating rules',
      description: 'Draft the rules that govern transitions in Sprint 2.',
      stage: 'SPEC',
      assignedAgentId: null,
      labels: [labels[0], labels[2]]
    },
    {
      id: 'issue-5',
      projectId: project.id,
      number: 105,
      title: 'Build Kanban lane skeleton',
      description: 'Implement the core Kanban board layout and default columns.',
      stage: 'IMPLEMENT',
      assignedAgentId: 'agent-12',
      labels: [labels[1], labels[2]]
    },
    {
      id: 'issue-6',
      projectId: project.id,
      number: 106,
      title: 'Audit error banner flows',
      description: 'Check for error state coverage across the UI screens.',
      stage: 'PR_REVIEW',
      assignedAgentId: 'agent-02',
      labels: [labels[0], labels[1]]
    },
    {
      id: 'issue-7',
      projectId: project.id,
      number: 107,
      title: 'Add drag and drop tests',
      description: 'Finalize the drag-and-drop coverage for the Kanban board.',
      stage: 'TESTING',
      assignedAgentId: 'agent-09',
      labels: [labels[2]]
    },
    {
      id: 'issue-8',
      projectId: project.id,
      number: 108,
      title: 'Seed labels and comments',
      description: 'Create the default label palette and comment fixtures.',
      stage: 'DONE',
      assignedAgentId: null,
      labels: [labels[3]]
    }
  ];

  const comments: CommentDto[] = [
    {
      id: 'comment-1',
      issueId: 'issue-2',
      content: 'Handshake retries look good, but we need to resend subscriptions.',
      authorType: 'agent',
      authorName: 'Atlas',
      createdAt: now - 1000 * 60 * 45
    },
    {
      id: 'comment-2',
      issueId: 'issue-2',
      content: 'I will add a reconnect backoff and update the client hook.',
      authorType: 'human',
      authorName: 'Tessa',
      createdAt: now - 1000 * 60 * 10
    }
  ];

  return { project, labels, issues, comments };
}

let db = createDb();
let commentCounter = db.comments.length + 1;

export const mockControl = {
  transitionErrors: new Set<string>()
};

export const mockIds = {
  projectId: 'project-falcon',
  todoIssueId: 'issue-2'
};

export function resetMockDb() {
  db = createDb();
  commentCounter = db.comments.length + 1;
  mockControl.transitionErrors.clear();
}

export function listProjects() {
  return [db.project];
}

export function listIssues(projectId: string) {
  return db.issues.filter((issue) => issue.projectId === projectId);
}

export function listLabels(projectId: string) {
  return db.labels.filter((label) => label.projectId === projectId);
}

export function listComments(issueId: string) {
  return db.comments.filter((comment) => comment.issueId === issueId);
}

export function addComment(issueId: string, content: string, authorName?: string) {
  const comment: CommentDto = {
    id: `comment-${commentCounter++}`,
    issueId,
    content,
    authorType: authorName ? 'human' : 'agent',
    authorName: authorName ?? 'Falcon',
    createdAt: Date.now()
  };
  db.comments.push(comment);
  return comment;
}

export function transitionIssue(issueId: string, toStage: IssueStage) {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  issue.stage = toStage;
  return issue;
}

export function updateIssueLabels(issueId: string, labelIds: string[]) {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  const labels = db.labels.filter((label) => labelIds.includes(label.id));
  issue.labels = labels;
  return issue;
}

export function isValidLabelIds(projectId: string, labelIds: string[]) {
  const valid = new Set(db.labels.filter((label) => label.projectId === projectId).map((label) => label.id));
  return labelIds.every((id) => valid.has(id));
}
