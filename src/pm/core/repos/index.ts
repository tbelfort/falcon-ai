import type { IssueStage } from '../types.js';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string | null;
  config: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  stage: IssueStage;
  priority: string | null;
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface Comment {
  id: string;
  issueId: string;
  content: string;
  authorType: string;
  authorName: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  projectId: string;
  issueId: string | null;
  title: string;
  docType: string;
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFilter {
  limit?: number;
  offset?: number;
}

export interface IssueFilter {
  projectId?: string;
  status?: string;
  stage?: IssueStage;
  limit?: number;
  offset?: number;
}

export interface ProjectRepo {
  findById(id: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  findAll(filter?: ProjectFilter): Promise<Project[]>;
  count(): Promise<number>;
  create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}

export interface IssueRepo {
  findById(id: string): Promise<Issue | null>;
  findByProjectId(projectId: string, filter?: IssueFilter): Promise<Issue[]>;
  countByProjectId(projectId: string): Promise<number>;
  findByNumber(projectId: string, number: number): Promise<Issue | null>;
  create(data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'number'>): Promise<Issue>;
  update(id: string, data: Partial<Omit<Issue, 'id' | 'createdAt'>>): Promise<Issue | null>;
  delete(id: string): Promise<boolean>;
  getNextIssueNumber(projectId: string): Promise<number>;
}

export interface LabelRepo {
  findById(id: string): Promise<Label | null>;
  findByProjectId(projectId: string): Promise<Label[]>;
  findByName(projectId: string, name: string): Promise<Label | null>;
  findByIds(ids: string[]): Promise<Label[]>;
  create(data: Omit<Label, 'id' | 'createdAt'>): Promise<Label>;
  update(id: string, data: Partial<Omit<Label, 'id' | 'createdAt'>>): Promise<Label | null>;
  delete(id: string): Promise<boolean>;
}

export interface CommentRepo {
  findById(id: string): Promise<Comment | null>;
  findByIssueId(issueId: string): Promise<Comment[]>;
  create(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment>;
  update(id: string, data: Partial<Omit<Comment, 'id' | 'createdAt'>>): Promise<Comment | null>;
  delete(id: string): Promise<boolean>;
}

export interface DocumentRepo {
  findById(id: string): Promise<Document | null>;
  findByIssueId(issueId: string): Promise<Document[]>;
  findByProjectId(projectId: string): Promise<Document[]>;
  create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document>;
  update(id: string, data: Partial<Omit<Document, 'id' | 'createdAt'>>): Promise<Document | null>;
  delete(id: string): Promise<boolean>;
}

export interface IssueLabelRepo {
  setIssueLabels(issueId: string, labelIds: string[]): Promise<void>;
  getIssueLabelIds(issueId: string): Promise<string[]>;
  deleteByIssueId(issueId: string): Promise<void>;
  deleteByLabelId(labelId: string): Promise<void>;
}

export interface Repos {
  projects: ProjectRepo;
  issues: IssueRepo;
  labels: LabelRepo;
  comments: CommentRepo;
  documents: DocumentRepo;
  issueLabels: IssueLabelRepo;
}