import type {
  CommentDto,
  FindingDto,
  FindingStatus,
  IssueDto,
  IssueFindingsDto,
  IssueStage,
  LabelDto,
  OrchestratorStatusDto,
  PresetConfig,
  PresetDto,
  ProjectDto,
} from '@/api/types';

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
      createdAt: Math.floor(Date.now() / 1000) - 60 * 60 * 3,
    },
  ],
  'issue-105': [
    {
      id: 'comment-2',
      issueId: 'issue-105',
      content: 'Checklist should mirror the spec sections in order.',
      authorType: 'agent',
      authorName: 'Falcon Agent',
      createdAt: Math.floor(Date.now() / 1000) - 60 * 45,
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

const seedFindings: Record<string, IssueFindingsDto> = {
  'issue-101': {
    prNumber: 412,
    prUrl: 'https://github.com/example/falcon-ai/pull/412',
    findings: [
      {
        id: 'finding-101',
        findingType: 'error',
        category: 'security',
        filePath: 'src/auth.ts',
        lineNumber: 42,
        message: 'Potential SQL injection',
        suggestion: 'Use parameterized queries',
        foundBy: 'claude-sonnet-4',
        confirmedBy: 'claude-opus-4.5',
        confidence: 0.95,
        status: 'pending',
      },
    ],
    summary: { total: 1, pending: 1, approved: 0, dismissed: 0 },
  },
  'issue-106': {
    prNumber: 431,
    prUrl: 'https://github.com/example/falcon-ai/pull/431',
    findings: [
      {
        id: 'finding-1',
        findingType: 'error',
        category: 'security',
        filePath: 'src/auth.ts',
        lineNumber: 42,
        message: 'Potential SQL injection',
        suggestion: 'Use parameterized queries',
        foundBy: 'claude-sonnet-4',
        confirmedBy: 'claude-opus-4.5',
        confidence: 0.95,
        status: 'pending',
      },
      {
        id: 'finding-2',
        findingType: 'warning',
        category: 'reliability',
        filePath: 'src/api/cache.ts',
        lineNumber: 108,
        message: 'Cache key is missing tenant namespace',
        suggestion: 'Prefix key with tenant id',
        foundBy: 'claude-sonnet-4',
        confirmedBy: 'claude-opus-4.5',
        confidence: 0.82,
        status: 'approved',
      },
      {
        id: 'finding-3',
        findingType: 'note',
        category: 'style',
        filePath: 'src/ui/Panel.tsx',
        lineNumber: 12,
        message: 'Consider extracting the shared header styles',
        suggestion: 'Move styles to a reusable component',
        foundBy: 'claude-sonnet-4',
        confirmedBy: 'claude-opus-4.5',
        confidence: 0.55,
        status: 'dismissed',
      },
    ],
    summary: { total: 3, pending: 1, approved: 1, dismissed: 1 },
  },
};

const seedPresets: PresetDto[] = [
  {
    id: 'preset-default',
    name: 'full-pipeline',
    description: 'Default orchestration pipeline',
    isDefault: true,
    config: {
      stages: ['CONTEXT_PACK', 'SPEC', 'IMPLEMENT', 'PR_REVIEW', 'TESTING'],
      models: {
        default: 'gpt-4o',
        overrides: {
          PR_REVIEW: 'claude-opus-4.5',
        },
      },
      prReview: {
        orchestrator: 'claude-opus-4.5',
        scouts: ['claude-sonnet-4', 'gpt-4o'],
        judge: 'claude-opus-4.5',
      },
    },
  },
  {
    id: 'preset-fast',
    name: 'fast-pass',
    description: 'Shortened pipeline for small fixes',
    isDefault: false,
    config: {
      stages: ['IMPLEMENT', 'PR_REVIEW', 'TESTING'],
      models: {
        default: 'gpt-4o-mini',
      },
    },
  },
];

const seedOrchestratorStatus: OrchestratorStatusDto = {
  running: true,
  activeIssues: 2,
  queuedIssues: 4,
  activeAgents: [
    { agentId: 'A-04', issueId: 'issue-105', stage: 'IMPLEMENT' },
    { agentId: 'A-19', issueId: 'issue-106', stage: 'PR_REVIEW' },
  ],
};

let findingsByIssueId = Object.fromEntries(
  Object.entries(seedFindings).map(([issueId, payload]) => [
    issueId,
    {
      ...payload,
      findings: payload.findings.map((finding) => ({ ...finding })),
      summary: { ...payload.summary },
    },
  ]),
) as Record<string, IssueFindingsDto>;
let presets = seedPresets.map((preset) => ({
  ...preset,
  config: { ...preset.config, models: { ...preset.config.models } },
}));
let presetCounter = 3;
let orchestratorStatus = {
  ...seedOrchestratorStatus,
  activeAgents: seedOrchestratorStatus.activeAgents.map((agent) => ({ ...agent })),
};

export function resetMockData() {
  issues = seedIssues.map((issue) => ({ ...issue, labels: [...issue.labels] }));
  comments = Object.fromEntries(
    Object.entries(seedComments).map(([issueId, entries]) => [
      issueId,
      entries.map((comment) => ({ ...comment })),
    ]),
  );
  commentCounter = 3;
  findingsByIssueId = Object.fromEntries(
    Object.entries(seedFindings).map(([issueId, payload]) => [
      issueId,
      {
        ...payload,
        findings: payload.findings.map((finding) => ({ ...finding })),
        summary: { ...payload.summary },
      },
    ]),
  ) as Record<string, IssueFindingsDto>;
  presets = seedPresets.map((preset) => ({
    ...preset,
    config: { ...preset.config, models: { ...preset.config.models } },
  }));
  presetCounter = 3;
  orchestratorStatus = {
    ...seedOrchestratorStatus,
    activeAgents: seedOrchestratorStatus.activeAgents.map((agent) => ({ ...agent })),
  };
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

export function addComment(
  issueId: string,
  content: string,
  authorType?: 'human' | 'agent',
  authorName?: string,
): CommentDto {
  const comment: CommentDto = {
    id: `comment-${commentCounter++}`,
    issueId,
    content,
    authorType: authorType ?? (authorName ? 'human' : 'agent'),
    authorName: authorName ?? 'Falcon Agent',
    createdAt: Math.floor(Date.now() / 1000),
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

function summarizeFindings(findings: FindingDto[]) {
  return findings.reduce(
    (acc, finding) => {
      acc.total += 1;
      if (finding.status === 'pending') {
        acc.pending += 1;
      }
      if (finding.status === 'approved') {
        acc.approved += 1;
      }
      if (finding.status === 'dismissed') {
        acc.dismissed += 1;
      }
      return acc;
    },
    { total: 0, pending: 0, approved: 0, dismissed: 0 },
  );
}

export function getOrchestratorStatus(): OrchestratorStatusDto {
  return {
    ...orchestratorStatus,
    activeAgents: orchestratorStatus.activeAgents.map((agent) => ({ ...agent })),
  };
}

export function listFindings(issueId: string): IssueFindingsDto | null {
  const entry = findingsByIssueId[issueId];
  if (!entry) {
    return null;
  }
  return {
    ...entry,
    findings: entry.findings.map((finding) => ({ ...finding })),
    summary: summarizeFindings(entry.findings),
  };
}

export function reviewFinding(findingId: string, status: FindingStatus): FindingDto | null {
  let updated: FindingDto | null = null;
  Object.keys(findingsByIssueId).forEach((issueId) => {
    const entry = findingsByIssueId[issueId];
    entry.findings = entry.findings.map((finding) => {
      if (finding.id !== findingId) {
        return finding;
      }
      updated = { ...finding, status };
      return updated;
    });
    findingsByIssueId[issueId] = {
      ...entry,
      summary: summarizeFindings(entry.findings),
    };
  });
  return updated;
}

export function listPresets(): PresetDto[] {
  return presets.map((preset) => ({
    ...preset,
    config: { ...preset.config, models: { ...preset.config.models } },
  }));
}

export function createPreset(input: {
  name: string;
  config: PresetConfig;
  description?: string | null;
  isDefault?: boolean;
}): PresetDto {
  const preset: PresetDto = {
    id: `preset-${presetCounter++}`,
    name: input.name,
    description: input.description ?? null,
    isDefault: input.isDefault ?? false,
    config: input.config,
  };
  presets = [...presets, preset];
  return preset;
}

export function updatePreset(presetId: string, updates: Partial<PresetDto>): PresetDto | null {
  let updated: PresetDto | null = null;
  presets = presets.map((preset) => {
    if (preset.id !== presetId) {
      return preset;
    }
    updated = {
      ...preset,
      ...updates,
      config: updates.config ?? preset.config,
      description: updates.description ?? preset.description ?? null,
    };
    return updated;
  });
  return updated;
}

export function removePreset(presetId: string): boolean {
  const before = presets.length;
  presets = presets.filter((preset) => preset.id !== presetId);
  return presets.length < before;
}
