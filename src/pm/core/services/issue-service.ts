import type { Issue, IssueStage, Label } from '../types.js';
import type { IIssueRepo, IIssueLabelRepo, ILabelRepo, IPresetRepo, IProjectRepo } from '../repos/interfaces.js';
import type { IssueDto, IssuePriority, IssueStatus, LabelDto } from '../../contracts/http.js';
import { canTransition } from '../stage-machine.js';

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
  toStage: IssueStage;
}

export type IssueServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'VALIDATION_ERROR'; message: string; details?: unknown }
  | { code: 'INVALID_TRANSITION'; message: string }
  | { code: 'CONFLICT'; message: string };

export type IssueResult<T> = { ok: true; value: T } | { ok: false; error: IssueServiceError };

function labelToDto(label: Label): LabelDto {
  return {
    id: label.id,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
    description: label.description,
    isBuiltin: label.isBuiltin,
    createdAt: label.createdAt,
  };
}

function toDto(issue: Issue, labels: Label[]): IssueDto {
  return {
    id: issue.id,
    projectId: issue.projectId,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    status: (issue.status as IssueStatus) ?? 'backlog',
    stage: issue.stage,
    priority: (issue.priority as IssuePriority) ?? 'medium',
    labels: labels.map(labelToDto),
    presetId: issue.presetId,
    branchName: issue.branchName,
    prNumber: issue.prNumber,
    prUrl: issue.prUrl,
    assignedAgentId: issue.assignedAgentId,
    assignedHuman: issue.assignedHuman,
    attributes: issue.attributes ? JSON.parse(issue.attributes) : null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    startedAt: issue.startedAt,
    completedAt: issue.completedAt,
  };
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

export class IssueService {
  constructor(
    private readonly issueRepo: IIssueRepo,
    private readonly issueLabelRepo: IIssueLabelRepo,
    private readonly labelRepo: ILabelRepo,
    private readonly projectRepo: IProjectRepo,
    private readonly presetRepo: IPresetRepo
  ) {}

  async list(projectId?: string): Promise<IssueResult<IssueDto[]>> {
    const issues = await this.issueRepo.findAll(projectId);
    const dtos: IssueDto[] = [];

    for (const issue of issues) {
      const labels = await this.issueLabelRepo.findLabelsByIssue(issue.id);
      dtos.push(toDto(issue, labels));
    }

    return { ok: true, value: dtos };
  }

  async get(id: string): Promise<IssueResult<IssueDto>> {
    const issue = await this.issueRepo.findById(id);
    if (!issue) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    const labels = await this.issueLabelRepo.findLabelsByIssue(issue.id);
    return { ok: true, value: toDto(issue, labels) };
  }

  async create(input: CreateIssueInput): Promise<IssueResult<IssueDto>> {
    // Validate title
    if (!input.title || input.title.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
      };
    }

    // Validate project exists
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Project ${input.projectId} not found` },
      };
    }

    // Validate priority if provided
    const validPriorities: IssuePriority[] = ['low', 'medium', 'high', 'critical'];
    if (input.priority && !validPriorities.includes(input.priority)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid priority: ${input.priority}` },
      };
    }

    const number = await this.issueRepo.getNextNumber(input.projectId);

    const issue = await this.issueRepo.create({
      projectId: input.projectId,
      number,
      title: input.title.trim(),
      description: input.description ?? null,
      status: 'backlog',
      stage: 'BACKLOG',
      priority: input.priority ?? 'medium',
      presetId: null,
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      startedAt: null,
      completedAt: null,
    });

    return { ok: true, value: toDto(issue, []) };
  }

  async update(id: string, input: UpdateIssueInput): Promise<IssueResult<IssueDto>> {
    const existing = await this.issueRepo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    // Validate title if provided
    if (input.title !== undefined && input.title.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title cannot be empty' },
      };
    }

    // Validate priority if provided
    const validPriorities: IssuePriority[] = ['low', 'medium', 'high', 'critical'];
    if (input.priority && !validPriorities.includes(input.priority)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid priority: ${input.priority}` },
      };
    }

    // Handle label updates
    if (input.labelIds !== undefined) {
      // Validate all labels exist and belong to the issue's project
      const labels = await this.labelRepo.findByIds(input.labelIds);
      if (labels.length !== input.labelIds.length) {
        const foundIds = new Set(labels.map((l) => l.id));
        const missingIds = input.labelIds.filter((id) => !foundIds.has(id));
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Labels not found: ${missingIds.join(', ')}`,
          },
        };
      }

      // Validate all labels belong to the same project
      for (const label of labels) {
        if (label.projectId !== existing.projectId) {
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Label ${label.id} belongs to a different project`,
            },
          };
        }
      }

      await this.issueLabelRepo.setLabels(id, input.labelIds);
    }

    const updated = await this.issueRepo.update(id, {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priority !== undefined && { priority: input.priority }),
    });

    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    const labels = await this.issueLabelRepo.findLabelsByIssue(updated.id);
    return { ok: true, value: toDto(updated, labels) };
  }

  async start(
    id: string,
    input: StartIssueInput
  ): Promise<IssueResult<{ issue: IssueDto; branchName: string; nextStage: IssueStage }>> {
    const existing = await this.issueRepo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    // Validate issue is in a startable state
    const startableStatuses = ['backlog', 'todo'];
    const startableStages: IssueStage[] = ['BACKLOG', 'TODO'];

    if (!startableStatuses.includes(existing.status)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot start issue in status '${existing.status}'`,
        },
      };
    }

    if (!startableStages.includes(existing.stage)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot start issue in stage '${existing.stage}'`,
        },
      };
    }

    // Validate preset exists
    const preset = await this.presetRepo.findById(input.presetId);
    if (!preset) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Preset ${input.presetId} not found` },
      };
    }

    // Generate branch name
    const kebabTitle = toKebabCase(existing.title);
    const branchName = `issue/${existing.number}-${kebabTitle}`;

    const now = Math.floor(Date.now() / 1000);

    const updated = await this.issueRepo.update(id, {
      presetId: input.presetId,
      status: 'in_progress',
      stage: 'CONTEXT_PACK',
      startedAt: now,
      branchName,
    });

    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    const labels = await this.issueLabelRepo.findLabelsByIssue(updated.id);

    return {
      ok: true,
      value: {
        issue: toDto(updated, labels),
        branchName,
        nextStage: 'CONTEXT_PACK',
      },
    };
  }

  async transition(id: string, input: TransitionIssueInput): Promise<IssueResult<IssueDto>> {
    const existing = await this.issueRepo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    // Validate transition using stage machine
    if (!canTransition(existing.stage, input.toStage)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from '${existing.stage}' to '${input.toStage}'`,
        },
      };
    }

    // Update status based on stage
    let status = existing.status;
    if (input.toStage === 'DONE') {
      status = 'done';
    } else if (input.toStage === 'TODO') {
      status = 'todo';
    } else if (input.toStage !== 'BACKLOG') {
      status = 'in_progress';
    }

    const updates: Partial<Issue> = {
      stage: input.toStage,
      status,
    };

    // Set completedAt when transitioning to DONE
    if (input.toStage === 'DONE') {
      updates.completedAt = Math.floor(Date.now() / 1000);
    }

    const updated = await this.issueRepo.update(id, updates);

    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    const labels = await this.issueLabelRepo.findLabelsByIssue(updated.id);
    return { ok: true, value: toDto(updated, labels) };
  }

  async delete(id: string): Promise<IssueResult<void>> {
    const existing = await this.issueRepo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Issue ${id} not found` } };
    }

    await this.issueRepo.delete(id);
    return { ok: true, value: undefined };
  }
}
