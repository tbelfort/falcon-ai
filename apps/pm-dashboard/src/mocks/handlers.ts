import { http, HttpResponse } from 'msw';
import {
  addComment,
  isValidLabelIds,
  listComments,
  listIssues,
  listLabels,
  listProjects,
  mockControl,
  transitionIssue,
  updateIssueLabels
} from './data';
import type { IssueStage } from '../types';

function jsonError(code: string, message: string, status = 400, details?: unknown) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        details
      }
    },
    { status }
  );
}

export const handlers = [
  http.get('/api/projects', () => {
    return HttpResponse.json({ data: listProjects() });
  }),
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return jsonError('MISSING_PROJECT', 'projectId is required');
    }
    return HttpResponse.json({ data: listIssues(projectId) });
  }),
  http.get('/api/projects/:id/labels', ({ params }) => {
    return HttpResponse.json({ data: listLabels(params.id as string) });
  }),
  http.get('/api/issues/:id/comments', ({ params }) => {
    return HttpResponse.json({ data: listComments(params.id as string) });
  }),
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body.content) {
      return jsonError('INVALID_COMMENT', 'content is required');
    }
    const comment = addComment(params.id as string, body.content, body.authorName);
    return HttpResponse.json({ data: comment });
  }),
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const body = (await request.json()) as { toStage?: IssueStage };
    if (!body.toStage) {
      return jsonError('INVALID_STAGE', 'toStage is required');
    }
    const issueId = params.id as string;
    if (mockControl.transitionErrors.has(issueId)) {
      return jsonError('INVALID_TRANSITION', 'Transition blocked by policy');
    }
    const updated = transitionIssue(issueId, body.toStage);
    if (!updated) {
      return jsonError('NOT_FOUND', 'Issue not found', 404);
    }
    return HttpResponse.json({ data: updated });
  }),
  http.patch('/api/issues/:id', async ({ params, request }) => {
    const body = (await request.json()) as { labelIds?: string[] };
    if (!body.labelIds) {
      return jsonError('INVALID_LABELS', 'labelIds is required');
    }
    const issueId = params.id as string;
    const issue = listIssues(listProjects()[0].id).find((item) => item.id === issueId);
    if (!issue) {
      return jsonError('NOT_FOUND', 'Issue not found', 404);
    }
    if (!isValidLabelIds(issue.projectId, body.labelIds)) {
      return jsonError('INVALID_LABELS', 'One or more labels are invalid');
    }
    const updated = updateIssueLabels(issueId, body.labelIds);
    if (!updated) {
      return jsonError('NOT_FOUND', 'Issue not found', 404);
    }
    return HttpResponse.json({ data: updated });
  })
];
