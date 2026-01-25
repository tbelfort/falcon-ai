import { http, HttpResponse } from 'msw';
import type { IssueStage } from '../api/types';
import { ISSUE_STAGES } from '../api/types';
import { createComment, getDb, updateIssueLabels, updateIssueStage } from './data';

export const handlers = [
  http.get('*/api/projects', () => {
    const db = getDb();
    return HttpResponse.json({ data: db.projects });
  }),

  http.get('*/api/issues', ({ request }) => {
    const db = getDb();
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return HttpResponse.json(
        { error: { code: 'missing_project', message: 'projectId is required' } },
        { status: 400 }
      );
    }
    const issues = db.issues.filter((issue) => issue.projectId === projectId);
    return HttpResponse.json({ data: issues });
  }),

  http.get('*/api/projects/:id/labels', ({ params }) => {
    const db = getDb();
    const labels = db.labels.filter((label) => label.projectId === params.id);
    return HttpResponse.json({ data: labels });
  }),

  http.get('*/api/issues/:id/comments', ({ params }) => {
    const db = getDb();
    const comments = db.comments.filter((comment) => comment.issueId === params.id);
    return HttpResponse.json({ data: comments });
  }),

  http.post('*/api/issues/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body.content) {
      return HttpResponse.json(
        { error: { code: 'invalid_comment', message: 'content is required' } },
        { status: 400 }
      );
    }
    const comment = createComment(String(params.id), body.content, body.authorName);
    return HttpResponse.json({ data: comment }, { status: 201 });
  }),

  http.post('*/api/issues/:id/transition', async ({ params, request }) => {
    const body = (await request.json()) as { toStage?: string };
    if (!body.toStage || !ISSUE_STAGES.includes(body.toStage as (typeof ISSUE_STAGES)[number])) {
      return HttpResponse.json(
        { error: { code: 'invalid_stage', message: 'toStage is invalid' } },
        { status: 400 }
      );
    }

    const db = getDb();
    const issue = db.issues.find((item) => item.id === params.id);
    if (!issue) {
      return HttpResponse.json(
        { error: { code: 'not_found', message: 'Issue not found' } },
        { status: 404 }
      );
    }

    if (body.toStage === 'DONE' && issue.stage !== 'MERGE_READY') {
      return HttpResponse.json(
        {
          error: {
            code: 'invalid_transition',
            message: 'Cannot move to DONE before MERGE_READY',
          },
        },
        { status: 422 }
      );
    }

    const updated = updateIssueStage(String(params.id), body.toStage as IssueStage);
    if (!updated) {
      return HttpResponse.json(
        { error: { code: 'not_found', message: 'Issue not found' } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ data: updated });
  }),

  http.patch('*/api/issues/:id', async ({ params, request }) => {
    const body = (await request.json()) as { labelIds?: string[] };
    if (!Array.isArray(body.labelIds)) {
      return HttpResponse.json(
        { error: { code: 'invalid_labels', message: 'labelIds must be an array' } },
        { status: 400 }
      );
    }
    const updated = updateIssueLabels(String(params.id), body.labelIds);
    if (!updated) {
      return HttpResponse.json(
        { error: { code: 'not_found', message: 'Issue not found' } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ data: updated });
  }),
];
