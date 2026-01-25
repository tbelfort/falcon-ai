import type {
  ApiError as ApiErrorPayload,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto
} from './types';

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiClientError extends Error {
  code: string;
  status?: number;
  details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const defaultHeaders = {
  'Content-Type': 'application/json'
};

const isApiError = (payload: ApiResponse<unknown>): payload is ApiErrorPayload => {
  return 'error' in payload;
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as ApiResponse<unknown>;
  } catch (error) {
    throw new ApiClientError('INVALID_JSON', 'Response was not valid JSON', response.status, {
      error
    });
  }
};

async function request<T>(
  path: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers ?? {})
    }
  });

  const payload = await parseJson(response);
  if (payload && isApiError(payload)) {
    throw new ApiClientError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.details
    );
  }

  if (!response.ok) {
    throw new ApiClientError('HTTP_ERROR', `Request failed with status ${response.status}`, response.status);
  }

  if (payload && 'data' in payload) {
    return payload.data as T;
  }

  throw new ApiClientError('INVALID_RESPONSE', 'Response envelope missing data', response.status);
}

export const fetchProjects = (signal?: AbortSignal) =>
  request<ProjectDto[]>('/api/projects', { signal });

export const fetchIssues = (projectId: string, signal?: AbortSignal) =>
  request<IssueDto[]>(`/api/issues?projectId=${encodeURIComponent(projectId)}`, { signal });

export const fetchLabels = (projectId: string, signal?: AbortSignal) =>
  request<LabelDto[]>(`/api/projects/${projectId}/labels`, { signal });

export const fetchComments = (issueId: string, signal?: AbortSignal) =>
  request<CommentDto[]>(`/api/issues/${issueId}/comments`, { signal });

export const addComment = (issueId: string, content: string, authorName?: string) =>
  request<CommentDto>(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, authorName })
  });

export const transitionIssue = (issueId: string, toStage: IssueStage) =>
  request<IssueDto>(`/api/issues/${issueId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStage })
  });

export const updateIssueLabels = (issueId: string, labelIds: string[]) =>
  request<IssueDto>(`/api/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ labelIds })
  });

export const resolveWsUrl = () => {
  const overrideUrl = import.meta.env.VITE_WS_BASE_URL;
  if (overrideUrl) {
    return overrideUrl;
  }
  if (!apiBaseUrl) {
    return '';
  }
  const base = new URL(apiBaseUrl);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/ws';
  return base.toString();
};
