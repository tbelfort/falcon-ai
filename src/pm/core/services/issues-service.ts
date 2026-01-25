import { randomUUID } from 'node:crypto';
import type { IssueDto, IssuePriority, IssueStatus, LabelDto } from '../../contracts/http.js';
import { canTransition } from '../stage-machine.js';
import { createError } from '../errors.js';
import type { IssueRepo, IssueRecord } from '../repos/issues.js';
import type { LabelRepo } from '../repos/labels.js';
import type { ProjectRepo } from '../repos/projects.js';
import { issueEvent } from '../events.js';
import { toKebabCase } from '../utils/slugify.js';
import { err, ok } from './service-result.js';

export interface CreateIssueInput {
  projectId: string;
  title: string;
  description: string | null;
  priority: IssuePriority;
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

export interface StartIssueResult {
  issue: IssueDto;
  branchName: string;
  nextStage: 'CONTEXT_PACK';
}

export interface TransitionIssueInput {
  toStage: IssueRecord['stage'];
}

export class IssuesService {
  constructor(
    private readonly issues: IssueRepo,
    private readonly projects: ProjectRepo,
    private readonly labels: LabelRepo
  ) {}

  listByProject(projectId: string) {
    const items = this.issues.listByProject(projectId);
    return ok(items.map((issue) => this.toDto(issue)));
  }

  getIssue(id: string) {
    const issue = this.issues.getById(id);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    return ok(this.toDto(issue));
  }

  createIssue(input: CreateIssueInput) {
    const project = this.projects.getById(input.projectId);
    if (!project) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    const now = Date.now();
    const issue: IssueRecord = this.issues.create({
      id: randomUUID(),
      projectId: input.projectId,
      number: this.issues.nextNumber(input.projectId),
      title: input.title,
      description: input.description,
      status: 'backlog',
      stage: 'BACKLOG',
      priority: input.priority,
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
    });

    const dto = this.toDto(issue);
    return ok(dto, [issueEvent('issue.created', dto, now)]);
  }

  updateIssue(id: string, input: UpdateIssueInput) {
    const issue = this.issues.getById(id);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    if (input.labelIds) {
      const uniqueLabelIds = [...new Set(input.labelIds)];
      const validation = this.validateLabels(issue.projectId, uniqueLabelIds);
      if (!validation.ok) {
        return err(validation.error);
      }

      const updatedLabels = this.issues.setLabels(id, uniqueLabelIds);
      if (!updatedLabels) {
        return err(createError('NOT_FOUND', 'Issue not found'));
      }
    }

    const now = Date.now();
    const updated = this.issues.update(id, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      updatedAt: now,
    });

    if (!updated) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const dto = this.toDto(updated);
    return ok(dto, [issueEvent('issue.updated', dto, now)]);
  }

  startIssue(id: string, input: StartIssueInput) {
    const issue = this.issues.getById(id);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const startableStatuses: IssueStatus[] = ['backlog', 'todo'];
    const startableStages: IssueRecord['stage'][] = ['BACKLOG', 'TODO'];
    if (!startableStatuses.includes(issue.status) || !startableStages.includes(issue.stage)) {
      return err(createError('VALIDATION_ERROR', 'Issue is not startable'));
    }

    const now = Date.now();
    const branchName = `issue/${issue.number}-${toKebabCase(issue.title)}`;
    const updated = this.issues.update(id, {
      presetId: input.presetId,
      status: 'in_progress',
      stage: 'CONTEXT_PACK',
      startedAt: now,
      branchName,
      updatedAt: now,
    });

    if (!updated) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const dto = this.toDto(updated);
    const result: StartIssueResult = {
      issue: dto,
      branchName,
      nextStage: 'CONTEXT_PACK',
    };

    return ok(result, [issueEvent('issue.updated', dto, now)]);
  }

  transitionIssue(id: string, input: TransitionIssueInput) {
    const issue = this.issues.getById(id);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    if (!canTransition(issue.stage, input.toStage)) {
      return err(createError('INVALID_TRANSITION', 'Stage transition not allowed'));
    }

    const now = Date.now();
    const updated = this.issues.update(id, {
      stage: input.toStage,
      updatedAt: now,
    });

    if (!updated) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const dto = this.toDto(updated);
    return ok(dto, [issueEvent('issue.updated', dto, now)]);
  }

  deleteIssue(id: string) {
    const deleted = this.issues.delete(id);
    if (!deleted) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const dto = this.toDto(deleted);
    return ok(dto, [issueEvent('issue.deleted', dto)]);
  }

  private toDto(issue: IssueRecord): IssueDto {
    return {
      id: issue.id,
      projectId: issue.projectId,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      stage: issue.stage,
      priority: issue.priority,
      labels: this.resolveLabels(issue.labelIds),
      presetId: issue.presetId,
      branchName: issue.branchName,
      prNumber: issue.prNumber,
      prUrl: issue.prUrl,
      assignedAgentId: issue.assignedAgentId,
      assignedHuman: issue.assignedHuman,
      attributes: issue.attributes,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      startedAt: issue.startedAt,
      completedAt: issue.completedAt,
    };
  }

  private resolveLabels(labelIds: string[]): LabelDto[] {
    if (labelIds.length === 0) {
      return [];
    }

    return labelIds
      .map((id) => this.labels.getById(id))
      .filter((label): label is LabelDto => !!label);
  }

  private validateLabels(projectId: string, labelIds: string[]) {
    const uniqueIds = [...new Set(labelIds)];
    const labelDtos = uniqueIds.map((id) => this.labels.getById(id));

    if (labelDtos.some((label) => !label)) {
      return {
        ok: false as const,
        error: createError('VALIDATION_ERROR', 'One or more labels not found'),
      };
    }

    const invalid = labelDtos.find((label) => label && label.projectId !== projectId);
    if (invalid) {
      return {
        ok: false as const,
        error: createError('VALIDATION_ERROR', 'Label does not belong to project'),
      };
    }

    return { ok: true as const, error: null };
  }
}
