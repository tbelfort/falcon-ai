import type {
  Comment,
  Document,
  Issue,
  Label,
  Project,
} from '../types.js';
import type {
  CommentRepository,
  DocumentRepository,
  IssueRepository,
  LabelRepository,
  ProjectRepository,
  Repositories,
} from '../repos/index.js';

function cloneProject(project: Project): Project {
  return { ...project };
}

function cloneLabel(label: Label): Label {
  return { ...label };
}

function cloneIssue(issue: Issue): Issue {
  return {
    ...issue,
    labels: issue.labels.map((label) => cloneLabel(label)),
  };
}

function cloneComment(comment: Comment): Comment {
  return { ...comment };
}

function cloneDocument(document: Document): Document {
  return { ...document };
}

class InMemoryProjectRepository implements ProjectRepository {
  private projects = new Map<string, Project>();

  list(): Project[] {
    return [...this.projects.values()].map((project) => cloneProject(project));
  }

  getById(id: string): Project | null {
    const project = this.projects.get(id);
    return project ? cloneProject(project) : null;
  }

  getBySlug(slug: string): Project | null {
    for (const project of this.projects.values()) {
      if (project.slug === slug) {
        return cloneProject(project);
      }
    }
    return null;
  }

  create(project: Project): Project {
    const stored = cloneProject(project);
    this.projects.set(project.id, stored);
    return cloneProject(stored);
  }

  update(project: Project): Project {
    if (!this.projects.has(project.id)) {
      throw new Error(`Project ${project.id} not found`);
    }
    const stored = cloneProject(project);
    this.projects.set(project.id, stored);
    return cloneProject(stored);
  }

  delete(id: string): Project | null {
    const project = this.projects.get(id);
    if (!project) {
      return null;
    }
    this.projects.delete(id);
    return cloneProject(project);
  }
}

class InMemoryIssueRepository implements IssueRepository {
  private issues = new Map<string, Issue>();

  listByProject(projectId: string): Issue[] {
    const issues = [...this.issues.values()].filter(
      (issue) => issue.projectId === projectId
    );
    return issues.map((issue) => cloneIssue(issue));
  }

  getById(id: string): Issue | null {
    const issue = this.issues.get(id);
    return issue ? cloneIssue(issue) : null;
  }

  getNextNumber(projectId: string): number {
    let max = 0;
    for (const issue of this.issues.values()) {
      if (issue.projectId === projectId && issue.number > max) {
        max = issue.number;
      }
    }
    return max + 1;
  }

  create(issue: Issue): Issue {
    const stored = cloneIssue(issue);
    this.issues.set(issue.id, stored);
    return cloneIssue(stored);
  }

  update(issue: Issue): Issue {
    if (!this.issues.has(issue.id)) {
      throw new Error(`Issue ${issue.id} not found`);
    }
    const stored = cloneIssue(issue);
    this.issues.set(issue.id, stored);
    return cloneIssue(stored);
  }

  delete(id: string): Issue | null {
    const issue = this.issues.get(id);
    if (!issue) {
      return null;
    }
    this.issues.delete(id);
    return cloneIssue(issue);
  }
}

class InMemoryLabelRepository implements LabelRepository {
  private labels = new Map<string, Label>();

  listByProject(projectId: string): Label[] {
    const labels = [...this.labels.values()].filter(
      (label) => label.projectId === projectId
    );
    return labels.map((label) => cloneLabel(label));
  }

  getById(id: string): Label | null {
    const label = this.labels.get(id);
    return label ? cloneLabel(label) : null;
  }

  findByName(projectId: string, name: string): Label | null {
    for (const label of this.labels.values()) {
      if (label.projectId === projectId && label.name === name) {
        return cloneLabel(label);
      }
    }
    return null;
  }

  getByIds(ids: string[]): Label[] {
    const labels: Label[] = [];
    for (const id of ids) {
      const label = this.labels.get(id);
      if (label) {
        labels.push(cloneLabel(label));
      }
    }
    return labels;
  }

  create(label: Label): Label {
    const stored = cloneLabel(label);
    this.labels.set(label.id, stored);
    return cloneLabel(stored);
  }
}

class InMemoryCommentRepository implements CommentRepository {
  private comments = new Map<string, Comment>();

  listByIssue(issueId: string): Comment[] {
    const comments = [...this.comments.values()].filter(
      (comment) => comment.issueId === issueId
    );
    return comments.map((comment) => cloneComment(comment));
  }

  create(comment: Comment): Comment {
    const stored = cloneComment(comment);
    this.comments.set(comment.id, stored);
    return cloneComment(stored);
  }
}

class InMemoryDocumentRepository implements DocumentRepository {
  private documents = new Map<string, Document>();

  listByIssue(issueId: string): Document[] {
    const documents = [...this.documents.values()].filter(
      (document) => document.issueId === issueId
    );
    return documents.map((document) => cloneDocument(document));
  }

  create(document: Document): Document {
    const stored = cloneDocument(document);
    this.documents.set(document.id, stored);
    return cloneDocument(stored);
  }
}

export function createInMemoryRepos(): Repositories {
  return {
    projects: new InMemoryProjectRepository(),
    issues: new InMemoryIssueRepository(),
    labels: new InMemoryLabelRepository(),
    comments: new InMemoryCommentRepository(),
    documents: new InMemoryDocumentRepository(),
  };
}
