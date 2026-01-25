import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from '../../contracts/http.js';

export interface IssueRecord extends Omit<IssueDto, 'labels'> {
  labelIds: string[];
}

export type ProjectRecord = ProjectDto;
export type LabelRecord = LabelDto;
export type CommentRecord = CommentDto;
export type DocumentRecord = DocumentDto;

export interface ProjectRepo {
  list(): Promise<ProjectRecord[]>;
  getById(id: string): Promise<ProjectRecord | null>;
  getBySlug(slug: string): Promise<ProjectRecord | null>;
  create(project: ProjectRecord): Promise<ProjectRecord>;
  update(
    id: string,
    updates: Partial<ProjectRecord>
  ): Promise<ProjectRecord | null>;
  delete(id: string): Promise<ProjectRecord | null>;
}

export interface IssueRepo {
  listByProject(projectId: string): Promise<IssueRecord[]>;
  getById(id: string): Promise<IssueRecord | null>;
  create(issue: IssueRecord): Promise<IssueRecord>;
  update(id: string, updates: Partial<IssueRecord>): Promise<IssueRecord | null>;
  delete(id: string): Promise<IssueRecord | null>;
  getNextNumber(projectId: string): Promise<number>;
}

export interface LabelRepo {
  listByProject(projectId: string): Promise<LabelRecord[]>;
  getById(id: string): Promise<LabelRecord | null>;
  getByIds(ids: string[]): Promise<LabelRecord[]>;
  create(label: LabelRecord): Promise<LabelRecord>;
}

export interface CommentRepo {
  listByIssue(issueId: string): Promise<CommentRecord[]>;
  create(comment: CommentRecord): Promise<CommentRecord>;
}

export interface DocumentRepo {
  listByIssue(issueId: string): Promise<DocumentRecord[]>;
  create(document: DocumentRecord): Promise<DocumentRecord>;
}

export interface Repositories {
  projects: ProjectRepo;
  issues: IssueRepo;
  labels: LabelRepo;
  comments: CommentRepo;
  documents: DocumentRepo;
}
