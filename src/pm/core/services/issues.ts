import { randomUUID } from 'node:crypto';
import type {
  Issue,
  IssuePriority,
  IssueStage,
  IssueStatus,
  Label,
} from '../types.js';
import type { IssueRepository } from '../repos/issues-repo.js';
import type { LabelRepository } from '../repos/labels-repo.js';
import type { ProjectRepository } from '../repos/projects-repo.js';
import { canTransition } from '../stage-machine.js';
import {
  invalidTransitionError,
  notFoundError,
  validationError,
} from './errors.js';
import { toKebabCase } from './slug.js';

export interface CreateIssueInput {
  projectId: string;
  title: string;
  description?: string | null;
  priority?: IssuePriority;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  priority?: IssuePriority;
  labelIds?: string[];
}

export interface StartIssueResult {
  issue: Issue;
  branchName: string;
  nextStage: IssueStage;
}

export interface IssueService {
  listIssues(projectId: string): Issue[];
  getIssue(id: string): Issue;
  createIssue(input: CreateIssueInput): Issue;
  updateIssue(id: string, input: UpdateIssueInput): Issue;
  deleteIssue(id: string): Issue;
  startIssue(id: string, presetId: string): StartIssueResult;
  transitionIssue(id: string, toStage: IssueStage): Issue;
}

const STARTABLE_STATUSES: IssueStatus[] = ['backlog', 'todo'];
const STARTABLE_STAGES: IssueStage[] = ['BACKLOG', 'TODO'];

export function createIssueService(
  repos: {
    projects: ProjectRepository;
    issues: IssueRepository;
    labels: LabelRepository;
  },
  now: () => number
): IssueService {
  const listIssues = (projectId: string): Issue[] => {
    const project = repos.projects.getById(projectId);
    if (!project) {
      throw notFoundError('Project not found', { projectId });
    }
    return repos.issues.listByProject(projectId);
  };

  const getIssue = (id: string): Issue => {
    const issue = repos.issues.getById(id);
    if (!issue) {
      throw notFoundError('Issue not found', { id });
    }
    return issue;
  };

  const createIssue = (input: CreateIssueInput): Issue => {
    const project = repos.projects.getById(input.projectId);
    if (!project) {
      throw notFoundError('Project not found', { projectId: input.projectId });
    }

    const timestamp = now();
    const issue: Issue = {
      id: randomUUID(),
      projectId: input.projectId,
      number: repos.issues.getNextNumber(input.projectId),
      title: input.title,
      description: input.description ?? null,
      status: 'backlog',
      stage: 'BACKLOG',
      priority: input.priority ?? 'medium',
      labels: [],
      presetId: null,
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
    };

    return repos.issues.create(issue);
  };

  const updateIssue = (id: string, input: UpdateIssueInput): Issue => {
    const existing = repos.issues.getById(id);
    if (!existing) {
      throw notFoundError('Issue not found', { id });
    }

    let labels = existing.labels;
    if (input.labelIds) {
      labels = resolveLabelsForIssue(existing, input.labelIds, repos.labels);
    }

    const updated: Issue = {
      ...existing,
      labels,
      updatedAt: now(),
    };

    if (input.title !== undefined) {
      updated.title = input.title;
    }

    if (input.description !== undefined) {
      updated.description = input.description;
    }

    if (input.priority !== undefined) {
      updated.priority = input.priority;
    }

    return repos.issues.update(updated);
  };

  const deleteIssue = (id: string): Issue => {
    const removed = repos.issues.delete(id);
    if (!removed) {
      throw notFoundError('Issue not found', { id });
    }
    return removed;
  };

  const startIssue = (id: string, presetId: string): StartIssueResult => {
    const issue = repos.issues.getById(id);
    if (!issue) {
      throw notFoundError('Issue not found', { id });
    }

    if (
      !STARTABLE_STATUSES.includes(issue.status) ||
      !STARTABLE_STAGES.includes(issue.stage)
    ) {
      throw invalidTransitionError('Issue is not startable', {
        status: issue.status,
        stage: issue.stage,
      });
    }

    const timestamp = now();
    const slug = toKebabCase(issue.title) || 'issue';
    const branchName = `issue/${issue.number}-${slug}`;

    const updated: Issue = {
      ...issue,
      presetId,
      status: 'in_progress',
      stage: 'CONTEXT_PACK',
      startedAt: timestamp,
      branchName,
      updatedAt: timestamp,
    };

    const stored = repos.issues.update(updated);

    return {
      issue: stored,
      branchName,
      nextStage: 'CONTEXT_PACK',
    };
  };

  const transitionIssue = (id: string, toStage: IssueStage): Issue => {
    const issue = repos.issues.getById(id);
    if (!issue) {
      throw notFoundError('Issue not found', { id });
    }

    if (!canTransition(issue.stage, toStage)) {
      throw invalidTransitionError('Invalid stage transition', {
        fromStage: issue.stage,
        toStage,
      });
    }

    const timestamp = now();
    const updated: Issue = {
      ...issue,
      stage: toStage,
      updatedAt: timestamp,
    };

    if (toStage === 'DONE') {
      updated.status = 'done';
      updated.completedAt = timestamp;
    }

    return repos.issues.update(updated);
  };

  return {
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    deleteIssue,
    startIssue,
    transitionIssue,
  };
}

function resolveLabelsForIssue(
  issue: Issue,
  labelIds: string[],
  labelsRepo: LabelRepository
): Label[] {
  const uniqueLabelIds = Array.from(new Set(labelIds));
  const labels = labelsRepo.getByIds(uniqueLabelIds);
  const labelsById = new Map(labels.map((label) => [label.id, label]));

  if (labels.length !== uniqueLabelIds.length) {
    const missing = uniqueLabelIds.filter((id) => !labelsById.has(id));
    throw validationError('One or more labels were not found', {
      missingLabelIds: missing,
    });
  }

  const foreignLabels = labels.filter(
    (label) => label.projectId !== issue.projectId
  );
  if (foreignLabels.length > 0) {
    throw validationError('Labels must belong to the same project', {
      invalidLabelIds: foreignLabels.map((label) => label.id),
    });
  }

  return uniqueLabelIds.map((id) => labelsById.get(id) as Label);
}
