import { randomUUID } from 'node:crypto';

import type { ProjectDto } from '../../contracts/http.js';
import type { ProjectRepo } from '../repos/index.js';
import { err, ok, type Result } from './types.js';

export interface ProjectCreateInput {
  name: string;
  slug: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch: string;
  config?: unknown;
}

export interface ProjectUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
  config?: unknown;
}

export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly now: () => number
  ) {}

  async list(): Promise<Result<ProjectDto[]>> {
    const items = await this.projects.list();
    return ok(items);
  }

  async getById(id: string): Promise<Result<ProjectDto>> {
    const project = await this.projects.getById(id);
    if (!project) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }
    return ok(project);
  }

  async create(input: ProjectCreateInput): Promise<Result<ProjectDto>> {
    const existing = await this.projects.getBySlug(input.slug);
    if (existing) {
      return err({
        code: 'CONFLICT',
        message: 'Project slug already exists.',
        details: { slug: input.slug },
      });
    }

    const timestamp = this.now();
    const project: ProjectDto = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch,
      config: input.config ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const created = await this.projects.create(project);
    return ok(created);
  }

  async update(id: string, input: ProjectUpdateInput): Promise<Result<ProjectDto>> {
    const existing = await this.projects.getById(id);
    if (!existing) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugMatch = await this.projects.getBySlug(input.slug);
      if (slugMatch && slugMatch.id !== id) {
        return err({
          code: 'CONFLICT',
          message: 'Project slug already exists.',
          details: { slug: input.slug },
        });
      }
    }

    const updated = await this.projects.update(id, {
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      description:
        input.description !== undefined ? input.description : existing.description,
      repoUrl: input.repoUrl !== undefined ? input.repoUrl : existing.repoUrl,
      defaultBranch: input.defaultBranch ?? existing.defaultBranch,
      config: input.config !== undefined ? input.config : existing.config,
      updatedAt: this.now(),
    });

    if (!updated) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }

    return ok(updated);
  }

  async delete(id: string): Promise<Result<ProjectDto>> {
    const deleted = await this.projects.delete(id);
    if (!deleted) {
      return err({ code: 'NOT_FOUND', message: 'Project not found.' });
    }
    return ok(deleted);
  }
}
