import { randomUUID } from 'node:crypto';
import type {
  Comment,
  Document,
  Issue,
  IssueFilter,
  Label,
  Project,
  ProjectFilter,
} from '../repos/index.js';
import type {
  CommentRepo,
  DocumentRepo,
  IssueLabelRepo,
  IssueRepo,
  LabelRepo,
  ProjectRepo,
} from '../repos/index.js';

export class InMemoryProjectRepo implements ProjectRepo {
  private projects = new Map<string, Project>();

  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    for (const project of this.projects.values()) {
      if (project.slug === slug) {
        return project;
      }
    }
    return null;
  }

  async findAll(filter: ProjectFilter = {}): Promise<Project[]> {
    const { limit, offset } = filter;
    let results = Array.from(this.projects.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    if (offset) {
      results = results.slice(offset);
    }
    if (limit) {
      results = results.slice(0, limit);
    }
    return results;
  }

  async count(): Promise<number> {
    return this.projects.size;
  }

  async create(
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    const now = Math.floor(Date.now() / 1000);
    const project: Project = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    return project;
  }

  async update(
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt'>>
  ): Promise<Project | null> {
    const existing = this.projects.get(id);
    if (!existing) {
      return null;
    }
    const updated: Project = {
      ...existing,
      ...data,
      id,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }
}

export class InMemoryIssueRepo implements IssueRepo {
  private issues = new Map<string, Issue>();
  private projectIssueCounters = new Map<string, number>();

  async findById(id: string): Promise<Issue | null> {
    return this.issues.get(id) || null;
  }

  async findByProjectId(projectId: string, filter: IssueFilter = {}): Promise<Issue[]> {
    let results = Array.from(this.issues.values()).filter(
      (issue) => issue.projectId === projectId
    );
    if (filter.status) {
      results = results.filter((issue) => issue.status === filter.status);
    }
    if (filter.stage) {
      results = results.filter((issue) => issue.stage === filter.stage);
    }
    results.sort((a, b) => b.createdAt - a.createdAt);
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }
    return results;
  }

  async countByProjectId(projectId: string): Promise<number> {
    return Array.from(this.issues.values()).filter(
      (issue) => issue.projectId === projectId
    ).length;
  }

  async findByNumber(projectId: string, number: number): Promise<Issue | null> {
    for (const issue of this.issues.values()) {
      if (issue.projectId === projectId && issue.number === number) {
        return issue;
      }
    }
    return null;
  }

  async getNextIssueNumber(projectId: string): Promise<number> {
    const current = this.projectIssueCounters.get(projectId) || 0;
    const next = current + 1;
    this.projectIssueCounters.set(projectId, next);
    return next;
  }

  async create(
    data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'number'>
  ): Promise<Issue> {
    const number = await this.getNextIssueNumber(data.projectId);
    const now = Math.floor(Date.now() / 1000);
    const issue: Issue = {
      id: randomUUID(),
      ...data,
      number,
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  async update(
    id: string,
    data: Partial<Omit<Issue, 'id' | 'createdAt' | 'number'>>
  ): Promise<Issue | null> {
    const existing = this.issues.get(id);
    if (!existing) {
      return null;
    }
    const updated: Issue = {
      ...existing,
      ...data,
      id,
      number: existing.number,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.issues.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.issues.delete(id);
  }
}

export class InMemoryLabelRepo implements LabelRepo {
  private labels = new Map<string, Label>();

  async findById(id: string): Promise<Label | null> {
    return this.labels.get(id) || null;
  }

  async findByProjectId(projectId: string): Promise<Label[]> {
    return Array.from(this.labels.values()).filter(
      (label) => label.projectId === projectId
    );
  }

  async findByName(projectId: string, name: string): Promise<Label | null> {
    for (const label of this.labels.values()) {
      if (label.projectId === projectId && label.name === name) {
        return label;
      }
    }
    return null;
  }

  async findByIds(ids: string[]): Promise<Label[]> {
    const results: Label[] = [];
    for (const id of ids) {
      const label = this.labels.get(id);
      if (label) {
        results.push(label);
      }
    }
    return results;
  }

  async create(data: Omit<Label, 'id' | 'createdAt'>): Promise<Label> {
    const now = Math.floor(Date.now() / 1000);
    const label: Label = {
      id: randomUUID(),
      ...data,
      createdAt: now,
    };
    this.labels.set(label.id, label);
    return label;
  }

  async update(
    id: string,
    data: Partial<Omit<Label, 'id' | 'createdAt'>>
  ): Promise<Label | null> {
    const existing = this.labels.get(id);
    if (!existing) {
      return null;
    }
    const updated: Label = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
    };
    this.labels.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.labels.delete(id);
  }
}

export class InMemoryCommentRepo implements CommentRepo {
  private comments = new Map<string, Comment>();

  async findById(id: string): Promise<Comment | null> {
    return this.comments.get(id) || null;
  }

  async findByIssueId(issueId: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter((comment) => comment.issueId === issueId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async create(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const now = Math.floor(Date.now() / 1000);
    const comment: Comment = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async update(
    id: string,
    data: Partial<Omit<Comment, 'id' | 'createdAt'>>
  ): Promise<Comment | null> {
    const existing = this.comments.get(id);
    if (!existing) {
      return null;
    }
    const updated: Comment = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.comments.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.comments.delete(id);
  }
}

export class InMemoryDocumentRepo implements DocumentRepo {
  private documents = new Map<string, Document>();

  async findById(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  async findByIssueId(issueId: string): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter((document) => document.issueId === issueId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async findByProjectId(projectId: string): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter((document) => document.projectId === projectId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const now = Math.floor(Date.now() / 1000);
    const document: Document = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(document.id, document);
    return document;
  }

  async update(
    id: string,
    data: Partial<Omit<Document, 'id' | 'createdAt'>>
  ): Promise<Document | null> {
    const existing = this.documents.get(id);
    if (!existing) {
      return null;
    }
    const updated: Document = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.documents.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }
}

export class InMemoryIssueLabelRepo implements IssueLabelRepo {
  private issueLabels = new Map<string, Set<string>>();
  private labelIssues = new Map<string, Set<string>>();

  async setIssueLabels(issueId: string, labelIds: string[]): Promise<void> {
    this.issueLabels.set(issueId, new Set(labelIds));
    this.labelIssues.clear();
    for (const [iid, labels] of this.issueLabels.entries()) {
      for (const labelId of labels) {
        if (!this.labelIssues.has(labelId)) {
          this.labelIssues.set(labelId, new Set());
        }
        this.labelIssues.get(labelId)?.add(iid);
      }
    }
  }

  async getIssueLabelIds(issueId: string): Promise<string[]> {
    return Array.from(this.issueLabels.get(issueId) || []);
  }

  async deleteByIssueId(issueId: string): Promise<void> {
    const labelIds = this.issueLabels.get(issueId);
    if (labelIds) {
      for (const labelId of labelIds) {
        this.labelIssues.get(labelId)?.delete(issueId);
      }
    }
    this.issueLabels.delete(issueId);
  }

  async deleteByLabelId(labelId: string): Promise<void> {
    const issueIds = this.labelIssues.get(labelId);
    if (issueIds) {
      for (const issueId of issueIds) {
        this.issueLabels.get(issueId)?.delete(labelId);
      }
    }
    this.labelIssues.delete(labelId);
  }
}

export function createInMemoryRepos() {
  return {
    projects: new InMemoryProjectRepo(),
    issues: new InMemoryIssueRepo(),
    labels: new InMemoryLabelRepo(),
    comments: new InMemoryCommentRepo(),
    documents: new InMemoryDocumentRepo(),
    issueLabels: new InMemoryIssueLabelRepo(),
  };
}