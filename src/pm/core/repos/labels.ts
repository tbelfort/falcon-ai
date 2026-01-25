import type { LabelDto } from '../../contracts/http.js';

export interface LabelCreateInput {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface LabelRepo {
  listByProject(projectId: string): LabelDto[];
  getById(id: string): LabelDto | null;
  getByName(projectId: string, name: string): LabelDto | null;
  create(input: LabelCreateInput): LabelDto;
}
