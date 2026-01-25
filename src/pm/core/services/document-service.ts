import type { Document } from '../types.js';
import type { IDocumentRepo, IIssueRepo } from '../repos/interfaces.js';
import type { DocType, DocumentDto } from '../../contracts/http.js';

export interface CreateDocumentInput {
  title: string;
  docType: DocType;
  filePath: string;
  contentHash?: string | null;
  createdBy?: string | null;
}

export type DocumentServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'VALIDATION_ERROR'; message: string; details?: unknown };

export type DocumentResult<T> = { ok: true; value: T } | { ok: false; error: DocumentServiceError };

function toDto(document: Document): DocumentDto {
  return {
    id: document.id,
    projectId: document.projectId,
    issueId: document.issueId,
    title: document.title,
    docType: document.docType as DocType,
    filePath: document.filePath,
    contentHash: document.contentHash,
    version: document.version,
    createdBy: document.createdBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export class DocumentService {
  constructor(
    private readonly documentRepo: IDocumentRepo,
    private readonly issueRepo: IIssueRepo
  ) {}

  async list(issueId: string): Promise<DocumentResult<DocumentDto[]>> {
    // Validate issue exists
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Issue ${issueId} not found` },
      };
    }

    const documents = await this.documentRepo.findByIssue(issueId);
    return { ok: true, value: documents.map(toDto) };
  }

  async get(id: string): Promise<DocumentResult<DocumentDto>> {
    const document = await this.documentRepo.findById(id);
    if (!document) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Document ${id} not found` } };
    }
    return { ok: true, value: toDto(document) };
  }

  async create(issueId: string, input: CreateDocumentInput): Promise<DocumentResult<DocumentDto>> {
    // Validate issue exists
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Issue ${issueId} not found` },
      };
    }

    // Validate title
    if (!input.title || input.title.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
      };
    }

    // Validate docType
    const validDocTypes: DocType[] = ['context_pack', 'spec', 'ai_doc', 'other'];
    if (!validDocTypes.includes(input.docType)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid docType: ${input.docType}` },
      };
    }

    // Validate filePath
    if (!input.filePath || input.filePath.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'File path is required' },
      };
    }

    const document = await this.documentRepo.create({
      projectId: issue.projectId,
      issueId,
      title: input.title.trim(),
      docType: input.docType,
      filePath: input.filePath.trim(),
      contentHash: input.contentHash ?? null,
      version: 1,
      createdBy: input.createdBy ?? null,
    });

    return { ok: true, value: toDto(document) };
  }
}
