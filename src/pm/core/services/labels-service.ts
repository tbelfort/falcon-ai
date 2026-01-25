import { randomUUID } from 'node:crypto';

import type { LabelDto } from '../../contracts/http.js';
import type { LabelRepo, ProjectRepo } from '../repos/index.js';
import { err, ok, type Result } from './types.js';

export interface LabelCreateInput {
  name: string;
  color: string;
  description?: string | null;
  isBuiltin?: boolean;
}

export class LabelsService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly labels: LabelRepo,
    private readonly now: () => number
  ) {}

  async listByProject(projectId: string): Promise<Result<LabelDto[]>> {
    const project = await this.projects.getById(projectId);
    if (!project) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }
    const items = await this.labels.listByProject(projectId);
    return ok(items);
  }

  async create(projectId: string, input: LabelCreateInput): Promise<Result<LabelDto>> {
    const project = await this.projects.getById(projectId);
    if (!project) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }

    const label: LabelDto = {
      id: randomUUID(),
      projectId,
      name: input.name,
      color: input.color,
      description: input.description ?? null,
      isBuiltin: input.isBuiltin ?? false,
      createdAt: this.now(),
    };

    const created = await this.labels.create(label);
    return ok(created);
  }
}
