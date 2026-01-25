import { randomUUID } from 'node:crypto';
import type { DocumentDto, DocumentType } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { DocumentRepo } from '../repos/documents.js';
import type { IssueRepo } from '../repos/issues.js';
import { documentCreatedEvent } from '../events.js';
import { unixSeconds } from '../utils/time.js';
import { err, ok } from './service-result.js';

export interface CreateDocumentInput {
  issueId: string;
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
}

export class DocumentsService {
  constructor(
    private readonly documents: DocumentRepo,
    private readonly issues: IssueRepo
  ) {}

  listByIssue(issueId: string) {
    return ok(this.documents.listByIssue(issueId));
  }

  createDocument(input: CreateDocumentInput) {
    const issue = this.issues.getById(input.issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const now = unixSeconds();
    const document: DocumentDto = this.documents.create({
      id: randomUUID(),
      projectId: issue.projectId,
      issueId: input.issueId,
      title: input.title,
      docType: input.docType,
      filePath: input.filePath,
      contentHash: input.contentHash,
      version: input.version,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return ok(document, [documentCreatedEvent(document, issue.projectId, input.issueId, now)]);
  }
}
