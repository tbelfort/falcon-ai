import type { IssueRecord, IssueRepo } from '../../core/repos/index.js';

export class DbIssueRepo implements IssueRepo {
  async listByProject(): Promise<IssueRecord[]> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }

  async getById(): Promise<IssueRecord | null> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }

  async create(): Promise<IssueRecord> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }

  async update(): Promise<IssueRecord | null> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }

  async delete(): Promise<IssueRecord | null> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }

  async getNextNumber(): Promise<number> {
    throw new Error('DbIssueRepo not implemented in Phase 1.');
  }
}
