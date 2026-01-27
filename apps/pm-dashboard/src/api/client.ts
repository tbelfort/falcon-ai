import type {
  ApiError,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto,
} from './types';

export class ApiRequestError extends Error {
  code: string;
  details?: unknown;
  status?: number;

  constructor(message: string, code: string, details?: unknown, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorPayload: ApiError | undefined;
    try {
      errorPayload = (await response.json()) as ApiError;
    } catch {
      throw new ApiRequestError(`HTTP ${response.status}`, 'http_error', undefined, response.status);
    }
    if (errorPayload && 'error' in errorPayload) {
      throw new ApiRequestError(errorPayload.error?.message ?? 'Unknown error', errorPayload.error?.code ?? 'unknown', errorPayload.error?.details, response.status);
    }
    throw new ApiRequestError(`HTTP ${response.status}`, 'http_error', undefined, response.status);
  }

  let payload: ApiResponse<T> | undefined;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    throw new ApiRequestError('Invalid JSON response', 'invalid_json', error, response.status);
  }

  if ('error' in payload) {
    const apiError = payload.error as ApiError['error'] | undefined;
    throw new ApiRequestError(apiError?.message ?? 'Unknown error', apiError?.code ?? 'unknown', apiError?.details, response.status);
  }

  return payload.data;
}

const DEFAULT_TIMEOUT_MS = 30000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { signal, ...rest } = options;
  const resolvedOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...rest,
  };

  if (!import.meta.env.VITEST) {
    // Use provided signal or create a timeout signal
    if (signal) {
      resolvedOptions.signal = signal;
    } else if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      resolvedOptions.signal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, resolvedOptions);

  return parseResponse<T>(response);
}

export function fetchProjects(signal?: AbortSignal): Promise<ProjectDto[]> {
  return request<ProjectDto[]>('/api/projects', { signal });
}

export function fetchIssues(projectId: string, signal?: AbortSignal): Promise<IssueDto[]> {
  const params = new URLSearchParams({ projectId });
  return request<IssueDto[]>(`/api/issues?${params.toString()}`, { signal });
}

export function fetchLabels(projectId: string, signal?: AbortSignal): Promise<LabelDto[]> {
  return request<LabelDto[]>(`/api/projects/${projectId}/labels`, { signal });
}

export function fetchComments(issueId: string): Promise<CommentDto[]> {
  return request<CommentDto[]>(`/api/issues/${issueId}/comments`);
}

export function createComment(issueId: string, content: string, authorName?: string): Promise<CommentDto> {
  return request<CommentDto>(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, authorName, authorType: 'human' }),
  });
}

export function transitionIssue(issueId: string, toStage: IssueStage): Promise<IssueDto> {
  return request<IssueDto>(`/api/issues/${issueId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStage }),
  });
}

export function updateIssueLabels(issueId: string, labelIds: string[]): Promise<IssueDto> {
  return request<IssueDto>(`/api/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ labelIds }),
  });
}
