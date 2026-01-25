import { randomUUID } from 'node:crypto';
import type { LabelDto } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { LabelRepo } from '../repos/labels.js';
import type { ProjectRepo } from '../repos/projects.js';
import { labelCreatedEvent } from '../events.js';
import { err, ok } from './service-result.js';

export interface CreateLabelInput {
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
}

export class LabelsService {
  constructor(
    private readonly labels: LabelRepo,
    private readonly projects: ProjectRepo
  ) {}

  listByProject(projectId: string) {
    return ok(this.labels.listByProject(projectId));
  }

  createLabel(input: CreateLabelInput) {
    const project = this.projects.getById(input.projectId);
    if (!project) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    const existing = this.labels.getByName(input.projectId, input.name);
    if (existing) {
      return err(createError('CONFLICT', 'Label name already exists'));
    }

    const now = Date.now();
    const label: LabelDto = this.labels.create({
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      color: input.color,
      description: input.description,
      isBuiltin: input.isBuiltin,
      createdAt: now,
    });

    return ok(label, [labelCreatedEvent(label, now)]);
  }
}
