import type { DocumentRecord, DocumentRepo } from '../../core/repos/index.js';

export class DbDocumentRepo implements DocumentRepo {
  async listByIssue(): Promise<DocumentRecord[]> {
    throw new Error('DbDocumentRepo not implemented in Phase 1.');
  }

  async create(): Promise<DocumentRecord> {
    throw new Error('DbDocumentRepo not implemented in Phase 1.');
  }
}
