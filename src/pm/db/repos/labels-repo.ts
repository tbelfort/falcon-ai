import type { LabelRecord, LabelRepo } from '../../core/repos/index.js';

export class DbLabelRepo implements LabelRepo {
  async listByProject(): Promise<LabelRecord[]> {
    throw new Error('DbLabelRepo not implemented in Phase 1.');
  }

  async getById(): Promise<LabelRecord | null> {
    throw new Error('DbLabelRepo not implemented in Phase 1.');
  }

  async getByIds(): Promise<LabelRecord[]> {
    throw new Error('DbLabelRepo not implemented in Phase 1.');
  }

  async create(): Promise<LabelRecord> {
    throw new Error('DbLabelRepo not implemented in Phase 1.');
  }
}
