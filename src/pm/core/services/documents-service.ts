import { randomUUID } from 'node:crypto';

import type { DocumentDto, DocumentType } from '../../contracts/http.js';
import type { DocumentRepo, IssueRepo } from '../repos/index.js';
import { err, ok, type Result } from './types.js';

export interface DocumentCreateInput {
  title: string;
  docType: DocumentType;
  filePath: string;
  contentHash?: string | null;
  version?: number;
  createdBy?: string | null;
}

export class DocumentsService {
  constructor(
    private readonly issues: IssueRepo,
    private readonly documents: DocumentRepo,
    private readonly now: () => number
  ) {}

  async listByIssue(issueId: string): Promise<Result<DocumentDto[]>> {
    const issue = await this.issues.getById(issueId);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }
    const items = await this.documents.listByIssue(issueId);
    return ok(items);
  }

  async create(
    issueId: string,
    input: DocumentCreateInput
  ): Promise<Result<DocumentDto>> {
    const issue = await this.issues.getById(issueId);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    const timestamp = this.now();
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
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const created = await this.documents.create(document);
    return ok(created);
  }
}
