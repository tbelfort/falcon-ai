import { Router } from 'express';
import { z } from 'zod';

import type { Services } from '../../core/services/index.js';
import type { BroadcastFn } from '../websocket.js';
import { sendResult, sendValidationError } from '../response.js';
import { buildEventPayload } from '../events.js';

const projectCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  repoUrl: z.string().url().nullable().optional(),
  defaultBranch: z.string().min(1),
  config: z.unknown().optional(),
});

const projectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  repoUrl: z.string().url().nullable().optional(),
  defaultBranch: z.string().min(1).optional(),
  config: z.unknown().optional(),
});

export function createProjectsRouter({
  services,
  broadcast,
}: {
  services: Services;
  broadcast: BroadcastFn;
}): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const result = await services.projects.list();
    sendResult(res, result);
  });

  router.post('/', async (req, res) => {
    const parsed = projectCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid project payload.', parsed.error.flatten());
      return;
    }

    const result = await services.projects.create(parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'project.created',
        result.value.id,
        result.value
      );
      broadcast(`project:${result.value.id}`, 'project.created', payload);
    }
    sendResult(res, result);
  });

  router.get('/:id', async (req, res) => {
    const result = await services.projects.getById(req.params.id);
    sendResult(res, result);
  });

  router.patch('/:id', async (req, res) => {
    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, 'Invalid project payload.', parsed.error.flatten());
      return;
    }

    const result = await services.projects.update(req.params.id, parsed.data);
    if (result.ok) {
      const payload = buildEventPayload(
        'project.updated',
        result.value.id,
        result.value
      );
      broadcast(`project:${result.value.id}`, 'project.updated', payload);
    }
    sendResult(res, result);
  });

  router.delete('/:id', async (req, res) => {
    const result = await services.projects.delete(req.params.id);
    if (result.ok) {
      const payload = buildEventPayload(
        'project.deleted',
        result.value.id,
        result.value
      );
      broadcast(`project:${result.value.id}`, 'project.deleted', payload);
    }
    sendResult(res, result);
  });

  return router;
}
