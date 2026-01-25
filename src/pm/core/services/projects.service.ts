import { randomUUID } from 'node:crypto';
import type { ProjectDto } from '../../contracts/http.js';
import { PmError } from '../errors.js';
import type { ProjectsRepo } from '../repos/index.js';
import { getUnixSeconds } from './helpers.js';

export interface CreateProjectInput {
  name: string;
  slug: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
  config?: unknown;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
  config?: unknown;
}

export interface ProjectsService {
  list(): Promise<ProjectDto[]>;
  get(id: string): Promise<ProjectDto>;
  create(input: CreateProjectInput): Promise<ProjectDto>;
  update(id: string, input: UpdateProjectInput): Promise<ProjectDto>;
  delete(id: string): Promise<ProjectDto>;
}

export function createProjectsService(projectsRepo: ProjectsRepo): ProjectsService {
  return {
    async list() {
      return projectsRepo.list();
    },
    async get(id) {
      const project = await projectsRepo.getById(id);
      if (!project) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }
      return project;
    },
    async create(input) {
      const existing = await projectsRepo.getBySlug(input.slug);
      if (existing) {
        throw new PmError('CONFLICT', 'Project slug already exists');
      }

      const now = getUnixSeconds();
      const project: ProjectDto = {
        id: randomUUID(),
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        repoUrl: input.repoUrl ?? null,
        defaultBranch: input.defaultBranch ?? 'main',
        config: input.config ?? {},
        createdAt: now,
        updatedAt: now,
      };

      return projectsRepo.create(project);
    },
    async update(id, input) {
      const existing = await projectsRepo.getById(id);
      if (!existing) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }

      if (input.slug && input.slug !== existing.slug) {
        const conflict = await projectsRepo.getBySlug(input.slug);
        if (conflict && conflict.id !== id) {
          throw new PmError('CONFLICT', 'Project slug already exists');
        }
      }

      const updates: Partial<ProjectDto> = {
        updatedAt: getUnixSeconds(),
      };
      if (input.name !== undefined) updates.name = input.name;
      if (input.slug !== undefined) updates.slug = input.slug;
      if (input.description !== undefined)
        updates.description = input.description;
      if (input.repoUrl !== undefined) updates.repoUrl = input.repoUrl;
      if (input.defaultBranch !== undefined)
        updates.defaultBranch = input.defaultBranch;
      if (input.config !== undefined) updates.config = input.config;

      const updated = await projectsRepo.update(id, updates);
      if (!updated) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }
      return updated;
    },
    async delete(id) {
      const deleted = await projectsRepo.delete(id);
      if (!deleted) {
        throw new PmError('NOT_FOUND', 'Project not found');
      }
      return deleted;
    },
  };
}
