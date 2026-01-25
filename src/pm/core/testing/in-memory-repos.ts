import { randomUUID } from 'node:crypto';

import type {
  CommentRecord,
  DocumentRecord,
  IssueRecord,
  LabelRecord,
  ProjectRecord,
  Repositories,
} from '../repos/index.js';

export function createInMemoryRepos(): Repositories {
  const projects = new Map<string, ProjectRecord>();
  const projectBySlug = new Map<string, string>();
  const issues = new Map<string, IssueRecord>();
  const issuesByProject = new Map<string, string[]>();
  const issueCounters = new Map<string, number>();
  const labels = new Map<string, LabelRecord>();
  const labelsByProject = new Map<string, string[]>();
  const comments = new Map<string, CommentRecord>();
  const commentsByIssue = new Map<string, string[]>();
  const documents = new Map<string, DocumentRecord>();
  const documentsByIssue = new Map<string, string[]>();

  return {
    projects: {
      async list() {
        return [...projects.values()];
      },
      async getById(id) {
        return projects.get(id) ?? null;
      },
      async getBySlug(slug) {
        const id = projectBySlug.get(slug);
        return id ? projects.get(id) ?? null : null;
      },
      async create(project) {
        projects.set(project.id, project);
        projectBySlug.set(project.slug, project.id);
        return project;
      },
      async update(id, updates) {
        const existing = projects.get(id);
        if (!existing) {
          return null;
        }
        if (updates.slug && updates.slug !== existing.slug) {
          projectBySlug.delete(existing.slug);
          projectBySlug.set(updates.slug, id);
        }
        const updated = { ...existing, ...updates };
        projects.set(id, updated);
        return updated;
      },
      async delete(id) {
        const existing = projects.get(id);
        if (!existing) {
          return null;
        }
        projects.delete(id);
        projectBySlug.delete(existing.slug);
        return existing;
      },
    },
    issues: {
      async listByProject(projectId) {
        const ids = issuesByProject.get(projectId) ?? [];
        return ids.map((id) => issues.get(id)).filter(Boolean) as IssueRecord[];
      },
      async getById(id) {
        return issues.get(id) ?? null;
      },
      async create(issue) {
        issues.set(issue.id, issue);
        const list = issuesByProject.get(issue.projectId) ?? [];
        list.push(issue.id);
        issuesByProject.set(issue.projectId, list);
        return issue;
      },
      async update(id, updates) {
        const existing = issues.get(id);
        if (!existing) {
          return null;
        }
        const updated = { ...existing, ...updates };
        issues.set(id, updated);
        return updated;
      },
      async delete(id) {
        const existing = issues.get(id);
        if (!existing) {
          return null;
        }
        issues.delete(id);
        const list = issuesByProject.get(existing.projectId) ?? [];
        issuesByProject.set(
          existing.projectId,
          list.filter((issueId) => issueId !== id)
        );
        return existing;
      },
      async getNextNumber(projectId) {
        const next = (issueCounters.get(projectId) ?? 0) + 1;
        issueCounters.set(projectId, next);
        return next;
      },
    },
    labels: {
      async listByProject(projectId) {
        const ids = labelsByProject.get(projectId) ?? [];
        return ids.map((id) => labels.get(id)).filter(Boolean) as LabelRecord[];
      },
      async getById(id) {
        return labels.get(id) ?? null;
      },
      async getByIds(ids) {
        return ids.map((id) => labels.get(id)).filter(Boolean) as LabelRecord[];
      },
      async create(label) {
        labels.set(label.id, label);
        const list = labelsByProject.get(label.projectId) ?? [];
        list.push(label.id);
        labelsByProject.set(label.projectId, list);
        return label;
      },
    },
    comments: {
      async listByIssue(issueId) {
        const ids = commentsByIssue.get(issueId) ?? [];
        return ids.map((id) => comments.get(id)).filter(Boolean) as CommentRecord[];
      },
      async create(comment) {
        comments.set(comment.id, comment);
        const list = commentsByIssue.get(comment.issueId) ?? [];
        list.push(comment.id);
        commentsByIssue.set(comment.issueId, list);
        return comment;
      },
    },
    documents: {
      async listByIssue(issueId) {
        const ids = documentsByIssue.get(issueId) ?? [];
        return ids
          .map((id) => documents.get(id))
          .filter(Boolean) as DocumentRecord[];
      },
      async create(document) {
        documents.set(document.id, document);
        const list = documentsByIssue.get(document.issueId ?? '') ?? [];
        list.push(document.id);
        documentsByIssue.set(document.issueId ?? '', list);
        return document;
      },
    },
  };
}

export function createId(): string {
  return randomUUID();
}
