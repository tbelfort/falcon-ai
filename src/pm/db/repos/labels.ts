import type { Label } from '../../core/types.js';
import type { LabelRepository } from '../../core/repos/labels-repo.js';

export class DbLabelRepository implements LabelRepository {
  listByProject(projectId: string): Label[] {
    void projectId;
    throw new Error('DbLabelRepository not implemented');
  }

  getById(id: string): Label | null {
    void id;
    throw new Error('DbLabelRepository not implemented');
  }

  findByName(projectId: string, name: string): Label | null {
    void projectId;
    void name;
    throw new Error('DbLabelRepository not implemented');
  }

  getByIds(ids: string[]): Label[] {
    void ids;
    throw new Error('DbLabelRepository not implemented');
  }

  create(label: Label): Label {
    void label;
    throw new Error('DbLabelRepository not implemented');
  }
}
