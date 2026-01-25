import type { Document } from '../types.js';

export interface DocumentRepository {
  listByIssue(issueId: string): Document[];
  create(document: Document): Document;
}
