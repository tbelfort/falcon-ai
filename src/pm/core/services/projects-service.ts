import { randomUUID } from 'node:crypto';
import type { ProjectDto } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { ProjectRepo } from '../repos/projects.js';
import { projectEvent } from '../events.js';
import { err, ok } from './service-result.js';

export interface CreateProjectInput {
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
  config?: unknown;
}

export class ProjectsService {
  constructor(private readonly repo: ProjectRepo) {}

  listProjects() {
    return ok(this.repo.list());
  }

  getProject(id: string) {
    const project = this.repo.getById(id);
    if (!project) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    return ok(project);
  }

  createProject(input: CreateProjectInput) {
    const existing = this.repo.getBySlug(input.slug);
    if (existing) {
      return err(createError('CONFLICT', 'Project slug already exists'));
    }

    const now = Date.now();
    const project: ProjectDto = this.repo.create({
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description,
      repoUrl: input.repoUrl,
      defaultBranch: input.defaultBranch,
      config: {},
      createdAt: now,
      updatedAt: now,
    });

    return ok(project, [projectEvent('project.created', project, now)]);
  }

  updateProject(id: string, input: UpdateProjectInput) {
    const existing = this.repo.getById(id);
    if (!existing) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugConflict = this.repo.getBySlug(input.slug);
      if (slugConflict && slugConflict.id !== id) {
        return err(createError('CONFLICT', 'Project slug already exists'));
      }
    }

    const now = Date.now();
    const updated = this.repo.update(id, {
      ...input,
      updatedAt: now,
    });

    if (!updated) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    return ok(updated, [projectEvent('project.updated', updated, now)]);
  }

  deleteProject(id: string) {
    const deleted = this.repo.delete(id);
    if (!deleted) {
      return err(createError('NOT_FOUND', 'Project not found'));
    }

    return ok(deleted, [projectEvent('project.deleted', deleted)]);
  }
}
