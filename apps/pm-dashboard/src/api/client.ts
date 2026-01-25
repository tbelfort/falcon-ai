import type {
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto,
} from '../types';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function isApiError<T>(response: ApiResponse<T>): response is { error: { code: string; message: string; details?: unknown } } {
  return 'error' in response;
}

async function unwrap<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>;
  if (isApiError(json)) {
    throw new ApiClientError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const apiClient = {
  async getProjects(signal?: AbortSignal): Promise<ProjectDto[]> {
    const res = await fetch(`${BASE_URL}/api/projects`, { signal });
    return unwrap<ProjectDto[]>(res);
  },

  async getIssues(projectId: string, signal?: AbortSignal): Promise<IssueDto[]> {
    const res = await fetch(`${BASE_URL}/api/issues?projectId=${encodeURIComponent(projectId)}`, { signal });
    return unwrap<IssueDto[]>(res);
  },

  async getLabels(projectId: string, signal?: AbortSignal): Promise<LabelDto[]> {
    const res = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/labels`, { signal });
    return unwrap<LabelDto[]>(res);
  },

  async getComments(issueId: string, signal?: AbortSignal): Promise<CommentDto[]> {
    const res = await fetch(`${BASE_URL}/api/issues/${encodeURIComponent(issueId)}/comments`, { signal });
    return unwrap<CommentDto[]>(res);
  },

  async addComment(issueId: string, content: string, authorName?: string): Promise<CommentDto> {
    const res = await fetch(`${BASE_URL}/api/issues/${encodeURIComponent(issueId)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, authorName }),
    });
    return unwrap<CommentDto>(res);
  },

  async transitionIssue(issueId: string, toStage: IssueStage): Promise<IssueDto> {
    const res = await fetch(`${BASE_URL}/api/issues/${encodeURIComponent(issueId)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStage }),
    });
    return unwrap<IssueDto>(res);
  },

  async updateIssueLabels(issueId: string, labelIds: string[]): Promise<IssueDto> {
    const res = await fetch(`${BASE_URL}/api/issues/${encodeURIComponent(issueId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelIds }),
    });
    return unwrap<IssueDto>(res);
  },
};
