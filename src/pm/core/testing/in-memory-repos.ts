import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from '../../contracts/http.js';
import type {
  CommentsRepo,
  DocumentsRepo,
  IssuesRepo,
  LabelsRepo,
  PmRepos,
  ProjectsRepo,
} from '../repos/index.js';

class InMemoryProjectsRepo implements ProjectsRepo {
  private readonly projects = new Map<string, ProjectDto>();

  async list(): Promise<ProjectDto[]> {
    return Array.from(this.projects.values());
  }

  async getById(id: string): Promise<ProjectDto | null> {
    return this.projects.get(id) ?? null;
  }

  async getBySlug(slug: string): Promise<ProjectDto | null> {
    for (const project of this.projects.values()) {
      if (project.slug === slug) {
        return project;
      }
    }
    return null;
  }

  async create(project: ProjectDto): Promise<ProjectDto> {
    this.projects.set(project.id, project);
    return project;
  }

  async update(
    id: string,
    updates: Partial<ProjectDto>
  ): Promise<ProjectDto | null> {
    const existing = this.projects.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...updates };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<ProjectDto | null> {
    const existing = this.projects.get(id);
    if (!existing) {
      return null;
    }
    this.projects.delete(id);
    return existing;
  }
}

class InMemoryIssuesRepo implements IssuesRepo {
  private readonly issues = new Map<string, IssueDto>();

  async listByProject(projectId: string): Promise<IssueDto[]> {
    return Array.from(this.issues.values()).filter(
      (issue) => issue.projectId === projectId
    );
  }

  async getById(id: string): Promise<IssueDto | null> {
    return this.issues.get(id) ?? null;
  }

  async create(issue: IssueDto): Promise<IssueDto> {
    this.issues.set(issue.id, issue);
    return issue;
  }

  async update(
    id: string,
    updates: Partial<IssueDto>
  ): Promise<IssueDto | null> {
    const existing = this.issues.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...updates };
    this.issues.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<IssueDto | null> {
    const existing = this.issues.get(id);
    if (!existing) {
      return null;
    }
    this.issues.delete(id);
    return existing;
  }

  async getNextNumber(projectId: string): Promise<number> {
    let max = 0;
    for (const issue of this.issues.values()) {
      if (issue.projectId === projectId && issue.number > max) {
        max = issue.number;
      }
    }
    return max + 1;
  }
}

class InMemoryLabelsRepo implements LabelsRepo {
  private readonly labels = new Map<string, LabelDto>();

  async listByProject(projectId: string): Promise<LabelDto[]> {
    return Array.from(this.labels.values()).filter(
      (label) => label.projectId === projectId
    );
  }

  async getById(id: string): Promise<LabelDto | null> {
    return this.labels.get(id) ?? null;
  }

  async getByIds(ids: string[]): Promise<LabelDto[]> {
    return ids
      .map((id) => this.labels.get(id))
      .filter((label): label is LabelDto => Boolean(label));
  }

  async create(label: LabelDto): Promise<LabelDto> {
    this.labels.set(label.id, label);
    return label;
  }
}

class InMemoryCommentsRepo implements CommentsRepo {
  private readonly comments = new Map<string, CommentDto>();

  async listByIssue(issueId: string): Promise<CommentDto[]> {
    return Array.from(this.comments.values()).filter(
      (comment) => comment.issueId === issueId
    );
  }

  async create(comment: CommentDto): Promise<CommentDto> {
    this.comments.set(comment.id, comment);
    return comment;
  }
}

class InMemoryDocumentsRepo implements DocumentsRepo {
  private readonly documents = new Map<string, DocumentDto>();

  async listByIssue(issueId: string): Promise<DocumentDto[]> {
    return Array.from(this.documents.values()).filter(
      (document) => document.issueId === issueId
    );
  }

  async create(document: DocumentDto): Promise<DocumentDto> {
    this.documents.set(document.id, document);
    return document;
  }
}

export function createInMemoryRepos(): PmRepos {
  return {
    projects: new InMemoryProjectsRepo(),
    issues: new InMemoryIssuesRepo(),
    labels: new InMemoryLabelsRepo(),
    comments: new InMemoryCommentsRepo(),
    documents: new InMemoryDocumentsRepo(),
  };
}
