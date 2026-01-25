import { http, HttpResponse } from 'msw';
import type { IssueStage } from '../types';
import {
  mockProject,
  mockIssues,
  mockLabels,
  getCommentsForIssue,
  addMockComment,
  updateMockIssueStage,
  updateMockIssueLabels,
} from './data';

export const handlers = [
  // GET /api/projects
  http.get('/api/projects', () => {
    return HttpResponse.json({
      data: [mockProject],
    });
  }),

  // GET /api/issues?projectId=<id>
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    const issues = projectId
      ? mockIssues.filter((i) => i.projectId === projectId)
      : mockIssues;

    return HttpResponse.json({
      data: issues,
      meta: { total: issues.length },
    });
  }),

  // GET /api/projects/:id/labels
  http.get('/api/projects/:id/labels', ({ params }) => {
    const projectId = params.id as string;
    const labels = mockLabels.filter((l) => l.projectId === projectId);

    return HttpResponse.json({
      data: labels,
    });
  }),

  // GET /api/issues/:id/comments
  http.get('/api/issues/:id/comments', ({ params }) => {
    const issueId = params.id as string;
    const comments = getCommentsForIssue(issueId);

    return HttpResponse.json({
      data: comments,
    });
  }),

  // POST /api/issues/:id/comments
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { content: string; authorName?: string };

    if (!body.content || body.content.trim() === '') {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Content is required',
          },
        },
        { status: 400 }
      );
    }

    const comment = addMockComment(issueId, body.content, body.authorName);

    return HttpResponse.json({
      data: comment,
    });
  }),

  // POST /api/issues/:id/transition
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { toStage: IssueStage };

    const issue = updateMockIssueStage(issueId, body.toStage);

    if (!issue) {
      return HttpResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Issue not found',
          },
        },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      data: issue,
    });
  }),

  // PATCH /api/issues/:id
  http.patch('/api/issues/:id', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { labelIds: string[] };

    const issue = updateMockIssueLabels(issueId, body.labelIds);

    if (!issue) {
      return HttpResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Issue not found',
          },
        },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      data: issue,
    });
  }),
];
