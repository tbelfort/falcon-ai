import {
  ApiError,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto
} from './types';
import { getApiBaseUrl } from './config';

export class ApiClientError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return (response as ApiError).error !== undefined;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal
  ): Promise<T> {
    const response = await fetch(joinUrl(this.baseUrl, path), {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      signal,
      ...options
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      if (response.ok) {
        throw new ApiClientError('invalid_response', 'Expected JSON response', response.status);
      }
      throw new ApiClientError('http_error', response.statusText, response.status);
    }

    const body = (await response.json()) as ApiResponse<T>;

    if (isApiError(body)) {
      throw new ApiClientError(body.error.code, body.error.message, response.status, body.error.details);
    }

    if (!response.ok) {
      throw new ApiClientError('http_error', response.statusText, response.status, body);
    }

    return body.data;
  }

  getProjects(signal?: AbortSignal): Promise<ProjectDto[]> {
    return this.request('/api/projects', { method: 'GET' }, signal);
  }

  getIssues(projectId: string, signal?: AbortSignal): Promise<IssueDto[]> {
    const query = new URLSearchParams({ projectId }).toString();
    return this.request(`/api/issues?${query}`, { method: 'GET' }, signal);
  }

  getLabels(projectId: string, signal?: AbortSignal): Promise<LabelDto[]> {
    return this.request(`/api/projects/${projectId}/labels`, { method: 'GET' }, signal);
  }

  getComments(issueId: string, signal?: AbortSignal): Promise<CommentDto[]> {
    return this.request(`/api/issues/${issueId}/comments`, { method: 'GET' }, signal);
  }

  postComment(
    issueId: string,
    payload: { content: string; authorName?: string },
    signal?: AbortSignal
  ): Promise<CommentDto> {
    return this.request(
      `/api/issues/${issueId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      signal
    );
  }

  transitionIssue(
    issueId: string,
    payload: { toStage: IssueStage },
    signal?: AbortSignal
  ): Promise<IssueDto> {
    return this.request(
      `/api/issues/${issueId}/transition`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      signal
    );
  }

  updateIssueLabels(
    issueId: string,
    payload: { labelIds: string[] },
    signal?: AbortSignal
  ): Promise<IssueDto> {
    return this.request(
      `/api/issues/${issueId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      },
      signal
    );
  }
}

export const apiClient = new ApiClient(getApiBaseUrl());
