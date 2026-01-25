import type { Project } from '../types.js';
import type { IProjectRepo } from '../repos/interfaces.js';
import type { ProjectDto } from '../../contracts/http.js';

export interface CreateProjectInput {
  name: string;
  slug: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
}

export type ProjectServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'VALIDATION_ERROR'; message: string; details?: unknown };

export type ProjectResult<T> = { ok: true; value: T } | { ok: false; error: ProjectServiceError };

function toDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    repoUrl: project.repoUrl,
    defaultBranch: project.defaultBranch ?? 'main',
    config: project.config ? JSON.parse(project.config) : {},
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateSlug(slug: string): string | null {
  if (!slug || slug.length === 0) {
    return 'Slug is required';
  }
  if (slug.length > 100) {
    return 'Slug must be 100 characters or less';
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug must be lowercase alphanumeric with hyphens only';
  }
  return null;
}

export class ProjectService {
  constructor(private readonly repo: IProjectRepo) {}

  async list(): Promise<ProjectResult<ProjectDto[]>> {
    const projects = await this.repo.findAll();
    return { ok: true, value: projects.map(toDto) };
  }

  async get(id: string): Promise<ProjectResult<ProjectDto>> {
    const project = await this.repo.findById(id);
    if (!project) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } };
    }
    return { ok: true, value: toDto(project) };
  }

  async create(input: CreateProjectInput): Promise<ProjectResult<ProjectDto>> {
    // Validate name
    if (!input.name || input.name.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
      };
    }

    // Validate slug
    const slugError = validateSlug(input.slug);
    if (slugError) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: slugError },
      };
    }

    // Check for duplicate slug
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: `Project with slug '${input.slug}' already exists` },
      };
    }

    const project = await this.repo.create({
      name: input.name.trim(),
      slug: input.slug,
      description: input.description ?? null,
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch ?? null,
      config: null,
    });

    return { ok: true, value: toDto(project) };
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectResult<ProjectDto>> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } };
    }

    // Validate slug if provided
    if (input.slug !== undefined) {
      const slugError = validateSlug(input.slug);
      if (slugError) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: slugError },
        };
      }

      // Check for duplicate slug (different project)
      const otherProject = await this.repo.findBySlug(input.slug);
      if (otherProject && otherProject.id !== id) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: `Project with slug '${input.slug}' already exists` },
        };
      }
    }

    // Validate name if provided
    if (input.name !== undefined && input.name.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name cannot be empty' },
      };
    }

    const updated = await this.repo.update(id, {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.repoUrl !== undefined && { repoUrl: input.repoUrl }),
      ...(input.defaultBranch !== undefined && { defaultBranch: input.defaultBranch }),
    });

    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } };
    }

    return { ok: true, value: toDto(updated) };
  }

  async delete(id: string): Promise<ProjectResult<void>> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Project ${id} not found` } };
    }

    await this.repo.delete(id);
    return { ok: true, value: undefined };
  }
}
