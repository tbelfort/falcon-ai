import { http, HttpResponse } from 'msw';
import type { ApiResponse, IssueStage } from '@/api/types';
import {
  addComment,
  createPreset,
  getOrchestratorStatus,
  listComments,
  listFindings,
  listIssues,
  listLabels,
  listPresets,
  listProjects,
  moveIssue,
  removePreset,
  reviewFinding,
  updateIssueLabels,
  updatePreset,
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

  http.get('/api/orchestrator/status', () => success(getOrchestratorStatus())),

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
    const body = (await request.json()) as {
      content?: string;
      authorType?: 'human' | 'agent';
      authorName?: string;
    };
    if (!body.content) {
      return failure('missing_content', 'content is required');
    }
    const comment = addComment(issueId, body.content, body.authorType, body.authorName);
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

  http.get('/api/issues/:issueId/findings', ({ params }) => {
    const issueId = params.issueId as string;
    const findings = listFindings(issueId);
    if (!findings) {
      return failure('findings_not_found', 'Findings not found', 404);
    }
    return success(findings);
  }),

  http.post('/api/findings/:id/review', async ({ params, request }) => {
    const findingId = params.id as string;
    const body = (await request.json()) as { status?: string; comment?: string };
    if (!body.status) {
      return failure('missing_status', 'status is required');
    }
    if (!['approved', 'dismissed', 'pending'].includes(body.status)) {
      return failure('invalid_status', 'status is invalid');
    }
    const updated = reviewFinding(findingId, body.status as any);
    if (!updated) {
      return failure('finding_not_found', 'Finding not found', 404);
    }
    return success(updated);
  }),

  http.post('/api/issues/:issueId/launch-fixer', () => success(null)),

  http.get('/api/presets', () => success(listPresets())),

  http.post('/api/presets', async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      config?: unknown;
      description?: string | null;
      isDefault?: boolean;
    };
    if (!body.name || !body.config) {
      return failure('missing_fields', 'name and config are required');
    }
    const created = createPreset({
      name: body.name,
      config: body.config as any,
      description: body.description ?? null,
      isDefault: body.isDefault ?? false,
    });
    return success(created);
  }),

  http.patch('/api/presets/:id', async ({ params, request }) => {
    const presetId = params.id as string;
    const body = (await request.json()) as {
      name?: string;
      config?: unknown;
      description?: string | null;
      isDefault?: boolean;
    };
    const updated = updatePreset(presetId, body as any);
    if (!updated) {
      return failure('preset_not_found', 'Preset not found', 404);
    }
    return success(updated);
  }),

  http.delete('/api/presets/:id', ({ params }) => {
    const presetId = params.id as string;
    const removed = removePreset(presetId);
    if (!removed) {
      return failure('preset_not_found', 'Preset not found', 404);
    }
    return success({ id: presetId });
  }),
];
