import { Router } from 'express';
import { z } from 'zod';

import type { Services } from '../../core/services/index.js';
import type { BroadcastFn } from '../websocket.js';
import { sendResult, sendValidationError } from '../response.js';
import { buildEventPayload } from '../events.js';

const commentCreateSchema = z.object({
  content: z.string().min(1),
  authorType: z.enum(['agent', 'human']),
  authorName: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
});

export function createCommentsRouter({
  services,
  broadcast,
}: {
  services: Services;
  broadcast: BroadcastFn;
}): Router {
  const router = Router();

  router.get('/issues/:id/comments', async (req, res) => {
    const result = await services.comments.listByIssue(req.params.id);
    sendResult(res, result);
  });

  router.post('/issues/:id/comments', async (req, res) => {
    const parsed = commentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid comment payload.', parsed.error.flatten());
      return;
    }

    const result = await services.comments.create(req.params.id, parsed.data);
    if (result.ok) {
      const issueResult = await services.issues.getById(req.params.id);
      if (issueResult.ok) {
        const payload = buildEventPayload(
          'comment.created',
          issueResult.value.projectId,
          result.value,
          issueResult.value.id
        );
        broadcast(
          `project:${issueResult.value.projectId}`,
          'comment.created',
          payload
        );
        broadcast(
          `issue:${issueResult.value.id}`,
          'comment.created',
          payload
        );
      }
    }
    sendResult(res, result);
  });

  return router;
}
