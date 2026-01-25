import { http, HttpResponse } from 'msw';
import { getDb, createComment, updateIssueLabels, updateIssueStage } from './data';
import { IssueStage } from '../api/types';

function ok<T>(data: T, init?: ResponseInit) {
  return HttpResponse.json({ data }, init);
}

function error(code: string, message: string, init?: ResponseInit, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, init);
}

function isIssueStage(value: string): value is IssueStage {
  return (
    value === 'BACKLOG' ||
    value === 'TODO' ||
    value === 'CONTEXT_PACK' ||
    value === 'CONTEXT_REVIEW' ||
    value === 'SPEC' ||
    value === 'SPEC_REVIEW' ||
    value === 'IMPLEMENT' ||
    value === 'PR_REVIEW' ||
    value === 'PR_HUMAN_REVIEW' ||
    value === 'FIXER' ||
    value === 'TESTING' ||
    value === 'DOC_REVIEW' ||
    value === 'MERGE_READY' ||
    value === 'DONE'
  );
}

export const handlers = [
  http.get('/api/projects', () => {
    const db = getDb();
    return ok(db.projects);
  }),
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return error('missing_project', 'projectId is required', { status: 400 });
    }
    const db = getDb();
    return ok(db.issues.filter((issue) => issue.projectId === projectId));
  }),
  http.get('/api/projects/:id/labels', ({ params }) => {
    const { id } = params;
    const db = getDb();
    return ok(db.labels.filter((label) => label.projectId === id));
  }),
  http.get('/api/issues/:id/comments', ({ params }) => {
    const { id } = params;
    const db = getDb();
    const comments = db.comments
      .filter((comment) => comment.issueId === id)
      .sort((a, b) => a.createdAt - b.createdAt);
    return ok(comments);
  }),
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body.content || !body.content.trim()) {
      return error('invalid_comment', 'content is required', { status: 400 });
    }
    const comment = createComment(id as string, body.content, body.authorName);
    return ok(comment, { status: 201 });
  }),
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { toStage?: string };
    if (!body.toStage || !isIssueStage(body.toStage)) {
      return error('invalid_stage', 'toStage is invalid', { status: 400 });
    }
    const updated = updateIssueStage(id as string, body.toStage);
    if (!updated) {
      return error('not_found', 'Issue not found', { status: 404 });
    }
    return ok(updated);
  }),
  http.patch('/api/issues/:id', async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { labelIds?: string[] };
    if (!body.labelIds) {
      return error('invalid_labels', 'labelIds is required', { status: 400 });
    }
    const updated = updateIssueLabels(id as string, body.labelIds);
    if (!updated) {
      return error('not_found', 'Issue not found', { status: 404 });
    }
    return ok(updated);
  })
];
