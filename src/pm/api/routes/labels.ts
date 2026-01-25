import { Router } from 'express';
import { z } from 'zod';

import type { Services } from '../../core/services/index.js';
import type { BroadcastFn } from '../websocket.js';
import { sendResult, sendValidationError } from '../response.js';
import { buildEventPayload } from '../events.js';

const labelCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  isBuiltin: z.boolean().optional(),
});

export function createLabelsRouter({
  services,
  broadcast,
}: {
  services: Services;
  broadcast: BroadcastFn;
}): Router {
  const router = Router();

  router.get('/projects/:id/labels', async (req, res) => {
    const result = await services.labels.listByProject(req.params.id);
    sendResult(res, result);
  });

  router.post('/projects/:id/labels', async (req, res) => {
    const parsed = labelCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid label payload.', parsed.error.flatten());
      return;
    }

    const result = await services.labels.create(req.params.id, parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'label.created',
        result.value.projectId,
        result.value
      );
      broadcast(`project:${result.value.projectId}`, 'label.created', payload);
    }
    sendResult(res, result);
  });

  return router;
}
