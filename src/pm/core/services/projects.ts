import { randomUUID } from 'node:crypto';
import type { Project } from '../types.js';
import type { ProjectRepository } from '../repos/projects-repo.js';
import { conflictError, notFoundError } from './errors.js';

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

export interface ProjectService {
  listProjects(): Project[];
  getProject(id: string): Project;
  createProject(input: CreateProjectInput): Project;
  updateProject(id: string, input: UpdateProjectInput): Project;
  deleteProject(id: string): Project;
}

export function createProjectService(
  repo: ProjectRepository,
  now: () => number
): ProjectService {
  const listProjects = (): Project[] => repo.list();

  const getProject = (id: string): Project => {
    const project = repo.getById(id);
    if (!project) {
      throw notFoundError('Project not found', { id });
    }
    return project;
  };

  const createProject = (input: CreateProjectInput): Project => {
    const existing = repo.getBySlug(input.slug);
    if (existing) {
      throw conflictError('Project slug already exists', { slug: input.slug });
    }

    const timestamp = now();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch ?? 'main',
      config: input.config ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return repo.create(project);
  };

  const updateProject = (id: string, input: UpdateProjectInput): Project => {
    const existing = repo.getById(id);
    if (!existing) {
      throw notFoundError('Project not found', { id });
    }

    if (input.slug !== undefined) {
      const slugMatch = repo.getBySlug(input.slug);
      if (slugMatch && slugMatch.id !== id) {
        throw conflictError('Project slug already exists', { slug: input.slug });
      }
    }

    const updated: Project = { ...existing, updatedAt: now() };
    if (input.name !== undefined) {
      updated.name = input.name;
    }
    if (input.slug !== undefined) {
      updated.slug = input.slug;
    }
    if (input.description !== undefined) {
      updated.description = input.description;
    }
    if (input.repoUrl !== undefined) {
      updated.repoUrl = input.repoUrl;
    }
    if (input.defaultBranch !== undefined) {
      updated.defaultBranch = input.defaultBranch;
    }
    if (input.config !== undefined) {
      updated.config = input.config;
    }

    return repo.update(updated);
  };

  const deleteProject = (id: string): Project => {
    const removed = repo.delete(id);
    if (!removed) {
      throw notFoundError('Project not found', { id });
    }
    return removed;
  };

  return {
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
  };
}
