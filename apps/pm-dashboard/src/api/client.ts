import type {
  ApiErrorResponse,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto
} from '../types';

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status?: number;

  constructor(message: string, code: string, details?: unknown, status?: number) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    throw new ApiError('Invalid JSON response', 'invalid_json', error, response.status);
  }

  if (!response.ok) {
    if (payload && 'error' in payload) {
      throw new ApiError(payload.error.message, payload.error.code, payload.error.details, response.status);
    }
    throw new ApiError(response.statusText || 'Request failed', 'http_error', undefined, response.status);
  }

  if (payload && 'error' in payload) {
    throw new ApiError(payload.error.message, payload.error.code, payload.error.details, response.status);
  }

  return (payload as { data: T }).data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { signal, ...rest } = init ?? {};
  const isJsdm =
    typeof window !== 'undefined' &&
    typeof window.navigator?.userAgent === 'string' &&
    window.navigator.userAgent.includes('jsdom');
  const safeSignal =
    !isJsdm &&
    signal &&
    typeof AbortSignal !== 'undefined' &&
    signal instanceof AbortSignal
      ? signal
      : undefined;
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(rest.headers ?? {})
    },
    ...rest,
    signal: safeSignal
  });

  return parseResponse<T>(response);
}

export function getProjects(signal?: AbortSignal) {
  return request<ProjectDto[]>('/api/projects', { signal });
}

export function getIssues(projectId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ projectId });
  return request<IssueDto[]>(`/api/issues?${params.toString()}`, { signal });
}

export function getLabels(projectId: string, signal?: AbortSignal) {
  return request<LabelDto[]>(`/api/projects/${projectId}/labels`, { signal });
}

export function getComments(issueId: string, signal?: AbortSignal) {
  return request<CommentDto[]>(`/api/issues/${issueId}/comments`, { signal });
}

export function addComment(issueId: string, content: string, authorName?: string) {
  return request<CommentDto>(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, authorName })
  });
}

export function transitionIssue(issueId: string, toStage: IssueStage) {
  return request<IssueDto>(`/api/issues/${issueId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStage })
  });
}

export function updateIssueLabels(issueId: string, labelIds: string[]) {
  return request<IssueDto>(`/api/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ labelIds })
  });
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'error' in value;
}
