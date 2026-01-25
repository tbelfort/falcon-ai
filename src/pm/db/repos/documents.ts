import type { Document } from '../../core/types.js';
import type { DocumentRepository } from '../../core/repos/documents-repo.js';

export class DbDocumentRepository implements DocumentRepository {
  listByIssue(issueId: string): Document[] {
    void issueId;
    throw new Error('DbDocumentRepository not implemented');
  }

  create(document: Document): Document {
    void document;
    throw new Error('DbDocumentRepository not implemented');
  }
}
