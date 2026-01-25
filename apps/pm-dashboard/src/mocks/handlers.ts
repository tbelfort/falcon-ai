import { http, HttpResponse, delay } from 'msw';
import type { IssueStage } from '../api/types';
import { mockDb } from './data';

const ok = <T,>(data: T) => HttpResponse.json({ data });
const error = (code: string, message: string, status = 400, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

const findIssue = (issueId: string) => mockDb.issues.find((issue) => issue.id === issueId);

export const handlers = [
  http.get('/api/projects', async () => {
    await delay(150);
    return ok(mockDb.projects);
  }),
  http.get('/api/issues', async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return error('MISSING_PROJECT', 'projectId is required', 400);
    }
    return ok(mockDb.issues.filter((issue) => issue.projectId === projectId));
  }),
  http.get('/api/projects/:id/labels', async ({ params }) => {
    await delay(120);
    const projectId = params.id as string;
    const labels = mockDb.labels.filter((label) => label.projectId === projectId);
    return ok(labels);
  }),
  http.get('/api/issues/:id/comments', async ({ params }) => {
    await delay(120);
    const issueId = params.id as string;
    return ok(mockDb.comments.filter((comment) => comment.issueId === issueId));
  }),
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    await delay(120);
    const issueId = params.id as string;
    const issue = findIssue(issueId);
    if (!issue) {
      return error('NOT_FOUND', 'Issue not found', 404);
    }
    const body = (await request.json()) as { content?: string; authorName?: string };
    if (!body.content) {
      return error('VALIDATION_ERROR', 'content is required', 422);
    }
    const newComment = {
      id: `comment-${Date.now()}`,
      issueId,
      content: body.content,
      authorType: 'human' as const,
      authorName: body.authorName ?? 'Anonymous',
      createdAt: Date.now()
    };
    mockDb.setComments([...mockDb.comments, newComment]);
    return ok(newComment);
  }),
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    await delay(150);
    const issueId = params.id as string;
    const issue = findIssue(issueId);
    if (!issue) {
      return error('NOT_FOUND', 'Issue not found', 404);
    }
    const body = (await request.json()) as { toStage?: IssueStage };
    if (!body.toStage) {
      return error('VALIDATION_ERROR', 'toStage is required', 422);
    }
    const updated = { ...issue, stage: body.toStage };
    mockDb.setIssues(mockDb.issues.map((item) => (item.id === issueId ? updated : item)));
    return ok(updated);
  }),
  http.patch('/api/issues/:id', async ({ params, request }) => {
    await delay(120);
    const issueId = params.id as string;
    const issue = findIssue(issueId);
    if (!issue) {
      return error('NOT_FOUND', 'Issue not found', 404);
    }
    const body = (await request.json()) as { labelIds?: string[] };
    if (!body.labelIds) {
      return error('VALIDATION_ERROR', 'labelIds is required', 422);
    }
    const nextLabels = mockDb.labels.filter((label) => body.labelIds?.includes(label.id));
    const updated = { ...issue, labels: nextLabels };
    mockDb.setIssues(mockDb.issues.map((item) => (item.id === issueId ? updated : item)));
    return ok(updated);
  })
];
