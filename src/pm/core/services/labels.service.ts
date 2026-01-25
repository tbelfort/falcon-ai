import { randomUUID } from 'node:crypto';
import type { LabelDto } from '../../contracts/http.js';
import { PmError } from '../errors.js';
import type { LabelsRepo, ProjectsRepo } from '../repos/index.js';
import { getUnixSeconds } from './helpers.js';

export interface CreateLabelInput {
  name: string;
  color?: string;
  description?: string | null;
}

export interface LabelsService {
  listByProject(projectId: string): Promise<LabelDto[]>;
  create(projectId: string, input: CreateLabelInput): Promise<LabelDto>;
}

export function createLabelsService(
  labelsRepo: LabelsRepo,
  projectsRepo: ProjectsRepo
): LabelsService {
  return {
    async listByProject(projectId) {
      const project = await projectsRepo.getById(projectId);
      if (!project) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }
      return labelsRepo.listByProject(projectId);
    },
    async create(projectId, input) {
      const project = await projectsRepo.getById(projectId);
      if (!project) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }

      const existing = await labelsRepo.listByProject(projectId);
      if (existing.some((label) => label.name === input.name)) {
        throw new PmError('CONFLICT', 'Label already exists');
      }

      const label: LabelDto = {
        id: randomUUID(),
        projectId,
        name: input.name,
        color: input.color ?? '#6b7280',
        description: input.description ?? null,
        isBuiltin: false,
        createdAt: getUnixSeconds(),
      };

      return labelsRepo.create(label);
    },
  };
}
