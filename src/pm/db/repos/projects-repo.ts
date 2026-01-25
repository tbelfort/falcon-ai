import type { ProjectRecord, ProjectRepo } from '../../core/repos/index.js';

export class DbProjectRepo implements ProjectRepo {
  async list(): Promise<ProjectRecord[]> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }

  async getById(): Promise<ProjectRecord | null> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }

  async getBySlug(): Promise<ProjectRecord | null> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }

  async create(): Promise<ProjectRecord> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }

  async update(): Promise<ProjectRecord | null> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }

  async delete(): Promise<ProjectRecord | null> {
    throw new Error('DbProjectRepo not implemented in Phase 1.');
  }
}
