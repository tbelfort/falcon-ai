import type {
  ApiError,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

function isAbortSignal(signal: AbortSignal | null | undefined): signal is AbortSignal {
  if (!signal || typeof AbortSignal === 'undefined') {
    return false;
  }
  return signal instanceof AbortSignal;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : null;

  if (!response.ok) {
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = (payload as ApiError).error;
      throw new ApiRequestError(error.message, error.code, response.status, error.details);
    }
    throw new ApiRequestError(response.statusText, 'HTTP_ERROR', response.status);
  }

  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new ApiRequestError('Invalid response payload', 'INVALID_RESPONSE', response.status);
  }

  return (payload as { data: T }).data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const allowSignal = import.meta.env.MODE !== 'test';
  const safeSignal = allowSignal && isAbortSignal(init?.signal) ? init?.signal : undefined;
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init,
    signal: safeSignal
  });

  return parseResponse<T>(response);
}

export const api = {
  getProjects: (signal?: AbortSignal) =>
    request<ProjectDto[]>('/api/projects', { signal }),
  getIssues: (projectId: string, signal?: AbortSignal) =>
    request<IssueDto[]>(`/api/issues?projectId=${encodeURIComponent(projectId)}`, { signal }),
  getLabels: (projectId: string, signal?: AbortSignal) =>
    request<LabelDto[]>(`/api/projects/${projectId}/labels`, { signal }),
  getComments: (issueId: string, signal?: AbortSignal) =>
    request<CommentDto[]>(`/api/issues/${issueId}/comments`, { signal }),
  addComment: (issueId: string, body: { content: string; authorName?: string }) =>
    request<CommentDto>(`/api/issues/${issueId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  transitionIssue: (issueId: string, toStage: IssueStage) =>
    request<IssueDto>(`/api/issues/${issueId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStage })
    }),
  updateIssueLabels: (issueId: string, labelIds: string[]) =>
    request<IssueDto>(`/api/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify({ labelIds })
    })
};
