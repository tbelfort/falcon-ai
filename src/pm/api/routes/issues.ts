import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../core/errors.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcastEvents, type WsBroadcaster } from '../broadcast.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';

const issuePrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const issueStageSchema = z.enum([
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
]);

const createIssueSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  priority: issuePrioritySchema.optional(),
});

const updateIssueSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  priority: issuePrioritySchema.optional(),
  labelIds: z.array(z.string().min(1)).optional(),
});

const startIssueSchema = z.object({
  presetId: z.string().min(1),
});

const transitionIssueSchema = z.object({
  toStage: issueStageSchema,
});

export function createIssuesRouter(
  services: PmServices,
  broadcaster: WsBroadcaster
) {
  const router = Router();

  router.get('/', (req, res) => {
    const projectId = req.query.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'projectId query parameter is required')
      );
    }

    const result = services.issues.listByProject(projectId);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/', (req, res) => {
    const parsed = createIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid issue payload', parsed.error.flatten())
      );
    }

    const input = {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority ?? 'medium',
    };

    const result = services.issues.createIssue(input);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.get('/:id', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.issues.getIssue(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.patch('/:id', (req, res) => {
    const parsed = updateIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid issue payload', parsed.error.flatten())
      );
    }

    const hasUpdates = Object.values(parsed.data).some((value) => value !== undefined);
    if (!hasUpdates) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'No issue fields provided')
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.issues.updateIssue(params.id, parsed.data);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.post('/:id/start', (req, res) => {
    const parsed = startIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid start payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.issues.startIssue(params.id, parsed.data);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.post('/:id/transition', (req, res) => {
    const parsed = transitionIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid transition payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.issues.transitionIssue(params.id, parsed.data);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.delete('/:id', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.issues.deleteIssue(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  return router;
}
