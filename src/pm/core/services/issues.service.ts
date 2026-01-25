import { randomUUID } from 'node:crypto';
import type { IssueDto, IssuePriority } from '../../contracts/http.js';
import { canTransition } from '../stage-machine.js';
import { PmError } from '../errors.js';
import type { IssuesRepo, LabelsRepo, ProjectsRepo } from '../repos/index.js';
import { getUnixSeconds, toKebabCase } from './helpers.js';

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

export interface StartIssueInput {
  presetId: string;
}

export interface TransitionIssueInput {
  toStage: IssueDto['stage'];
}

export interface IssueStartResult {
  issue: IssueDto;
  branchName: string;
  nextStage: IssueDto['stage'];
}

export interface IssuesService {
  listByProject(projectId: string): Promise<IssueDto[]>;
  get(id: string): Promise<IssueDto>;
  create(input: CreateIssueInput): Promise<IssueDto>;
  update(id: string, input: UpdateIssueInput): Promise<IssueDto>;
  start(id: string, input: StartIssueInput): Promise<IssueStartResult>;
  transition(id: string, input: TransitionIssueInput): Promise<IssueDto>;
  delete(id: string): Promise<IssueDto>;
}

const STARTABLE_STATUSES = new Set(['backlog', 'todo']);
const STARTABLE_STAGES = new Set(['BACKLOG', 'TODO']);

export function createIssuesService(
  issuesRepo: IssuesRepo,
  labelsRepo: LabelsRepo,
  projectsRepo: ProjectsRepo
): IssuesService {
  return {
    async listByProject(projectId) {
      const project = await projectsRepo.getById(projectId);
      if (!project) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }
      return issuesRepo.listByProject(projectId);
    },
    async get(id) {
      const issue = await issuesRepo.getById(id);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return issue;
    },
    async create(input) {
      const project = await projectsRepo.getById(input.projectId);
      if (!project) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }

      const number = await issuesRepo.getNextNumber(input.projectId);
      const now = getUnixSeconds();
      const issue: IssueDto = {
        id: randomUUID(),
        projectId: input.projectId,
        number,
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
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      };

      return issuesRepo.create(issue);
    },
    async update(id, input) {
      const existing = await issuesRepo.getById(id);
      if (!existing) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      const updates: Partial<IssueDto> = {
        updatedAt: getUnixSeconds(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined)
        updates.description = input.description;
      if (input.priority !== undefined) updates.priority = input.priority;

      if (input.labelIds !== undefined) {
        const labels = await labelsRepo.getByIds(input.labelIds);
        if (labels.length !== input.labelIds.length) {
          throw new PmError('VALIDATION_ERROR', 'One or more labels not found');
        }
        const mismatch = labels.find(
          (label) => label.projectId !== existing.projectId
        );
        if (mismatch) {
          throw new PmError(
            'VALIDATION_ERROR',
            'Labels must belong to the issue project'
          );
        }
        updates.labels = labels;
      }

      const updated = await issuesRepo.update(id, updates);
      if (!updated) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return updated;
    },
    async start(id, input) {
      const issue = await issuesRepo.getById(id);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      if (
        !STARTABLE_STATUSES.has(issue.status) ||
        !STARTABLE_STAGES.has(issue.stage)
      ) {
        throw new PmError(
          'INVALID_TRANSITION',
          'Issue is not in a startable state'
        );
      }

      const branchName = `issue/${issue.number}-${toKebabCase(issue.title)}`;
      const now = getUnixSeconds();
      const updated = await issuesRepo.update(id, {
        presetId: input.presetId,
        status: 'in_progress',
        stage: 'CONTEXT_PACK',
        startedAt: now,
        branchName,
        updatedAt: now,
      });

      if (!updated) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      return { issue: updated, branchName, nextStage: 'CONTEXT_PACK' };
    },
    async transition(id, input) {
      const issue = await issuesRepo.getById(id);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      if (!canTransition(issue.stage, input.toStage)) {
        throw new PmError(
          'INVALID_TRANSITION',
          'Stage transition is not allowed',
          { from: issue.stage, to: input.toStage }
        );
      }

      const updated = await issuesRepo.update(id, {
        stage: input.toStage,
        updatedAt: getUnixSeconds(),
      });
      if (!updated) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return updated;
    },
    async delete(id) {
      const deleted = await issuesRepo.delete(id);
      if (!deleted) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return deleted;
    },
  };
}
