import type { Project } from '../../core/types.js';
import type { ProjectRepository } from '../../core/repos/projects-repo.js';

export class DbProjectRepository implements ProjectRepository {
  list(): Project[] {
    throw new Error('DbProjectRepository not implemented');
  }

  getById(id: string): Project | null {
    void id;
    throw new Error('DbProjectRepository not implemented');
  }

  getBySlug(slug: string): Project | null {
    void slug;
    throw new Error('DbProjectRepository not implemented');
  }

  create(project: Project): Project {
    void project;
    throw new Error('DbProjectRepository not implemented');
  }

  update(project: Project): Project {
    void project;
    throw new Error('DbProjectRepository not implemented');
  }

  delete(id: string): Project | null {
    void id;
    throw new Error('DbProjectRepository not implemented');
  }
}
