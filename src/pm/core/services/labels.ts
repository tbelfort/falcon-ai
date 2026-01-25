import { randomUUID } from 'node:crypto';
import type { Label } from '../types.js';
import type { LabelRepository } from '../repos/labels-repo.js';
import type { ProjectRepository } from '../repos/projects-repo.js';
import { conflictError, notFoundError } from './errors.js';

export interface CreateLabelInput {
  name: string;
  color?: string;
  description?: string | null;
  isBuiltin?: boolean;
}

export interface LabelService {
  listLabels(projectId: string): Label[];
  createLabel(projectId: string, input: CreateLabelInput): Label;
}

export function createLabelService(
  repos: { labels: LabelRepository; projects: ProjectRepository },
  now: () => number
): LabelService {
  const listLabels = (projectId: string): Label[] => {
    const project = repos.projects.getById(projectId);
    if (!project) {
      throw notFoundError('Project not found', { projectId });
    }
    return repos.labels.listByProject(projectId);
  };

  const createLabel = (projectId: string, input: CreateLabelInput): Label => {
    const project = repos.projects.getById(projectId);
    if (!project) {
      throw notFoundError('Project not found', { projectId });
    }

    const existing = repos.labels.findByName(projectId, input.name);
    if (existing) {
      throw conflictError('Label already exists', { name: input.name });
    }

    const label: Label = {
      id: randomUUID(),
      projectId,
      name: input.name,
      color: input.color ?? '#6b7280',
      description: input.description ?? null,
      isBuiltin: input.isBuiltin ?? false,
      createdAt: now(),
    };

    return repos.labels.create(label);
  };

  return { listLabels, createLabel };
}
