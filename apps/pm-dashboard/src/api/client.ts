import type {
  ApiResponse,
  ProjectDto,
  IssueDto,
  LabelDto,
  CommentDto,
  IssueStage,
  isApiError,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if ('error' in json) {
    throw new ApiClientError(json.error.code, json.error.message, json.error.details);
  }

  return json.data;
}

export const api = {
  // Projects
  getProjects(signal?: AbortSignal): Promise<ProjectDto[]> {
    return request<ProjectDto[]>('/api/projects', {}, signal);
  },

  // Issues
  getIssues(projectId: string, signal?: AbortSignal): Promise<IssueDto[]> {
    return request<IssueDto[]>(`/api/issues?projectId=${encodeURIComponent(projectId)}`, {}, signal);
  },

  transitionIssue(issueId: string, toStage: IssueStage): Promise<IssueDto> {
    return request<IssueDto>(`/api/issues/${encodeURIComponent(issueId)}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStage }),
    });
  },

  updateIssue(issueId: string, updates: { labelIds: string[] }): Promise<IssueDto> {
    return request<IssueDto>(`/api/issues/${encodeURIComponent(issueId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // Labels
  getLabels(projectId: string, signal?: AbortSignal): Promise<LabelDto[]> {
    return request<LabelDto[]>(`/api/projects/${encodeURIComponent(projectId)}/labels`, {}, signal);
  },

  // Comments
  getComments(issueId: string, signal?: AbortSignal): Promise<CommentDto[]> {
    return request<CommentDto[]>(`/api/issues/${encodeURIComponent(issueId)}/comments`, {}, signal);
  },

  addComment(issueId: string, content: string, authorName?: string): Promise<CommentDto> {
    return request<CommentDto>(`/api/issues/${encodeURIComponent(issueId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, authorName }),
    });
  },
};
