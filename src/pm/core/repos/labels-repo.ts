import type { Label } from '../types.js';

export interface LabelRepository {
  listByProject(projectId: string): Label[];
  getById(id: string): Label | null;
  findByName(projectId: string, name: string): Label | null;
  getByIds(ids: string[]): Label[];
  create(label: Label): Label;
}
