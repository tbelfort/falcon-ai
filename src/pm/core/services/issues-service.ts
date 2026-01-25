import { randomUUID } from 'node:crypto';

import type { IssueDto, IssuePriority, LabelDto } from '../../contracts/http.js';
import type { IssueStage } from '../types.js';
import type { IssueRepo, LabelRepo, ProjectRepo, IssueRecord } from '../repos/index.js';
import { canTransition } from '../stage-machine.js';
import { err, ok, type Result } from './types.js';

export interface IssueCreateInput {
  projectId: string;
  title: string;
  description?: string | null;
  priority: IssuePriority;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string | null;
  priority?: IssuePriority;
  labelIds?: string[];
}

export interface IssueStartInput {
  presetId: string;
}

export interface IssueStartResult {
  issue: IssueDto;
  branchName: string;
  nextStage: IssueStage;
}

export class IssuesService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly issues: IssueRepo,
    private readonly labels: LabelRepo,
    private readonly now: () => number
  ) {}

  async listByProject(projectId: string): Promise<Result<IssueDto[]>> {
    const project = await this.projects.getById(projectId);
    if (!project) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }
    const items = await this.issues.listByProject(projectId);
    const hydrated = await Promise.all(items.map((item) => this.hydrate(item)));
    return ok(hydrated);
  }

  async getById(id: string): Promise<Result<IssueDto>> {
    const issue = await this.issues.getById(id);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }
    return ok(await this.hydrate(issue));
  }

  async create(input: IssueCreateInput): Promise<Result<IssueDto>> {
    const project = await this.projects.getById(input.projectId);
    if (!project) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }

    const number = await this.issues.getNextNumber(input.projectId);
    const timestamp = this.now();
    const issue: IssueRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      number,
      title: input.title,
      description: input.description ?? null,
      status: 'backlog',
      stage: 'BACKLOG',
      priority: input.priority,
      labelIds: [],
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

    const created = await this.issues.create(issue);
    return ok(await this.hydrate(created));
  }

  async update(id: string, input: IssueUpdateInput): Promise<Result<IssueDto>> {
    const existing = await this.issues.getById(id);
    if (!existing) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    let labelIds = existing.labelIds;
    if (input.labelIds) {
      const labels = await this.labels.getByIds(input.labelIds);
      const missingIds = input.labelIds.filter(
        (labelId) => !labels.some((label) => label.id === labelId)
      );
      if (missingIds.length > 0) {
        return err({
          code: 'VALIDATION_ERROR',
          message: 'Some labels do not exist.',
          details: { missingIds },
        });
      }
      const invalid = labels.find(
        (label) => label.projectId !== existing.projectId
      );
      if (invalid) {
        return err({
          code: 'VALIDATION_ERROR',
          message: 'Labels must belong to the same project.',
        });
      }
      labelIds = [...input.labelIds];
    }

    const updated = await this.issues.update(id, {
      title: input.title ?? existing.title,
      description:
        input.description !== undefined ? input.description : existing.description,
      priority: input.priority ?? existing.priority,
      labelIds,
      updatedAt: this.now(),
    });

    if (!updated) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    return ok(await this.hydrate(updated));
  }

  async start(id: string, input: IssueStartInput): Promise<Result<IssueStartResult>> {
    const issue = await this.issues.getById(id);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    if (
      (issue.status !== 'backlog' && issue.status !== 'todo') ||
      (issue.stage !== 'BACKLOG' && issue.stage !== 'TODO')
    ) {
      return err({
        code: 'INVALID_TRANSITION',
        message: 'Issue is not in a startable state.',
      });
    }

    const branchName = buildBranchName(issue.number, issue.title);
    const timestamp = this.now();
    const updated = await this.issues.update(id, {
      presetId: input.presetId,
      status: 'in_progress',
      stage: 'CONTEXT_PACK',
      startedAt: timestamp,
      branchName,
      updatedAt: timestamp,
    });

    if (!updated) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    const hydrated = await this.hydrate(updated);
    return ok({
      issue: hydrated,
      branchName,
      nextStage: 'CONTEXT_PACK',
    });
  }

  async transition(id: string, toStage: IssueStage): Promise<Result<IssueDto>> {
    const issue = await this.issues.getById(id);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    if (!canTransition(issue.stage, toStage)) {
      return err({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${issue.stage} to ${toStage}.`,
        details: { from: issue.stage, to: toStage },
      });
    }

    const updated = await this.issues.update(id, {
      stage: toStage,
      updatedAt: this.now(),
    });

    if (!updated) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    return ok(await this.hydrate(updated));
  }

  async delete(id: string): Promise<Result<IssueDto>> {
    const deleted = await this.issues.delete(id);
    if (!deleted) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }
    return ok(await this.hydrate(deleted));
  }

  private async hydrate(issue: IssueRecord): Promise<IssueDto> {
    const labels = await this.labels.getByIds(issue.labelIds);
    return {
      ...issue,
      labels: sortLabels(issue.labelIds, labels),
    };
  }
}

function buildBranchName(number: number, title: string): string {
  const slug = toKebabCase(title);
  return `issue/${number}-${slug || 'issue'}`;
}

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortLabels(ids: string[], labels: LabelDto[]): LabelDto[] {
  return ids
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is LabelDto => Boolean(label));
}
