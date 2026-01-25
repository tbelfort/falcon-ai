import type { LabelRepo, LabelCreateInput } from '../../core/repos/labels.js';
import type { LabelDto } from '../../contracts/http.js';

export class DbLabelsRepo implements LabelRepo {
  listByProject(_projectId: string): LabelDto[] {
    throw new Error('DbLabelsRepo.listByProject not implemented');
  }

  getById(_id: string): LabelDto | null {
    throw new Error('DbLabelsRepo.getById not implemented');
  }

  getByName(_projectId: string, _name: string): LabelDto | null {
    throw new Error('DbLabelsRepo.getByName not implemented');
  }

  create(_input: LabelCreateInput): LabelDto {
    throw new Error('DbLabelsRepo.create not implemented');
  }
}
