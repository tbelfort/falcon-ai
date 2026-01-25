import type { DocumentRepo, IssueRepo, ProjectRepo } from '../repos/index.js';

export class DocumentsService {
  constructor(
    private projects: ProjectRepo,
    private issues: IssueRepo,
    private documents: DocumentRepo
  ) {}

  async getProjectDocuments(projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project) {
      throw new Error('NOT_FOUND');
    }
    const documents = await this.documents.findByProjectId(projectId);
    return {
      data: documents,
    };
  }

  async getIssueDocuments(issueId: string) {
    const issue = await this.issues.findById(issueId);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const documents = await this.documents.findByIssueId(issueId);
    return {
      data: documents,
    };
  }

  async getDocument(id: string) {
    const document = await this.documents.findById(id);
    if (!document) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: document,
    };
  }

  async createDocument(data: {
    projectId: string;
    issueId?: string;
    title: string;
    docType: string;
    filePath: string;
    contentHash?: string;
    createdBy?: string;
  }) {
    const document = await this.documents.create({
      projectId: data.projectId,
      issueId: data.issueId ?? null,
      title: data.title,
      docType: data.docType,
      filePath: data.filePath,
      contentHash: data.contentHash ?? null,
      version: 1,
      createdBy: data.createdBy ?? null,
    });
    return {
      data: document,
    };
  }

  async deleteDocument(id: string) {
    const existing = await this.documents.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    await this.documents.delete(id);
    return {
      data: existing,
    };
  }
}