import { randomUUID } from 'node:crypto';
import type { Comment, Document, Issue, Label, Project } from '../types.js';
import type {
  ICommentRepo,
  IDocumentRepo,
  IIssueLabelRepo,
  IIssueRepo,
  ILabelRepo,
  IPresetRepo,
  IProjectRepo,
  Repositories,
} from '../repos/interfaces.js';

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

// In-memory Project repository
export class InMemoryProjectRepo implements IProjectRepo {
  private projects: Map<string, Project> = new Map();

  async findAll(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    for (const project of this.projects.values()) {
      if (project.slug === slug) return project;
    }
    return null;
  }

  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const now = nowUnix();
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
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Project | null> {
    const existing = this.projects.get(id);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...data,
      updatedAt: nowUnix(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  clear(): void {
    this.projects.clear();
  }
}

// In-memory Issue repository
export class InMemoryIssueRepo implements IIssueRepo {
  private issues: Map<string, Issue> = new Map();
  private numberCounters: Map<string, number> = new Map();

  async findAll(projectId?: string): Promise<Issue[]> {
    const all = Array.from(this.issues.values());
    if (projectId) {
      return all.filter((i) => i.projectId === projectId);
    }
    return all;
  }

  async findById(id: string): Promise<Issue | null> {
    return this.issues.get(id) ?? null;
  }

  async findByProjectAndNumber(projectId: string, number: number): Promise<Issue | null> {
    for (const issue of this.issues.values()) {
      if (issue.projectId === projectId && issue.number === number) {
        return issue;
      }
    }
    return null;
  }

  async getNextNumber(projectId: string): Promise<number> {
    const current = this.numberCounters.get(projectId) ?? 0;
    const next = current + 1;
    this.numberCounters.set(projectId, next);
    return next;
  }

  async create(data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue> {
    const now = nowUnix();
    const issue: Issue = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  async update(
    id: string,
    data: Partial<Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Issue | null> {
    const existing = this.issues.get(id);
    if (!existing) return null;

    const updated: Issue = {
      ...existing,
      ...data,
      updatedAt: nowUnix(),
    };
    this.issues.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.issues.delete(id);
  }

  clear(): void {
    this.issues.clear();
    this.numberCounters.clear();
  }
}

// In-memory Label repository
export class InMemoryLabelRepo implements ILabelRepo {
  private labels: Map<string, Label> = new Map();

  async findAll(projectId: string): Promise<Label[]> {
    return Array.from(this.labels.values()).filter((l) => l.projectId === projectId);
  }

  async findById(id: string): Promise<Label | null> {
    return this.labels.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Label[]> {
    return ids.map((id) => this.labels.get(id)).filter((l): l is Label => l != null);
  }

  async findByName(projectId: string, name: string): Promise<Label | null> {
    for (const label of this.labels.values()) {
      if (label.projectId === projectId && label.name === name) {
        return label;
      }
    }
    return null;
  }

  async create(data: Omit<Label, 'id' | 'createdAt'>): Promise<Label> {
    const label: Label = {
      id: randomUUID(),
      ...data,
      createdAt: nowUnix(),
    };
    this.labels.set(label.id, label);
    return label;
  }

  async delete(id: string): Promise<boolean> {
    return this.labels.delete(id);
  }

  clear(): void {
    this.labels.clear();
  }
}

// In-memory Issue-Label junction
export class InMemoryIssueLabelRepo implements IIssueLabelRepo {
  private issueLabels: Map<string, Set<string>> = new Map();
  private labelRepo: InMemoryLabelRepo;

  constructor(labelRepo: InMemoryLabelRepo) {
    this.labelRepo = labelRepo;
  }

  async findLabelsByIssue(issueId: string): Promise<Label[]> {
    const labelIds = this.issueLabels.get(issueId);
    if (!labelIds || labelIds.size === 0) return [];
    return this.labelRepo.findByIds(Array.from(labelIds));
  }

  async setLabels(issueId: string, labelIds: string[]): Promise<void> {
    this.issueLabels.set(issueId, new Set(labelIds));
  }

  clear(): void {
    this.issueLabels.clear();
  }
}

// In-memory Comment repository
export class InMemoryCommentRepo implements ICommentRepo {
  private comments: Map<string, Comment> = new Map();

  async findByIssue(issueId: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter((c) => c.issueId === issueId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async findById(id: string): Promise<Comment | null> {
    return this.comments.get(id) ?? null;
  }

  async create(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const now = nowUnix();
    const comment: Comment = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async update(id: string, data: Partial<Pick<Comment, 'content'>>): Promise<Comment | null> {
    const existing = this.comments.get(id);
    if (!existing) return null;

    const updated: Comment = {
      ...existing,
      ...data,
      updatedAt: nowUnix(),
    };
    this.comments.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.comments.delete(id);
  }

  clear(): void {
    this.comments.clear();
  }
}

// In-memory Document repository
export class InMemoryDocumentRepo implements IDocumentRepo {
  private documents: Map<string, Document> = new Map();

  async findByIssue(issueId: string): Promise<Document[]> {
    return Array.from(this.documents.values()).filter((d) => d.issueId === issueId);
  }

  async findById(id: string): Promise<Document | null> {
    return this.documents.get(id) ?? null;
  }

  async create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const now = nowUnix();
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
    data: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Document | null> {
    const existing = this.documents.get(id);
    if (!existing) return null;

    const updated: Document = {
      ...existing,
      ...data,
      updatedAt: nowUnix(),
    };
    this.documents.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }

  clear(): void {
    this.documents.clear();
  }
}

// In-memory Preset repository
export class InMemoryPresetRepo implements IPresetRepo {
  private presets: Map<string, { id: string; name: string; isDefault: boolean }> = new Map();

  constructor() {
    // Add a default preset for testing
    const defaultPreset = { id: 'default-preset-id', name: 'full-pipeline', isDefault: true };
    this.presets.set(defaultPreset.id, defaultPreset);
  }

  async findById(id: string): Promise<{ id: string; name: string } | null> {
    const preset = this.presets.get(id);
    return preset ? { id: preset.id, name: preset.name } : null;
  }

  async findDefault(): Promise<{ id: string; name: string } | null> {
    for (const preset of this.presets.values()) {
      if (preset.isDefault) {
        return { id: preset.id, name: preset.name };
      }
    }
    return null;
  }

  addPreset(preset: { id: string; name: string; isDefault?: boolean }): void {
    this.presets.set(preset.id, { ...preset, isDefault: preset.isDefault ?? false });
  }

  clear(): void {
    this.presets.clear();
  }
}

// Factory function to create all in-memory repos
export function createInMemoryRepositories(): Repositories & {
  clear(): void;
} {
  const projects = new InMemoryProjectRepo();
  const issues = new InMemoryIssueRepo();
  const labels = new InMemoryLabelRepo();
  const issueLabels = new InMemoryIssueLabelRepo(labels);
  const comments = new InMemoryCommentRepo();
  const documents = new InMemoryDocumentRepo();
  const presets = new InMemoryPresetRepo();

  return {
    projects,
    issues,
    labels,
    issueLabels,
    comments,
    documents,
    presets,
    clear() {
      (projects as InMemoryProjectRepo).clear();
      (issues as InMemoryIssueRepo).clear();
      (labels as InMemoryLabelRepo).clear();
      (issueLabels as InMemoryIssueLabelRepo).clear();
      (comments as InMemoryCommentRepo).clear();
      (documents as InMemoryDocumentRepo).clear();
      (presets as InMemoryPresetRepo).clear();
    },
  };
}
