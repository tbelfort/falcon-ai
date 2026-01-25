import type { ProjectDto } from '../../contracts/http.js';

export interface ProjectCreateInput {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  repoUrl?: string | null;
  defaultBranch?: string;
  config?: unknown;
  updatedAt: number;
}

export interface ProjectRepo {
  list(): ProjectDto[];
  getById(id: string): ProjectDto | null;
  getBySlug(slug: string): ProjectDto | null;
  create(input: ProjectCreateInput): ProjectDto;
  update(id: string, input: ProjectUpdateInput): ProjectDto | null;
  delete(id: string): ProjectDto | null;
}
