import type { DocumentRepo, DocumentCreateInput } from '../../core/repos/documents.js';
import type { DocumentDto } from '../../contracts/http.js';

export class DbDocumentsRepo implements DocumentRepo {
  listByIssue(_issueId: string): DocumentDto[] {
    throw new Error('DbDocumentsRepo.listByIssue not implemented');
  }

  create(_input: DocumentCreateInput): DocumentDto {
    throw new Error('DbDocumentsRepo.create not implemented');
  }
}
