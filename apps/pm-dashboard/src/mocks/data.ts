import type { CommentDto, IssueDto, LabelDto, ProjectDto } from '../api/types';

export interface MockDb {
  projects: ProjectDto[];
  labels: LabelDto[];
  issues: IssueDto[];
  comments: CommentDto[];
}

function seedDb(): MockDb {
  const projects: ProjectDto[] = [
    {
      id: 'project-aurora',
      name: 'Aurora Guardrails',
      slug: 'aurora',
    },
  ];

  const labels: LabelDto[] = [
    { id: 'label-urgent', projectId: projects[0].id, name: 'Urgent', color: '#fb7185' },
    { id: 'label-research', projectId: projects[0].id, name: 'Research', color: '#38bdf8' },
    { id: 'label-ui', projectId: projects[0].id, name: 'UI', color: '#a3e635' },
    { id: 'label-api', projectId: projects[0].id, name: 'API', color: '#f59e0b' },
    { id: 'label-docs', projectId: projects[0].id, name: 'Docs', color: '#c084fc' },
  ];

  const issues: IssueDto[] = [
    {
      id: 'issue-101',
      projectId: projects[0].id,
      number: 101,
      title: 'Define stage transition policies',
      description: 'Clarify valid stage transitions for the pipeline.',
      stage: 'BACKLOG',
      assignedAgentId: null,
      labels: [labels[0], labels[3]],
    },
    {
      id: 'issue-102',
      projectId: projects[0].id,
      number: 102,
      title: 'Context pack UI polishing',
      description: 'Improve the context pack detail layout and readability.',
      stage: 'TODO',
      assignedAgentId: 'agent-celeste',
      labels: [labels[2]],
    },
    {
      id: 'issue-103',
      projectId: projects[0].id,
      number: 103,
      title: 'Automate label sync',
      description: 'Keep labels aligned with Linear metadata.',
      stage: 'CONTEXT_PACK',
      assignedAgentId: 'agent-io',
      labels: [labels[1], labels[3]],
    },
    {
      id: 'issue-104',
      projectId: projects[0].id,
      number: 104,
      title: 'Spec review checklist',
      description: 'Draft the spec review checklist for Phase 3.',
      stage: 'SPEC_REVIEW',
      assignedAgentId: null,
      labels: [labels[4]],
    },
    {
      id: 'issue-105',
      projectId: projects[0].id,
      number: 105,
      title: 'Implement Kanban drag safety',
      description: 'Ensure drag-drop emits optimistic updates and rollbacks.',
      stage: 'IMPLEMENT',
      assignedAgentId: 'agent-river',
      labels: [labels[2], labels[0]],
    },
    {
      id: 'issue-106',
      projectId: projects[0].id,
      number: 106,
      title: 'PR review automation',
      description: 'Integrate automatic PR review triggers.',
      stage: 'PR_REVIEW',
      assignedAgentId: 'agent-scout',
      labels: [labels[3]],
    },
    {
      id: 'issue-107',
      projectId: projects[0].id,
      number: 107,
      title: 'Testing harness for WS events',
      description: 'Add mock data for websocket events.',
      stage: 'TESTING',
      assignedAgentId: null,
      labels: [labels[1]],
    },
    {
      id: 'issue-108',
      projectId: projects[0].id,
      number: 108,
      title: 'Docs for Phase 2 handoff',
      description: 'Provide documentation for the UI handoff.',
      stage: 'DONE',
      assignedAgentId: null,
      labels: [labels[4]],
    },
  ];

  const comments: CommentDto[] = [
    {
      id: 'comment-1',
      issueId: 'issue-102',
      content: 'Keep the hero banner lean and focus on clarity.',
      authorType: 'human',
      authorName: 'PM Team',
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
    },
    {
      id: 'comment-2',
      issueId: 'issue-105',
      content: 'Ensure we revert optimistic moves on invalid transitions.',
      authorType: 'agent',
      authorName: 'Falcon Agent',
      createdAt: Date.now() - 1000 * 60 * 60 * 2,
    },
  ];

  return { projects, labels, issues, comments };
}

let db = seedDb();
let commentCounter = 3;

export function getDb() {
  return db;
}

export function resetDb() {
  db = seedDb();
  commentCounter = 3;
}

export function createComment(issueId: string, content: string, authorName?: string) {
  const comment: CommentDto = {
    id: `comment-${commentCounter++}`,
    issueId,
    content,
    authorType: 'human',
    authorName: authorName ?? 'You',
    createdAt: Date.now(),
  };
  db.comments.push(comment);
  return comment;
}

export function updateIssueStage(issueId: string, stage: IssueDto['stage']) {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  issue.stage = stage;
  return issue;
}

export function updateIssueLabels(issueId: string, labelIds: string[]) {
  const issue = db.issues.find((item) => item.id === issueId);
  if (!issue) {
    return null;
  }
  issue.labels = db.labels.filter((label) => labelIds.includes(label.id));
  return issue;
}
