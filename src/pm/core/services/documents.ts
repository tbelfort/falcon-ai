import { randomUUID } from 'node:crypto';
import type { Document, DocumentType } from '../types.js';
import type { DocumentRepository } from '../repos/documents-repo.js';
import type { IssueRepository } from '../repos/issues-repo.js';
import { notFoundError } from './errors.js';

export interface CreateDocumentInput {
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash?: string | null;
  version?: number;
  createdBy?: string | null;
}

export interface DocumentService {
  listDocuments(issueId: string): Document[];
  createDocument(issueId: string, input: CreateDocumentInput): Document;
}

export function createDocumentService(
  repos: { documents: DocumentRepository; issues: IssueRepository },
  now: () => number
): DocumentService {
  const listDocuments = (issueId: string): Document[] => {
    const issue = repos.issues.getById(issueId);
    if (!issue) {
      throw notFoundError('Issue not found', { issueId });
    }
    return repos.documents.listByIssue(issueId);
  };

  const createDocument = (
    issueId: string,
    input: CreateDocumentInput
  ): Document => {
    const issue = repos.issues.getById(issueId);
    if (!issue) {
      throw notFoundError('Issue not found', { issueId });
    }

    const timestamp = now();
    const document: Document = {
      id: randomUUID(),
      projectId: issue.projectId,
      issueId,
      title: input.title,
      docType: input.docType,
      filePath: input.filePath,
      contentHash: input.contentHash ?? null,
      version: input.version ?? 1,
      createdBy: input.createdBy ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return repos.documents.create(document);
  };

  return { listDocuments, createDocument };
}
