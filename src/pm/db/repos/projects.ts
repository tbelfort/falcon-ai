import type { ProjectRepo, ProjectCreateInput, ProjectUpdateInput } from '../../core/repos/projects.js';
import type { ProjectDto } from '../../contracts/http.js';

export class DbProjectsRepo implements ProjectRepo {
  list(): ProjectDto[] {
    throw new Error('DbProjectsRepo.list not implemented');
  }

  getById(_id: string): ProjectDto | null {
    throw new Error('DbProjectsRepo.getById not implemented');
  }

  getBySlug(_slug: string): ProjectDto | null {
    throw new Error('DbProjectsRepo.getBySlug not implemented');
  }

  create(_input: ProjectCreateInput): ProjectDto {
    throw new Error('DbProjectsRepo.create not implemented');
  }

  update(_id: string, _input: ProjectUpdateInput): ProjectDto | null {
    throw new Error('DbProjectsRepo.update not implemented');
  }

  delete(_id: string): ProjectDto | null {
    throw new Error('DbProjectsRepo.delete not implemented');
  }
}
