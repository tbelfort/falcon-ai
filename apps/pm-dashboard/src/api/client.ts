import type {
  ApiErrorPayload,
  ApiResponse,
  CommentDto,
  IssueDto,
  IssueStage,
  LabelDto,
  ProjectDto,
} from './types';

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.details = payload.details;
  }
}

function resolveUrl(path: string) {
  if (baseUrl) {
    return `${baseUrl}${path}`;
  }
  const origin = window.location.origin === 'null' ? 'http://localhost' : window.location.origin;
  return new URL(path, origin).toString();
}

function normalizeInit(init?: RequestInit) {
  if (!init?.signal) {
    return init;
  }
  if (import.meta.env.MODE === 'test') {
    const { signal, ...rest } = init;
    return rest;
  }
  return init;
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(resolveUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...normalizeInit(init),
  });

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    if (!response.ok) {
      throw new ApiError({ code: 'invalid_response', message: 'Invalid response' });
    }
  }

  if (payload && 'error' in payload) {
    throw new ApiError(payload.error);
  }

  if (!payload) {
    throw new ApiError({ code: 'missing_payload', message: 'Missing response payload' });
  }

  return payload.data;
}

export async function fetchProjects(signal?: AbortSignal) {
  return request<ProjectDto[]>('/api/projects', { signal });
}

export async function fetchIssues(projectId: string, signal?: AbortSignal) {
  return request<IssueDto[]>(`/api/issues?projectId=${encodeURIComponent(projectId)}`, { signal });
}

export async function fetchLabels(projectId: string, signal?: AbortSignal) {
  return request<LabelDto[]>(`/api/projects/${projectId}/labels`, { signal });
}

export async function fetchComments(issueId: string) {
  return request<CommentDto[]>(`/api/issues/${issueId}/comments`);
}

export async function postComment(issueId: string, content: string, authorName?: string) {
  return request<CommentDto>(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, authorName }),
  });
}

export async function transitionIssue(issueId: string, toStage: IssueStage) {
  return request<IssueDto>(`/api/issues/${issueId}/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStage }),
  });
}

export async function updateIssueLabels(issueId: string, labelIds: string[]) {
  return request<IssueDto>(`/api/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ labelIds }),
  });
}
