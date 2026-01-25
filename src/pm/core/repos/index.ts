import type {
  CommentDto,
  DocumentDto,
  IssueDto,
  LabelDto,
  ProjectDto,
} from '../../contracts/http.js';

export interface ProjectsRepo {
  list(): Promise<ProjectDto[]>;
  getById(id: string): Promise<ProjectDto | null>;
  getBySlug(slug: string): Promise<ProjectDto | null>;
  create(project: ProjectDto): Promise<ProjectDto>;
  update(id: string, updates: Partial<ProjectDto>): Promise<ProjectDto | null>;
  delete(id: string): Promise<ProjectDto | null>;
}

export interface IssuesRepo {
  listByProject(projectId: string): Promise<IssueDto[]>;
  getById(id: string): Promise<IssueDto | null>;
  create(issue: IssueDto): Promise<IssueDto>;
  update(id: string, updates: Partial<IssueDto>): Promise<IssueDto | null>;
  delete(id: string): Promise<IssueDto | null>;
  getNextNumber(projectId: string): Promise<number>;
}

export interface LabelsRepo {
  listByProject(projectId: string): Promise<LabelDto[]>;
  getById(id: string): Promise<LabelDto | null>;
  getByIds(ids: string[]): Promise<LabelDto[]>;
  create(label: LabelDto): Promise<LabelDto>;
}

export interface CommentsRepo {
  listByIssue(issueId: string): Promise<CommentDto[]>;
  create(comment: CommentDto): Promise<CommentDto>;
}

export interface DocumentsRepo {
  listByIssue(issueId: string): Promise<DocumentDto[]>;
  create(document: DocumentDto): Promise<DocumentDto>;
}

export interface PmRepos {
  projects: ProjectsRepo;
  issues: IssuesRepo;
  labels: LabelsRepo;
  comments: CommentsRepo;
  documents: DocumentsRepo;
}
