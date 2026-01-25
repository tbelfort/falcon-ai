import { Router } from 'express';
import { z } from 'zod';

import type { Services } from '../../core/services/index.js';
import type { IssueStage } from '../../core/types.js';
import type { BroadcastFn } from '../websocket.js';
import { sendResult, sendValidationError } from '../response.js';
import { buildEventPayload } from '../events.js';

const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const ISSUE_STAGES = [
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
 ] as const;

const issueCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  priority: z.enum(ISSUE_PRIORITIES),
});

const issueUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  labelIds: z.array(z.string().min(1)).optional(),
});

const issueStartSchema = z.object({
  presetId: z.string().min(1),
});

const issueTransitionSchema = z.object({
  toStage: z.enum(ISSUE_STAGES),
});

export function createIssuesRouter({
  services,
  broadcast,
}: {
  services: Services;
  broadcast: BroadcastFn;
}): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const projectId = req.query.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      sendValidationError(res, 'projectId query param is required.');
      return;
    }

    const result = await services.issues.listByProject(projectId);
    sendResult(res, result);
  });

  router.post('/', async (req, res) => {
    const parsed = issueCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid issue payload.', parsed.error.flatten());
      return;
    }

    const result = await services.issues.create(parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'issue.created',
        result.value.projectId,
        result.value,
        result.value.id
      );
      broadcast(`project:${result.value.projectId}`, 'issue.created', payload);
      broadcast(`issue:${result.value.id}`, 'issue.created', payload);
    }
    sendResult(res, result);
  });

  router.get('/:id', async (req, res) => {
    const result = await services.issues.getById(req.params.id);
    sendResult(res, result);
  });

  router.patch('/:id', async (req, res) => {
    const parsed = issueUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid issue payload.', parsed.error.flatten());
      return;
    }

    const result = await services.issues.update(req.params.id, parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'issue.updated',
        result.value.projectId,
        result.value,
        result.value.id
      );
      broadcast(`project:${result.value.projectId}`, 'issue.updated', payload);
      broadcast(`issue:${result.value.id}`, 'issue.updated', payload);
    }
    sendResult(res, result);
  });

  router.post('/:id/start', async (req, res) => {
    const parsed = issueStartSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid issue payload.', parsed.error.flatten());
      return;
    }

    const result = await services.issues.start(req.params.id, parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'issue.updated',
        result.value.issue.projectId,
        result.value.issue,
        result.value.issue.id
      );
      broadcast(
        `project:${result.value.issue.projectId}`,
        'issue.updated',
        payload
      );
      broadcast(`issue:${result.value.issue.id}`, 'issue.updated', payload);
    }
    sendResult(res, result);
  });

  router.post('/:id/transition', async (req, res) => {
    const parsed = issueTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid issue payload.', parsed.error.flatten());
      return;
    }

    const result = await services.issues.transition(
      req.params.id,
      parsed.data.toStage as IssueStage
    );
    if (result.ok) {
      const payload = buildEventPayload(
        'issue.updated',
        result.value.projectId,
        result.value,
        result.value.id
      );
      broadcast(`project:${result.value.projectId}`, 'issue.updated', payload);
      broadcast(`issue:${result.value.id}`, 'issue.updated', payload);
    }
    sendResult(res, result);
  });

  return router;
}
