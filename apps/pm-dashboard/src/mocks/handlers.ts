import { http, HttpResponse } from 'msw';
import type { ApiResponse, IssueStage } from '@/api/types';
import {
  addComment,
  listComments,
  listIssues,
  listLabels,
  listProjects,
  moveIssue,
  updateIssueLabels,
} from './data';

function success<T>(data: T) {
  const body: ApiResponse<T> = { data };
  return HttpResponse.json(body);
}

function failure(code: string, message: string, status = 400, details?: unknown) {
  const body: ApiResponse<never> = { error: { code, message, details } };
  return HttpResponse.json(body, { status });
}

export const handlers = [
  http.get('/api/projects', () => success(listProjects())),

  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return failure('missing_project_id', 'projectId is required');
    }
    return success(listIssues(projectId));
  }),

  http.get('/api/projects/:id/labels', ({ params }) => {
    const projectId = params.id as string;
    return success(listLabels(projectId));
  }),

  http.get('/api/issues/:id/comments', ({ params }) => {
    const issueId = params.id as string;
    return success(listComments(issueId));
  }),

  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body.content) {
      return failure('missing_content', 'content is required');
    }
    const comment = addComment(issueId, body.content, body.authorName);
    return success(comment);
  }),

  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { toStage?: IssueStage };
    if (!body.toStage) {
      return failure('missing_stage', 'toStage is required');
    }
    const updated = moveIssue(issueId, body.toStage);
    if (!updated) {
      return failure('issue_not_found', 'Issue not found', 404);
    }
    return success(updated);
  }),

  http.patch('/api/issues/:id', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { labelIds?: string[] };
    if (!body.labelIds) {
      return failure('missing_label_ids', 'labelIds is required');
    }
    const updated = updateIssueLabels(issueId, body.labelIds);
    if (!updated) {
      return failure('issue_not_found', 'Issue not found', 404);
    }
    return success(updated);
  }),
];
