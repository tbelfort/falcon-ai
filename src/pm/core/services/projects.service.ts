import type { ProjectRepo } from '../repos/index.js';

export class ProjectsService {
  constructor(private repo: ProjectRepo) {}

  async getProjects() {
    const projects = await this.repo.findAll();
    return {
      data: projects,
    };
  }

  async getProject(id: string) {
    const project = await this.repo.findById(id);
    if (!project) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: project,
    };
  }

  async createProject(data: {
    name: string;
    slug: string;
    description?: string;
    repoUrl?: string;
    defaultBranch?: string;
    config?: unknown;
  }) {
    const existing = await this.repo.findBySlug(data.slug);
    if (existing) {
      throw new Error('CONFLICT');
    }
    const project = await this.repo.create({
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      repoUrl: data.repoUrl ?? null,
      defaultBranch: data.defaultBranch ?? 'main',
      config:
        data.config !== undefined
          ? JSON.stringify(data.config as Record<string, unknown>)
          : null,
    });
    return {
      data: project,
    };
  }

  async updateProject(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      repoUrl?: string;
      defaultBranch?: string;
      config?: unknown;
    }
  ) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await this.repo.findBySlug(data.slug);
      if (slugExists) {
        throw new Error('CONFLICT');
      }
    }
    const project = await this.repo.update(id, {
      ...data,
      config:
        data.config !== undefined
          ? JSON.stringify(data.config as Record<string, unknown>)
          : undefined,
    });
    if (!project) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: project,
    };
  }

  async deleteProject(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    await this.repo.delete(id);
    return {
      data: existing,
    };
  }
}