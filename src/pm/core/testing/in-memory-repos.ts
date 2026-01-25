import type { CommentDto, DocumentDto, LabelDto, ProjectDto } from '../../contracts/http.js';
import type {
  CommentCreateInput,
  DocumentCreateInput,
  IssueCreateInput,
  IssueRecord,
  IssueUpdateInput,
  LabelCreateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
} from '../repos/index.js';
import type {
  CommentRepo,
  DocumentRepo,
  IssueRepo,
  LabelRepo,
  PmRepos,
  ProjectRepo,
} from '../repos/index.js';

export class InMemoryProjectRepo implements ProjectRepo {
  private items = new Map<string, ProjectDto>();

  list(): ProjectDto[] {
    return [...this.items.values()];
  }

  getById(id: string): ProjectDto | null {
    return this.items.get(id) ?? null;
  }

  getBySlug(slug: string): ProjectDto | null {
    for (const project of this.items.values()) {
      if (project.slug === slug) {
        return project;
      }
    }

    return null;
  }

  create(input: ProjectCreateInput): ProjectDto {
    const project: ProjectDto = { ...input };
    this.items.set(project.id, project);
    return project;
  }

  update(id: string, input: ProjectUpdateInput): ProjectDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    const updated: ProjectDto = {
      ...existing,
      ...input,
      description: input.description ?? existing.description,
      repoUrl: input.repoUrl ?? existing.repoUrl,
      config: input.config ?? existing.config,
    };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): ProjectDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    this.items.delete(id);
    return existing;
  }
}

export class InMemoryIssueRepo implements IssueRepo {
  private items = new Map<string, IssueRecord>();
  private projectCounters = new Map<string, number>();

  listByProject(projectId: string): IssueRecord[] {
    return [...this.items.values()]
      .filter((issue) => issue.projectId === projectId)
      .sort((a, b) => a.number - b.number);
  }

  getById(id: string): IssueRecord | null {
    return this.items.get(id) ?? null;
  }

  create(input: IssueCreateInput): IssueRecord {
    const issue: IssueRecord = {
      ...input,
      labelIds: [],
    };
    this.items.set(issue.id, issue);
    return issue;
  }

  update(id: string, input: IssueUpdateInput): IssueRecord | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    const updated: IssueRecord = {
      ...existing,
      ...input,
      description: input.description ?? existing.description,
      presetId: input.presetId ?? existing.presetId,
      branchName: input.branchName ?? existing.branchName,
      prNumber: input.prNumber ?? existing.prNumber,
      prUrl: input.prUrl ?? existing.prUrl,
      assignedAgentId: input.assignedAgentId ?? existing.assignedAgentId,
      assignedHuman: input.assignedHuman ?? existing.assignedHuman,
      attributes: input.attributes ?? existing.attributes,
      startedAt: input.startedAt ?? existing.startedAt,
      completedAt: input.completedAt ?? existing.completedAt,
    };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): IssueRecord | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    this.items.delete(id);
    return existing;
  }

  setLabels(issueId: string, labelIds: string[]): IssueRecord | null {
    const existing = this.items.get(issueId);
    if (!existing) {
      return null;
    }

    const updated: IssueRecord = {
      ...existing,
      labelIds: [...labelIds],
    };
    this.items.set(issueId, updated);
    return updated;
  }

  nextNumber(projectId: string): number {
    const current = this.projectCounters.get(projectId);
    if (current !== undefined) {
      const next = current + 1;
      this.projectCounters.set(projectId, next);
      return next;
    }

    let max = 0;
    for (const issue of this.items.values()) {
      if (issue.projectId === projectId && issue.number > max) {
        max = issue.number;
      }
    }

    const next = max + 1;
    this.projectCounters.set(projectId, next);
    return next;
  }
}

export class InMemoryLabelRepo implements LabelRepo {
  private items = new Map<string, LabelDto>();

  listByProject(projectId: string): LabelDto[] {
    return [...this.items.values()].filter((label) => label.projectId === projectId);
  }

  getById(id: string): LabelDto | null {
    return this.items.get(id) ?? null;
  }

  getByName(projectId: string, name: string): LabelDto | null {
    for (const label of this.items.values()) {
      if (label.projectId === projectId && label.name === name) {
        return label;
      }
    }

    return null;
  }

  create(input: LabelCreateInput): LabelDto {
    const label: LabelDto = { ...input };
    this.items.set(label.id, label);
    return label;
  }
}

export class InMemoryCommentRepo implements CommentRepo {
  private items = new Map<string, CommentDto>();

  listByIssue(issueId: string): CommentDto[] {
    return [...this.items.values()].filter((comment) => comment.issueId === issueId);
  }

  create(input: CommentCreateInput): CommentDto {
    const comment: CommentDto = { ...input };
    this.items.set(comment.id, comment);
    return comment;
  }
}

export class InMemoryDocumentRepo implements DocumentRepo {
  private items = new Map<string, DocumentDto>();

  listByIssue(issueId: string): DocumentDto[] {
    return [...this.items.values()].filter((document) => document.issueId === issueId);
  }

  create(input: DocumentCreateInput): DocumentDto {
    const document: DocumentDto = { ...input };
    this.items.set(document.id, document);
    return document;
  }
}

export function createInMemoryRepos(): PmRepos {
  return {
    projects: new InMemoryProjectRepo(),
    issues: new InMemoryIssueRepo(),
    labels: new InMemoryLabelRepo(),
    comments: new InMemoryCommentRepo(),
    documents: new InMemoryDocumentRepo(),
  };
}
