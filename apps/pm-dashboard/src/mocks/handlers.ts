import { http, HttpResponse } from 'msw';
import type { IssueStage } from '../types';
import {
  mockProjects,
  mockLabels,
  getIssues,
  getIssueById,
  updateIssueStage,
  updateIssueLabels,
  getCommentsByIssue,
  addCommentToIssue,
} from './data';

export const handlers = [
  // GET /api/projects
  http.get('/api/projects', () => {
    return HttpResponse.json({ data: mockProjects });
  }),

  // GET /api/issues?projectId=<id>
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const issues = getIssues().filter((i) => i.projectId === projectId);
    return HttpResponse.json({ data: issues });
  }),

  // GET /api/projects/:id/labels
  http.get('/api/projects/:id/labels', ({ params }) => {
    const { id } = params;
    const labels = mockLabels.filter((l) => l.projectId === id);
    return HttpResponse.json({ data: labels });
  }),

  // GET /api/issues/:id/comments
  http.get('/api/issues/:id/comments', ({ params }) => {
    const { id } = params as { id: string };
    const comments = getCommentsByIssue(id);
    return HttpResponse.json({ data: comments });
  }),

  // POST /api/issues/:id/comments
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const { id } = params as { id: string };
    const body = (await request.json()) as { content: string; authorName?: string };

    if (!body.content?.trim()) {
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

    const comment = addCommentToIssue(id, body.content, body.authorName);
    return HttpResponse.json({ data: comment }, { status: 201 });
  }),

  // POST /api/issues/:id/transition
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const { id } = params as { id: string };
    const body = (await request.json()) as { toStage: IssueStage };

    const issue = getIssueById(id);
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

    // Simple validation: only allow certain transitions (simplified for mock)
    const validStages: IssueStage[] = [
      'BACKLOG',
      'TODO',
      'CONTEXT_PACK',
      'CONTEXT_REVIEW',
      'SPEC',
      'SPEC_REVIEW',
      'IMPLEMENT',
      'PR_REVIEW',
      'PR_HUMAN_REVIEW',
      'FIXER',
      'TESTING',
      'DOC_REVIEW',
      'MERGE_READY',
      'DONE',
    ];

    if (!validStages.includes(body.toStage)) {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_TRANSITION',
            message: `Invalid stage: ${body.toStage}`,
          },
        },
        { status: 400 }
      );
    }

    const updated = updateIssueStage(id, body.toStage);
    return HttpResponse.json({ data: updated });
  }),

  // PATCH /api/issues/:id
  http.patch('/api/issues/:id', async ({ params, request }) => {
    const { id } = params as { id: string };
    const body = (await request.json()) as { labelIds?: string[] };

    const issue = getIssueById(id);
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

    if (body.labelIds) {
      const updated = updateIssueLabels(id, body.labelIds);
      return HttpResponse.json({ data: updated });
    }

    return HttpResponse.json({ data: issue });
  }),
];
