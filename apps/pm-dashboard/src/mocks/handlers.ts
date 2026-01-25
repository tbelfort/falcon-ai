import { http, HttpResponse } from 'msw';
import type { IssueStage } from '../api/types';
import {
  mockProject,
  mockIssues,
  mockLabels,
  mockComments,
  isValidTransition,
} from './data';

// In-memory state for mock mutations
let issues = [...mockIssues];
let comments = [...mockComments];
let nextCommentId = 4;

export const handlers = [
  // GET /api/projects
  http.get('/api/projects', () => {
    return HttpResponse.json({ data: [mockProject] });
  }),

  // GET /api/issues?projectId=<id>
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const filtered = projectId
      ? issues.filter((i) => i.projectId === projectId)
      : issues;
    return HttpResponse.json({ data: filtered });
  }),

  // GET /api/projects/:id/labels
  http.get('/api/projects/:id/labels', ({ params }) => {
    const projectId = params.id as string;
    const filtered = mockLabels.filter((l) => l.projectId === projectId);
    return HttpResponse.json({ data: filtered });
  }),

  // GET /api/issues/:id/comments
  http.get('/api/issues/:id/comments', ({ params }) => {
    const issueId = params.id as string;
    const filtered = comments.filter((c) => c.issueId === issueId);
    return HttpResponse.json({ data: filtered });
  }),

  // POST /api/issues/:id/comments
  http.post('/api/issues/:id/comments', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { content: string; authorName?: string };

    const issue = issues.find((i) => i.id === issueId);
    if (!issue) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Issue not found' } },
        { status: 404 }
      );
    }

    const newComment = {
      id: `cmt-${nextCommentId++}`,
      issueId,
      content: body.content,
      authorType: 'human' as const,
      authorName: body.authorName || 'Anonymous',
      createdAt: Date.now(),
    };

    comments.push(newComment);
    return HttpResponse.json({ data: newComment });
  }),

  // POST /api/issues/:id/transition
  http.post('/api/issues/:id/transition', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { toStage: IssueStage };

    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Issue not found' } },
        { status: 404 }
      );
    }

    const issue = issues[issueIndex];
    if (!isValidTransition(issue.stage, body.toStage)) {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot transition from ${issue.stage} to ${body.toStage}`,
          },
        },
        { status: 400 }
      );
    }

    const updatedIssue = { ...issue, stage: body.toStage };
    issues[issueIndex] = updatedIssue;
    return HttpResponse.json({ data: updatedIssue });
  }),

  // PATCH /api/issues/:id
  http.patch('/api/issues/:id', async ({ params, request }) => {
    const issueId = params.id as string;
    const body = (await request.json()) as { labelIds?: string[] };

    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Issue not found' } },
        { status: 404 }
      );
    }

    const issue = issues[issueIndex];
    let updatedIssue = { ...issue };

    if (body.labelIds !== undefined) {
      const newLabels = mockLabels.filter((l) => body.labelIds!.includes(l.id));
      updatedIssue = { ...updatedIssue, labels: newLabels };
    }

    issues[issueIndex] = updatedIssue;
    return HttpResponse.json({ data: updatedIssue });
  }),
];

// Reset function for tests
export function resetMockData() {
  issues = [...mockIssues];
  comments = [...mockComments];
  nextCommentId = 4;
}
