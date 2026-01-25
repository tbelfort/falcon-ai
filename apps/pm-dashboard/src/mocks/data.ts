import type { CommentDto, IssueDto, IssueStage, LabelDto, ProjectDto } from '../types';

interface MockData {
  projects: ProjectDto[];
  labels: LabelDto[];
  issues: IssueDto[];
  comments: CommentDto[];
}

const seedData: MockData = {
  projects: [
    {
      id: 'project-falcon',
      name: 'Falcon PM',
      slug: 'falcon-pm'
    }
  ],
  labels: [
    {
      id: 'label-bug',
      projectId: 'project-falcon',
      name: 'Bug',
      color: '#E3644E'
    },
    {
      id: 'label-infra',
      projectId: 'project-falcon',
      name: 'Infra',
      color: '#3B82F6'
    },
    {
      id: 'label-ux',
      projectId: 'project-falcon',
      name: 'UX',
      color: '#F59E0B'
    },
    {
      id: 'label-llm',
      projectId: 'project-falcon',
      name: 'LLM',
      color: '#10B981'
    }
  ],
  issues: [
    {
      id: 'issue-1',
      projectId: 'project-falcon',
      number: 1021,
      title: 'Kanban board initial layout',
      description: 'Create the initial column layout and stage headers.',
      stage: 'BACKLOG',
      assignedAgentId: 'agent-a1',
      labels: []
    },
    {
      id: 'issue-2',
      projectId: 'project-falcon',
      number: 1022,
      title: 'Wireframe issue modal',
      description: 'Draft the issue detail modal structure and action zones.',
      stage: 'TODO',
      assignedAgentId: null,
      labels: []
    },
    {
      id: 'issue-3',
      projectId: 'project-falcon',
      number: 1023,
      title: 'Compile context pack for drag/drop',
      description: 'Summarize drag/drop patterns for DnD kit usage.',
      stage: 'CONTEXT_PACK',
      assignedAgentId: 'agent-b4',
      labels: []
    },
    {
      id: 'issue-4',
      projectId: 'project-falcon',
      number: 1024,
      title: 'Review context pack for DnD',
      description: 'Validate the context pack for missing constraints.',
      stage: 'CONTEXT_REVIEW',
      assignedAgentId: null,
      labels: []
    },
    {
      id: 'issue-5',
      projectId: 'project-falcon',
      number: 1025,
      title: 'Spec for label editing flow',
      description: 'Define label editing interactions and validation.',
      stage: 'SPEC',
      assignedAgentId: 'agent-c9',
      labels: []
    },
    {
      id: 'issue-6',
      projectId: 'project-falcon',
      number: 1026,
      title: 'Implement modal comment form',
      description: 'Add comment author input and submit handler.',
      stage: 'IMPLEMENT',
      assignedAgentId: 'agent-a1',
      labels: []
    },
    {
      id: 'issue-7',
      projectId: 'project-falcon',
      number: 1027,
      title: 'QA review of kanban interactions',
      description: 'Validate drag/drop behavior and optimistic updates.',
      stage: 'TESTING',
      assignedAgentId: null,
      labels: []
    },
    {
      id: 'issue-8',
      projectId: 'project-falcon',
      number: 1028,
      title: 'Docs for PM dashboard UI',
      description: 'Update docs with usage and runbook steps.',
      stage: 'MERGE_READY',
      assignedAgentId: 'agent-b4',
      labels: []
    }
  ],
  comments: [
    {
      id: 'comment-1',
      issueId: 'issue-2',
      content: 'Let us keep the modal wide enough for labels and comments.',
      authorType: 'human',
      authorName: 'Riley',
      createdAt: 1714550400000
    },
    {
      id: 'comment-2',
      issueId: 'issue-6',
      content: 'Form should support quick author alias.',
      authorType: 'agent',
      authorName: 'Falcon Bot',
      createdAt: 1714636800000
    }
  ]
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let data: MockData = clone(seedData);

const issueLabelSeeds: Record<string, string[]> = {
  'issue-1': ['label-ux'],
  'issue-2': ['label-ux', 'label-bug'],
  'issue-3': ['label-llm'],
  'issue-4': ['label-llm'],
  'issue-5': ['label-ux'],
  'issue-6': ['label-infra'],
  'issue-7': ['label-bug'],
  'issue-8': ['label-infra', 'label-llm']
};

function applyLabelSeeds() {
  data.issues = data.issues.map((issue) => ({
    ...issue,
    labels: data.labels.filter((label) => issueLabelSeeds[issue.id]?.includes(label.id))
  }));
}

applyLabelSeeds();

export function resetMockData() {
  data = clone(seedData);
  applyLabelSeeds();
}

export const mockDb = {
  getProjects() {
    return data.projects;
  },
  getLabels(projectId: string) {
    return data.labels.filter((label) => label.projectId === projectId);
  },
  getIssues(projectId: string) {
    return data.issues.filter((issue) => issue.projectId === projectId);
  },
  getIssue(issueId: string) {
    return data.issues.find((issue) => issue.id === issueId) ?? null;
  },
  getComments(issueId: string) {
    return data.comments.filter((comment) => comment.issueId === issueId);
  },
  addComment(issueId: string, content: string, authorName?: string): CommentDto {
    const comment: CommentDto = {
      id: `comment-${data.comments.length + 1}`,
      issueId,
      content,
      authorType: 'human',
      authorName: authorName ?? 'You',
      createdAt: Date.now()
    };
    data.comments = [...data.comments, comment];
    return comment;
  },
  transitionIssue(issueId: string, toStage: IssueStage) {
    const issue = data.issues.find((item) => item.id === issueId);
    if (!issue) {
      return { error: { code: 'NOT_FOUND', message: 'Issue not found' } } as const;
    }
    if (toStage === 'DONE' && issue.stage !== 'MERGE_READY') {
      return {
        error: {
          code: 'INVALID_TRANSITION',
          message: 'Issue must be merge-ready before moving to Done.'
        }
      } as const;
    }
    issue.stage = toStage;
    return issue;
  },
  updateIssueLabels(issueId: string, labelIds: string[]) {
    const issue = data.issues.find((item) => item.id === issueId);
    if (!issue) {
      return { error: { code: 'NOT_FOUND', message: 'Issue not found' } } as const;
    }
    issue.labels = data.labels.filter((label) => labelIds.includes(label.id));
    return issue;
  }
};
