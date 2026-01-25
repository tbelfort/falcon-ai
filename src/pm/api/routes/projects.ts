import { Router } from 'express';
import { z } from 'zod';
import { createError } from '../../core/errors.js';
import type { PmServices } from '../../core/services/index.js';
import { broadcastEvents, type WsBroadcaster } from '../broadcast.js';
import { sendError } from '../http-errors.js';
import { sendSuccess } from '../response.js';

const createProjectSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  repoUrl: z.string().min(1).nullable().optional(),
  defaultBranch: z.string().min(1).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  repoUrl: z.string().min(1).nullable().optional(),
  defaultBranch: z.string().min(1).optional(),
  config: z.unknown().optional(),
});

export function createProjectsRouter(
  services: PmServices,
  broadcaster: WsBroadcaster
) {
  const router = Router();

  router.get('/', (_req, res) => {
    const result = services.projects.listProjects();
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.post('/', (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid project payload', parsed.error.flatten())
      );
    }

    const input = {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      repoUrl: parsed.data.repoUrl ?? null,
      defaultBranch: parsed.data.defaultBranch ?? 'main',
    };

    const result = services.projects.createProject(input);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.get('/:id', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.projects.getProject(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    return sendSuccess(res, result.value);
  });

  router.patch('/:id', (req, res) => {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'Invalid project payload', parsed.error.flatten())
      );
    }

    const hasUpdates = Object.values(parsed.data).some((value) => value !== undefined);
    if (!hasUpdates) {
      return sendError(
        res,
        createError('VALIDATION_ERROR', 'No project fields provided')
      );
    }

    const params = req.params as Record<string, string>;
    const result = services.projects.updateProject(params.id, parsed.data);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  router.delete('/:id', (req, res) => {
    const params = req.params as Record<string, string>;
    const result = services.projects.deleteProject(params.id);
    if (!result.ok) {
      return sendError(res, result.error);
    }

    broadcastEvents(broadcaster, result.events);
    return sendSuccess(res, result.value);
  });

  return router;
}
