import { http, HttpResponse } from 'msw';
import { mockDb } from './data';
import type { IssueStage } from '../types';

function ok<T>(data: T) {
  return HttpResponse.json({ data });
}

function fail(code: string, message: string, status = 400) {
  return HttpResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

export const handlers = [
  http.get('*/api/projects', () => {
    return ok(mockDb.getProjects());
  }),

  http.get('*/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return fail('INVALID_REQUEST', 'projectId is required', 400);
    }
    return ok(mockDb.getIssues(projectId));
  }),

  http.get('*/api/projects/:id/labels', ({ params }) => {
    const projectId = params.id as string;
    return ok(mockDb.getLabels(projectId));
  }),

  http.get('*/api/issues/:id/comments', ({ params }) => {
    const issueId = params.id as string;
    return ok(mockDb.getComments(issueId));
  }),

  http.post('*/api/issues/:id/comments', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body?.content) {
      return fail('INVALID_REQUEST', 'content is required', 400);
    }
    return ok(mockDb.addComment(issueId, body.content, body.authorName));
  }),

  http.post('*/api/issues/:id/transition', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { toStage?: IssueStage };
    if (!body?.toStage) {
      return fail('INVALID_REQUEST', 'toStage is required', 400);
    }
    const result = mockDb.transitionIssue(issueId, body.toStage);
    if ('error' in result) {
      const status = result.error.code === 'NOT_FOUND' ? 404 : 422;
      return fail(result.error.code, result.error.message, status);
    }
    return ok(result);
  }),

  http.patch('*/api/issues/:id', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { labelIds?: string[] };
    if (!body?.labelIds) {
      return fail('INVALID_REQUEST', 'labelIds is required', 400);
    }
    const result = mockDb.updateIssueLabels(issueId, body.labelIds);
    if ('error' in result) {
      return fail(result.error.code, result.error.message, 404);
    }
    return ok(result);
  })
];
