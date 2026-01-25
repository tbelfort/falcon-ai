import type { Comment, Document, Issue, Label, Project } from '../types.js';

// Project repository interface
export interface IProjectRepo {
  findAll(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}

// Issue repository interface
export interface IIssueRepo {
  findAll(projectId?: string): Promise<Issue[]>;
  findById(id: string): Promise<Issue | null>;
  findByProjectAndNumber(projectId: string, number: number): Promise<Issue | null>;
  getNextNumber(projectId: string): Promise<number>;
  create(data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue>;
  update(id: string, data: Partial<Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Issue | null>;
  delete(id: string): Promise<boolean>;
}

// Label repository interface
export interface ILabelRepo {
  findAll(projectId: string): Promise<Label[]>;
  findById(id: string): Promise<Label | null>;
  findByIds(ids: string[]): Promise<Label[]>;
  findByName(projectId: string, name: string): Promise<Label | null>;
  create(data: Omit<Label, 'id' | 'createdAt'>): Promise<Label>;
  delete(id: string): Promise<boolean>;
}

// Issue-Label junction
export interface IIssueLabelRepo {
  findLabelsByIssue(issueId: string): Promise<Label[]>;
  setLabels(issueId: string, labelIds: string[]): Promise<void>;
}

// Comment repository interface
export interface ICommentRepo {
  findByIssue(issueId: string): Promise<Comment[]>;
  findById(id: string): Promise<Comment | null>;
  create(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment>;
  update(id: string, data: Partial<Pick<Comment, 'content'>>): Promise<Comment | null>;
  delete(id: string): Promise<boolean>;
}

// Document repository interface
export interface IDocumentRepo {
  findByIssue(issueId: string): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document>;
  update(id: string, data: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Document | null>;
  delete(id: string): Promise<boolean>;
}

// Model preset repository interface
export interface IPresetRepo {
  findById(id: string): Promise<{ id: string; name: string } | null>;
  findDefault(): Promise<{ id: string; name: string } | null>;
}

// Aggregated repository container for dependency injection
export interface Repositories {
  projects: IProjectRepo;
  issues: IIssueRepo;
  labels: ILabelRepo;
  issueLabels: IIssueLabelRepo;
  comments: ICommentRepo;
  documents: IDocumentRepo;
  presets: IPresetRepo;
}
