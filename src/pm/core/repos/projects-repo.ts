import type { Project } from '../types.js';

export interface ProjectRepository {
  list(): Project[];
  getById(id: string): Project | null;
  getBySlug(slug: string): Project | null;
  create(project: Project): Project;
  update(project: Project): Project;
  delete(id: string): Project | null;
}
