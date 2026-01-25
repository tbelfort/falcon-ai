import type { ProjectDto, IssueDto, LabelDto, CommentDto, IssueStage } from '../api/types';

export const mockProject: ProjectDto = {
  id: 'proj-1',
  name: 'Falcon AI',
  slug: 'falcon-ai',
};

export const mockLabels: LabelDto[] = [
  { id: 'lbl-1', projectId: 'proj-1', name: 'bug', color: '#dc2626' },
  { id: 'lbl-2', projectId: 'proj-1', name: 'feature', color: '#2563eb' },
  { id: 'lbl-3', projectId: 'proj-1', name: 'high-priority', color: '#ea580c' },
  { id: 'lbl-4', projectId: 'proj-1', name: 'documentation', color: '#16a34a' },
];

export const mockIssues: IssueDto[] = [
  {
    id: 'iss-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Implement user authentication',
    description: 'Add OAuth2 authentication with GitHub and Google providers.',
    stage: 'BACKLOG',
    assignedAgentId: null,
    labels: [mockLabels[1]],
  },
  {
    id: 'iss-2',
    projectId: 'proj-1',
    number: 2,
    title: 'Fix memory leak in WebSocket handler',
    description: 'Memory usage grows unbounded when clients reconnect frequently.',
    stage: 'TODO',
    assignedAgentId: null,
    labels: [mockLabels[0], mockLabels[2]],
  },
  {
    id: 'iss-3',
    projectId: 'proj-1',
    number: 3,
    title: 'Add pagination to issues list',
    description: 'Implement cursor-based pagination for the issues API endpoint.',
    stage: 'CONTEXT_PACK',
    assignedAgentId: 'agent-context',
    labels: [mockLabels[1]],
  },
  {
    id: 'iss-4',
    projectId: 'proj-1',
    number: 4,
    title: 'Write API documentation',
    description: 'Create OpenAPI spec and generate documentation site.',
    stage: 'SPEC',
    assignedAgentId: 'agent-spec',
    labels: [mockLabels[3]],
  },
  {
    id: 'iss-5',
    projectId: 'proj-1',
    number: 5,
    title: 'Refactor database schema',
    description: 'Normalize the labels table and add proper indexes.',
    stage: 'IMPLEMENT',
    assignedAgentId: 'agent-impl',
    labels: [mockLabels[1]],
  },
  {
    id: 'iss-6',
    projectId: 'proj-1',
    number: 6,
    title: 'Fix XSS vulnerability in comments',
    description: 'Sanitize user input before rendering in the comments section.',
    stage: 'PR_REVIEW',
    assignedAgentId: 'agent-review',
    labels: [mockLabels[0], mockLabels[2]],
  },
  {
    id: 'iss-7',
    projectId: 'proj-1',
    number: 7,
    title: 'Add dark mode support',
    description: 'Implement dark mode theme with system preference detection.',
    stage: 'TESTING',
    assignedAgentId: null,
    labels: [mockLabels[1]],
  },
  {
    id: 'iss-8',
    projectId: 'proj-1',
    number: 8,
    title: 'Update README with new setup instructions',
    description: 'Document the new environment variables and Docker setup.',
    stage: 'DONE',
    assignedAgentId: null,
    labels: [mockLabels[3]],
  },
];

export const mockComments: CommentDto[] = [
  {
    id: 'cmt-1',
    issueId: 'iss-2',
    content: 'I found the root cause - the event listeners are not being cleaned up.',
    authorType: 'human',
    authorName: 'Tom',
    createdAt: Date.now() - 86400000,
  },
  {
    id: 'cmt-2',
    issueId: 'iss-2',
    content: 'Created a fix using WeakRef for the connection tracking.',
    authorType: 'agent',
    authorName: 'Architect Agent',
    createdAt: Date.now() - 43200000,
  },
  {
    id: 'cmt-3',
    issueId: 'iss-5',
    content: 'The migration script is ready for review.',
    authorType: 'agent',
    authorName: 'Implement Agent',
    createdAt: Date.now() - 3600000,
  },
];

// Valid transitions map for mocking server-side validation
const validTransitions: Record<IssueStage, IssueStage[]> = {
  BACKLOG: ['TODO'],
  TODO: ['BACKLOG', 'CONTEXT_PACK'],
  CONTEXT_PACK: ['TODO', 'CONTEXT_REVIEW'],
  CONTEXT_REVIEW: ['CONTEXT_PACK', 'SPEC'],
  SPEC: ['CONTEXT_REVIEW', 'SPEC_REVIEW'],
  SPEC_REVIEW: ['SPEC', 'IMPLEMENT'],
  IMPLEMENT: ['SPEC_REVIEW', 'PR_REVIEW'],
  PR_REVIEW: ['IMPLEMENT', 'PR_HUMAN_REVIEW', 'FIXER'],
  PR_HUMAN_REVIEW: ['PR_REVIEW', 'FIXER', 'MERGE_READY'],
  FIXER: ['PR_REVIEW'],
  TESTING: ['PR_HUMAN_REVIEW', 'DOC_REVIEW', 'FIXER'],
  DOC_REVIEW: ['TESTING', 'MERGE_READY'],
  MERGE_READY: ['DOC_REVIEW', 'DONE'],
  DONE: [],
};

export function isValidTransition(from: IssueStage, to: IssueStage): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}
