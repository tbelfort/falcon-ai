import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../core/errors.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcastEvents, type WsBroadcaster } from '../broadcast.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';
import { LIMITS } from '../validation.js';

const createCommentSchema = z.object({
  content: z.string().min(1).max(LIMITS.comment),
  authorType: z.enum(['agent', 'human']),
  authorName: z.string().min(1).max(LIMITS.authorName),
  parentId: z.string().min(1).max(LIMITS.id).nullable().optional(),
});

export function createCommentsRouter(
  services: PmServices,
  broadcaster: WsBroadcaster
) {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.comments.listByIssue(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/', (req, res) => {
    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid comment payload', parsed.error.flatten())
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.comments.createComment({
      issueId: params.id,
      content: parsed.data.content,
      authorType: parsed.data.authorType,
      authorName: parsed.data.authorName,
      parentId: parsed.data.parentId ?? null,
    });

    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  return router;
}
