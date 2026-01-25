import type { DocumentDto, DocumentType } from '../../contracts/http.js';

export interface DocumentCreateInput {
  id: string;
  projectId: string;
  issueId: string | null;
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentRepo {
  listByIssue(issueId: string): DocumentDto[];
  create(input: DocumentCreateInput): DocumentDto;
}
