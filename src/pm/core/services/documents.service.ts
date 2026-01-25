import { randomUUID } from 'node:crypto';
import type { DocumentDto, DocumentType } from '../../contracts/http.js';
import { PmError } from '../errors.js';
import type { DocumentsRepo, IssuesRepo } from '../repos/index.js';
import { getUnixSeconds } from './helpers.js';

export interface CreateDocumentInput {
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash?: string | null;
  version?: number;
  createdBy?: string | null;
}

export interface DocumentsService {
  listByIssue(issueId: string): Promise<DocumentDto[]>;
  create(issueId: string, input: CreateDocumentInput): Promise<DocumentDto>;
}

export function createDocumentsService(
  documentsRepo: DocumentsRepo,
  issuesRepo: IssuesRepo
): DocumentsService {
  return {
    async listByIssue(issueId) {
      const issue = await issuesRepo.getById(issueId);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }
      return documentsRepo.listByIssue(issueId);
    },
    async create(issueId, input) {
      const issue = await issuesRepo.getById(issueId);
      if (!issue) {
        throw new PmError('NOT_FOUND', 'Issue not found');
      }

      const now = getUnixSeconds();
      const document: DocumentDto = {
        id: randomUUID(),
        projectId: issue.projectId,
        issueId,
        title: input.title,
        docType: input.docType,
        filePath: input.filePath,
        contentHash: input.contentHash ?? null,
        version: input.version ?? 1,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      };

      return documentsRepo.create(document);
    },
  };
}
